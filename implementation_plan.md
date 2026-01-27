# VueSeq – Implementation Plan

> **VueSeq** (Vue Sequencer): A minimal, deterministic video renderer for Vue 3 + GSAP, inspired by Pellicule and Remotion.

---

## Executive Summary

This document specifies a **new project** that renders Vue components to video using **GSAP** as the animation engine, replacing Pellicule's custom `useFrame()` / `interpolate()` primitives.

### Verified Key Finding: Deterministic Rendering with GSAP

GSAP's API fully supports deterministic frame-by-frame rendering:

| API | Purpose |
|-----|---------|
| `gsap.globalTimeline.pause()` | Stops all animations from auto-playing |
| `gsap.globalTimeline.seek(time)` | Jumps playhead to exact time in seconds, applying all values **synchronously** |
| `gsap.ticker.lagSmoothing(0)` | Disables lag compensation (not strictly required when paused but good practice) |

The `seek()` method is immediate and deterministic—given the same time value, it produces the exact same DOM state every time. This is the foundation for frame-by-frame rendering.

### GSAP Licensing

GSAP is **free for commercial use** under the "No Charge" license (as of May 2025, following Webflow's acquisition of GreenSock). The only restriction is building a direct Webflow competitor.

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI (render.js)                         │
│  npx vueseq Video.vue -d 5s -o output.mp4                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Vite Dev Server                            │
│  Bundles Video.vue + injects runtime (gsap-video-runtime.js)   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Playwright (Chromium)                         │
│  For each frame:                                                │
│    1. page.evaluate() → window.__SEEK__(time)                  │
│    2. GSAP seeks global timeline to `time`                      │
│    3. page.screenshot() → frame-XXXXX.png                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FFmpeg Encoder                            │
│  ffmpeg -framerate 30 -i frame-%05d.png -c:v libx264 output.mp4│
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
vueseq/
├── bin/
│   └── cli.js                 # CLI entry point (npx vueseq)
├── src/
│   ├── runtime/
│   │   ├── gsap-bridge.js     # Browser-side: pauses GSAP, exposes __SEEK__
│   │   └── app-shell.vue      # Mounts user's Video.vue with proper setup
│   ├── bundler/
│   │   └── vite.js            # Creates Vite dev server for component
│   ├── renderer/
│   │   ├── render.js          # Frame-by-frame screenshot loop
│   │   └── encode.js          # FFmpeg encoding wrapper
│   └── index.js               # Public API exports
├── package.json
└── README.md
```

---

## Detailed Component Specifications

### 1. GSAP Bridge (Browser Runtime)

**File:** `src/runtime/gsap-bridge.js`

This script runs **inside the browser** (injected by Vite) and provides the deterministic time-control interface.

```javascript
// gsap-bridge.js - injected into the browser page
import gsap from 'gsap'

// 1. Pause all animations immediately
gsap.globalTimeline.pause()

// 2. Disable lag smoothing (optional but recommended)
gsap.ticker.lagSmoothing(0)

// 3. Expose seek function to Playwright
window.__VUESEQ_SEEK__ = (timeInSeconds) => {
  gsap.globalTimeline.seek(timeInSeconds, true) // suppressEvents = true
}

// 4. Signal ready state
window.__VUESEQ_READY__ = true

// 5. Store video config for external access
window.__VUESEQ_CONFIG__ = null
window.__VUESEQ_SET_CONFIG__ = (config) => {
  window.__VUESEQ_CONFIG__ = config
}
```

**Key Design Decisions:**
- `suppressEvents: true` (default) prevents callbacks from firing during seek—we only want the visual state
- We pause `globalTimeline` instead of individual timelines so ALL animations are frozen
- The user simply writes standard GSAP code; no special composables needed

### 2. App Shell Component

**File:** `src/runtime/app-shell.vue`

Wraps the user's Video.vue component and initializes the GSAP bridge.

```vue
<script setup>
import { onMounted } from 'vue'
import './gsap-bridge.js'

// Props passed via URL query params
const props = defineProps({
  fps: { type: Number, default: 30 },
  duration: { type: Number, required: true }, // in seconds
  width: { type: Number, default: 1920 },
  height: { type: Number, default: 1080 }
})

onMounted(() => {
  window.__VUESEQ_SET_CONFIG__({
    fps: props.fps,
    duration: props.duration,
    width: props.width,
    height: props.height
  })
})
</script>

<template>
  <div class="vueseq-container" :style="{ width: `${width}px`, height: `${height}px` }">
    <!-- User's Video.vue is imported dynamically -->
    <slot />
  </div>
</template>

<style>
.vueseq-container {
  overflow: hidden;
  position: relative;
}
</style>
```

### 3. Vite Bundler

**File:** `src/bundler/vite.js`

Creates a temporary Vite dev server that:
1. Serves the user's Video.vue component
2. Injects the GSAP bridge runtime
3. Provides an entry HTML file

```javascript
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'

export async function createVideoServer({ input, width, height }) {
  // Create temp directory for build artifacts
  const tempDir = await mkdtemp(resolve(tmpdir(), 'vueseq-'))
  
  // Generate entry HTML
  const entryHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
      </style>
    </head>
    <body>
      <div id="app"></div>
      <script type="module" src="/@vueseq/entry.js"></script>
    </body>
    </html>
  `
  await writeFile(resolve(tempDir, 'index.html'), entryHtml)

  // Virtual module for entry point
  const virtualEntryPlugin = {
    name: 'vueseq-entry',
    resolveId(id) {
      if (id === '/@vueseq/entry.js') return id
    },
    load(id) {
      if (id === '/@vueseq/entry.js') {
        return `
          import { createApp } from 'vue'
          import './gsap-bridge.js'
          import Video from '${input}'
          
          const app = createApp(Video)
          app.mount('#app')
          
          window.__VUESEQ_READY__ = true
        `
      }
    }
  }

  const server = await createServer({
    root: tempDir,
    plugins: [vue(), virtualEntryPlugin],
    server: { port: 0 }, // Auto-assign port
    optimizeDeps: {
      include: ['gsap', 'vue']
    }
  })

  await server.listen()
  const address = server.httpServer.address()
  const url = `http://localhost:${address.port}`

  return {
    url,
    tempDir,
    cleanup: async () => {
      await server.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}
```

### 4. Frame Renderer

**File:** `src/renderer/render.js`

The core rendering loop that captures each frame.

```javascript
import { chromium } from 'playwright'
import { createVideoServer } from '../bundler/vite.js'
import { mkdir } from 'fs/promises'
import { join } from 'path'

export async function renderFrames(options) {
  const {
    input,
    fps = 30,
    duration,        // in seconds
    width = 1920,
    height = 1080,
    onProgress
  } = options

  const totalFrames = Math.ceil(duration * fps)
  
  // Start Vite server
  const { url, tempDir, cleanup } = await createVideoServer({ input, width, height })
  
  const framesDir = join(tempDir, 'frames')
  await mkdir(framesDir, { recursive: true })

  // Launch browser
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1
  })
  const page = await context.newPage()

  try {
    // Load page with config
    await page.goto(`${url}?fps=${fps}&duration=${duration}&width=${width}&height=${height}`)
    
    // Wait for VueSeq bridge to be ready
    await page.waitForFunction(() => window.__VUESEQ_READY__ === true, { timeout: 10000 })

    // Render each frame
    for (let frame = 0; frame < totalFrames; frame++) {
      const timeInSeconds = frame / fps
      
      // Seek GSAP to exact time
      await page.evaluate((t) => window.__VUESEQ_SEEK__(t), timeInSeconds)
      
      // Take screenshot
      const framePath = join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`)
      await page.screenshot({ path: framePath })

      // Progress callback
      if (onProgress) {
        onProgress({ frame, total: totalFrames, timeInSeconds })
      }
    }
  } finally {
    await browser.close()
  }

  return { framesDir, totalFrames, cleanup }
}
```

### 5. FFmpeg Encoder

**File:** `src/renderer/encode.js`

Encodes PNG frames to MP4 (identical to Pellicule's approach).

```javascript
import { spawn } from 'child_process'
import { join } from 'path'

export function encodeVideo({ framesDir, output, fps = 30 }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', join(framesDir, 'frame-%05d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      output
    ]

    const ffmpeg = spawn('ffmpeg', args)
    
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`FFmpeg exited with code ${code}`))
    })
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}. Is FFmpeg installed?`))
    })
  })
}

export async function renderToMp4(options) {
  const { renderFrames } = await import('./render.js')
  const { output = './output.mp4', ...renderOptions } = options
  
  const { framesDir, cleanup } = await renderFrames(renderOptions)
  
  try {
    await encodeVideo({ framesDir, output, fps: renderOptions.fps })
    return output
  } finally {
    await cleanup()
  }
}
```

### 6. CLI

**File:** `bin/cli.js`

Simple CLI interface.

```javascript
#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { renderToMp4 } from '../src/renderer/encode.js'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: 'string', short: 'o', default: './output.mp4' },
    duration: { type: 'string', short: 'd', default: '3' }, // seconds
    fps: { type: 'string', short: 'f', default: '30' },
    width: { type: 'string', short: 'w', default: '1920' },
    height: { type: 'string', short: 'h', default: '1080' },
    help: { type: 'boolean' }
  }
})

if (values.help) {
  console.log(`
VueSeq - Render Vue + GSAP components to video

USAGE:
  vueseq <Video.vue> [options]

OPTIONS:
  -o, --output   Output file (default: ./output.mp4)
  -d, --duration Duration in seconds (default: 3)
  -f, --fps      Frames per second (default: 30)
  -w, --width    Video width (default: 1920)
  -h, --height   Video height (default: 1080)

EXAMPLE:
  vueseq MyAnimation.vue -d 5 -o my-video.mp4
`)
  process.exit(0)
}

const input = positionals[0]
if (!input) {
  console.error('Error: Please specify a .vue file')
  process.exit(1)
}

const inputPath = resolve(input)
if (!existsSync(inputPath) || extname(inputPath) !== '.vue') {
  console.error('Error: Input must be an existing .vue file')
  process.exit(1)
}

await renderToMp4({
  input: inputPath,
  duration: parseFloat(values.duration),
  fps: parseInt(values.fps),
  width: parseInt(values.width),
  height: parseInt(values.height),
  output: values.output,
  onProgress: ({ frame, total }) => {
    const percent = Math.round((frame / total) * 100)
    process.stdout.write(`\rRendering: ${percent}% (${frame}/${total})`)
  }
})

console.log(`\n✓ Video saved to ${values.output}`)
```

---

## User-Facing API: How to Write a Video Component

The user writes a standard Vue + GSAP component. No special imports or composables required.

```vue
<!-- MyVideo.vue -->
<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'

const boxRef = ref(null)
const textRef = ref(null)

onMounted(() => {
  // Standard GSAP timeline - animations start at t=0
  const tl = gsap.timeline()
  
  tl.from(boxRef.value, { 
    x: -200, 
    opacity: 0, 
    duration: 1,
    ease: 'power2.out'
  })
  
  tl.from(textRef.value, {
    y: 50,
    opacity: 0,
    duration: 0.8,
    ease: 'back.out'
  }, '-=0.3')  // GSAP's position parameter works naturally
  
  tl.to(boxRef.value, {
    rotation: 360,
    duration: 2,
    ease: 'elastic.out(1, 0.3)'
  })
})
</script>

<template>
  <div class="scene">
    <div ref="boxRef" class="box">
      <span ref="textRef">Hello GSAP!</span>
    </div>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.box {
  width: 300px;
  height: 300px;
  background: linear-gradient(45deg, #e94560, #0f3460);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 20px 60px rgba(233, 69, 96, 0.3);
}

span {
  color: white;
  font-size: 32px;
  font-weight: 600;
  font-family: system-ui;
}
</style>
```

**Render it:**
```bash
npx vueseq MyVideo.vue -d 4 -o hello.mp4
```

---

## Key Differences from Pellicule

| Aspect | Pellicule | VueSeq |
|--------|-----------|------------|
| Animation Engine | Custom `interpolate()`, `useFrame()` | Standard GSAP timelines |
| Learning Curve | Requires learning Pellicule API | Use existing GSAP knowledge |
| Easing | Basic built-in easings | Full GSAP easing library + CustomEase |
| Sequencing | Manual frame calculations | GSAP Timeline with position parameter |
| Time Control | Frame number ref | GSAP `globalTimeline.seek()` |
| SVG Animation | Manual path manipulation | GSAP MotionPathPlugin, MorphSVGPlugin |
| Physics | Not supported | GSAP Physics2D, Inertia plugins |

---

## Dependencies

```json
{
  "name": "vueseq",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "vueseq": "./bin/cli.js"
  },
  "dependencies": {
    "gsap": "^3.12.0",
    "playwright": "^1.40.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "vue": "^3.4.0"
  },
  "peerDependencies": {
    "vue": "^3.0.0"
  }
}
```

---

## Verification Plan

Since this is a **new project** to be built from scratch in an empty folder, verification will be manual.

### Manual Testing Steps

1. **Build the project:**
   ```bash
   # In the new project directory
   npm install
   npm link  # Makes 'vueseq' available globally
   ```

2. **Create a test animation:**
   ```bash
   mkdir test-video && cd test-video
   # Create TestVideo.vue with the example from this document
   ```

3. **Render and verify:**
   ```bash
   vueseq TestVideo.vue -d 4 -o test.mp4
   # Open test.mp4 in a video player
   ```

4. **Determinism test:**
   ```bash
   # Render twice and compare
   vueseq TestVideo.vue -d 4 -o test1.mp4
   vueseq TestVideo.vue -d 4 -o test2.mp4
   
   # Extract frames and diff (should be identical)
   ffmpeg -i test1.mp4 -vf "fps=30" frames1/frame-%05d.png
   ffmpeg -i test2.mp4 -vf "fps=30" frames2/frame-%05d.png
   diff -r frames1 frames2  # Should show no differences
   ```

5. **Complex timeline test:**
   Create a component with nested timelines, delays, staggers, and verify smooth playback.

---

## Implementation Checklist

- [ ] Create project directory and `package.json`
- [ ] Implement `src/runtime/gsap-bridge.js`
- [ ] Implement `src/bundler/vite.js`
- [ ] Implement `src/renderer/render.js`
- [ ] Implement `src/renderer/encode.js`
- [ ] Implement `bin/cli.js`
- [ ] Create example `Video.vue` for testing
- [ ] Test end-to-end rendering
- [ ] Verify determinism (identical renders)
- [ ] Write README.md with usage instructions

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| GSAP `seek()` not applying values synchronously | **Very Low** - Verified via docs | Confirmed: seek sets values immediately |
| DOM not fully painted when screenshot taken | Medium | Add `page.waitForTimeout(0)` or `requestAnimationFrame` flush |
| Large animations causing memory issues | Medium | Stream frames directly to FFmpeg stdin instead of disk |
| User's GSAP code has side effects on seek | Low | Document that `onComplete` callbacks may not fire |

---

## Future Enhancements (Out of Scope)

- Audio support (synchronize with video)
- Composition components (`<Scene>`, `<Sequence>`)
- In-browser preview player
- Parallel frame rendering
- WebCodecs API for faster encoding (no FFmpeg dependency)
