<p align="center">
  <img src="./vueseq.svg" alt="VueSeq Logo" width="200">
</p>

# VueSeq

> **Vue Sequencer**: A minimal, deterministic video renderer for Vue 3 + GSAP, inspired by Pellicule and Remotion.

Render Vue components with GSAP animations to video. Write standard Vue + GSAP code—no special APIs to learn.

## Features

- ✅ **Standard GSAP** - Use your existing GSAP knowledge
- ✅ **Deterministic** - Same input = identical output, every time
- ✅ **Simple CLI** - One command to render your video
- ✅ **Programmatic API** - Integrate into your build pipeline
- ✅ **Full GSAP Power** - All easing, timelines, and plugins work

## Demo



https://github.com/user-attachments/assets/84d01c02-4b4f-4d86-879e-720a7e367967



*This video was rendered with VueSeq from [examples/HelloWorld.vue](./examples/HelloWorld.vue)*

## Philosophy

VueSeq is intentionally minimal. We bundle only the essentials: **Vue**, **GSAP**, **Playwright**, and **Vite**.

We don't include CSS frameworks (Tailwind, UnoCSS, etc.) because:
- Every developer has their preferred styling approach
- Your project likely already has styling configured
- Video components are self-contained—vanilla CSS works great
- Less dependencies = fewer conflicts and smaller installs

**Bring your own styles.** If your project uses Tailwind, SCSS, or any other solution, it will work seamlessly with VueSeq.

## Installation

```bash
npm install vueseq
```

### Requirements

- Node.js 18+
- FFmpeg (for video encoding)
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Quick Start

### 1. Create a Video Component

Create a Vue component with GSAP animations:

```vue
<!-- MyVideo.vue -->
<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'

const boxRef = ref(null)
const textRef = ref(null)

onMounted(() => {
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
  }, '-=0.3')
  
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

### 2. Render to Video

```bash
npx vueseq MyVideo.vue -d 4 -o hello.mp4
```

That's it! Your video will be rendered at 1920x1080, 30fps.

## CLI Options

```
vueseq <Video.vue> [options]

Options:
  -o, --output   Output file (default: ./output.mp4)
  -d, --duration Duration in seconds (required)
  -f, --fps      Frames per second (default: 30)
  -w, --width    Video width in pixels (default: 1920)
  -H, --height   Video height in pixels (default: 1080)
  --help         Show help message
```

### Examples

```bash
# Basic render
vueseq Intro.vue -d 5 -o intro.mp4

# 4K at 60fps
vueseq Intro.vue -d 10 -f 60 -w 3840 -H 2160 -o intro-4k.mp4

# Square for social media
vueseq Story.vue -d 15 -w 1080 -H 1080 -o story.mp4
```

## Programmatic API

```javascript
import { renderToMp4, renderFrames, encodeVideo } from 'vueseq'

// Render directly to MP4
await renderToMp4({
  input: '/path/to/MyVideo.vue',
  duration: 5,
  fps: 30,
  width: 1920,
  height: 1080,
  output: './output.mp4',
  onProgress: ({ frame, total, percent }) => {
    console.log(`Rendering: ${percent}%`)
  }
})

// Or render frames separately for custom processing
const { framesDir, totalFrames, cleanup } = await renderFrames({
  input: '/path/to/MyVideo.vue',
  duration: 5,
  fps: 30,
  width: 1920,
  height: 1080
})

// Process frames here...

await encodeVideo({ framesDir, output: './output.mp4', fps: 30 })
await cleanup()
```

## How It Works

VueSeq uses GSAP's deterministic timeline control:

1. **Vite** bundles your Vue component
2. **Playwright** opens it in headless Chrome
3. For each frame, GSAP's `globalTimeline.seek(time)` jumps to the exact moment
4. **Screenshot** captures the frame
5. **FFmpeg** encodes all frames to video

This is deterministic because `seek()` applies all GSAP values synchronously—given the same time, you get the exact same DOM state every time.

## Multi-Scene Videos

For longer videos with multiple scenes, use nested GSAP timelines:

```javascript
onMounted(() => {
  const master = gsap.timeline()
  
  master.add(createIntro())
  master.add(createMainContent(), '-=0.5')  // Overlap for smooth transition
  master.add(createOutro())
})

function createIntro() {
  const tl = gsap.timeline()
  tl.from('.title', { opacity: 0, duration: 1 })
  tl.to({}, { duration: 2 })  // Hold
  tl.to('.scene-intro', { opacity: 0, duration: 0.5 })
  return tl
}
```

Stack scenes with `position: absolute` and control visibility via GSAP opacity animations. See `examples/HelloWorld.vue` for a complete 4-scene example, and `AGENTS.md` for detailed patterns.

## Tips

- **Keep animations on the `globalTimeline`** - Nested timelines work fine, they're all part of the global timeline by default
- **Avoid random values** - For deterministic renders, don't use `random()` or `Math.random()` without seeding
- **Handle callbacks carefully** - `onComplete` and similar callbacks may not fire as expected during seek

## License

MIT
