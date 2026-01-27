# AGENTS.md - Guide for AI Coding Agents

> This document teaches AI coding assistants how to use **VueSeq** to create programmatic videos from Vue + GSAP components.

---

## Quick Reference

```bash
# Render a Vue component to video
npx vueseq Video.vue -d <duration_seconds> -o output.mp4

# Options
-d, --duration   Duration in seconds (required)
-o, --output     Output file (default: ./output.mp4)
-f, --fps        Frames per second (default: 30)
-w, --width      Width in pixels (default: 1920)
-H, --height     Height in pixels (default: 1080)
```

---

## Core Concept

VueSeq renders Vue components to video by:
1. Pausing GSAP's global timeline
2. Seeking to each frame's timestamp
3. Capturing a screenshot
4. Encoding frames to MP4 with FFmpeg

**The key insight**: GSAP's `globalTimeline.seek(time)` is synchronous and deterministic. Given the same time value, it produces the exact same visual state every time.

---

## Philosophy: Bring Your Own Styles

VueSeq intentionally ships **no CSS framework**. Examples use vanilla CSS because:

- Every developer/project has their preferred styling solution
- Video components are self-contained—plain CSS is sufficient and portable
- Less opinions = works with Tailwind, UnoCSS, SCSS, or plain CSS
- Fewer dependencies = smaller install, fewer conflicts

When writing video components, use whatever CSS approach you're comfortable with. If the user's project has Tailwind configured, it will work automatically.

---

## Writing Video Components

### Basic Template

```vue
<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'

// Create refs for elements you want to animate
const elementRef = ref(null)

onMounted(() => {
  // All animations go in onMounted
  // They will automatically be part of the global timeline
  
  gsap.to(elementRef.value, {
    x: 100,
    duration: 1,
    ease: 'power2.out'
  })
})
</script>

<template>
  <div class="scene">
    <div ref="elementRef">Animated Element</div>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  /* Always set explicit dimensions and background */
  background: #1a1a2e;
}
</style>
</template>
```

### Critical Rules

1. **Use `onMounted`** - All GSAP animations must be created in `onMounted()`. Animations created before mount won't target real DOM elements.

2. **Use `ref` for targets** - Always use Vue refs (`ref(null)`) and access `.value` in GSAP calls.

3. **Set explicit dimensions** - The root element should fill 100% width/height with a solid background.

4. **Avoid random values** - For deterministic output, don't use `Math.random()` or GSAP's `random()` without seeding.

5. **Duration planning** - Your total animation duration should match or be less than the `-d` CLI argument.

---

## Animation Patterns

### Sequential Timeline

```javascript
onMounted(() => {
  const tl = gsap.timeline()
  
  tl.from('.title', { opacity: 0, y: -50, duration: 1 })
    .from('.subtitle', { opacity: 0, y: 20, duration: 0.5 })
    .from('.content', { opacity: 0, duration: 0.8 })
})
```

### Staggered Elements

```javascript
onMounted(() => {
  gsap.from('.item', {
    opacity: 0,
    x: -100,
    duration: 0.5,
    stagger: 0.1,
    ease: 'back.out(1.7)'
  })
})
```

### Overlapping Animations

```javascript
onMounted(() => {
  const tl = gsap.timeline()
  
  tl.from('.box', { scale: 0, duration: 1 })
    .from('.text', { opacity: 0, duration: 0.5 }, '-=0.3') // Overlap by 0.3s
    .to('.box', { rotation: 360, duration: 2 }, '+=0.5')   // Delay by 0.5s
})
```

### Looping (for longer videos)

```javascript
onMounted(() => {
  gsap.to('.spinner', {
    rotation: 360,
    duration: 2,
    repeat: -1,           // Infinite loop
    ease: 'none'          // Linear for smooth rotation
  })
})
```

---

## Common Video Types

### Text Reveal Animation

```vue
<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'

const chars = ref(null)

onMounted(() => {
  const tl = gsap.timeline()
  
  tl.from('.char', {
    opacity: 0,
    y: 50,
    rotationX: -90,
    stagger: 0.05,
    duration: 0.8,
    ease: 'back.out(1.7)'
  })
})
</script>

<template>
  <div class="scene">
    <h1 ref="chars">
      <span class="char" v-for="char in 'HELLO WORLD'.split('')" :key="char">
        {{ char === ' ' ? '\u00A0' : char }}
      </span>
    </h1>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

h1 {
  font-size: 120px;
  color: white;
  font-family: system-ui;
  display: flex;
}

.char {
  display: inline-block;
}
</style>
```

**Render:** `npx vueseq TextReveal.vue -d 3 -o text-reveal.mp4`

---

### Logo Animation

```vue
<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'

const logoRef = ref(null)
const taglineRef = ref(null)

onMounted(() => {
  const tl = gsap.timeline()
  
  // Logo scales in with bounce
  tl.from(logoRef.value, {
    scale: 0,
    rotation: -180,
    duration: 1.2,
    ease: 'elastic.out(1, 0.5)'
  })
  
  // Tagline fades in
  tl.from(taglineRef.value, {
    opacity: 0,
    y: 30,
    duration: 0.8,
    ease: 'power2.out'
  }, '-=0.4')
  
  // Final pulse
  tl.to(logoRef.value, {
    scale: 1.1,
    duration: 0.3,
    yoyo: true,
    repeat: 1
  })
})
</script>

<template>
  <div class="scene">
    <div ref="logoRef" class="logo">🚀</div>
    <p ref="taglineRef" class="tagline">Launch Your Ideas</p>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0f0f23;
}

.logo {
  font-size: 200px;
}

.tagline {
  font-size: 48px;
  color: white;
  font-family: system-ui;
  margin-top: 20px;
}
</style>
```

**Render:** `npx vueseq LogoAnimation.vue -d 4 -o logo.mp4`

---

### Data Visualization

```vue
<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'

const data = [
  { label: 'Jan', value: 65 },
  { label: 'Feb', value: 85 },
  { label: 'Mar', value: 45 },
  { label: 'Apr', value: 95 },
  { label: 'May', value: 70 }
]

onMounted(() => {
  const tl = gsap.timeline()
  
  // Title appears
  tl.from('.title', { opacity: 0, y: -30, duration: 0.5 })
  
  // Bars grow from bottom
  tl.from('.bar', {
    scaleY: 0,
    transformOrigin: 'bottom',
    duration: 0.8,
    stagger: 0.15,
    ease: 'power2.out'
  }, '-=0.2')
  
  // Labels fade in
  tl.from('.label', {
    opacity: 0,
    y: 10,
    stagger: 0.1,
    duration: 0.4
  }, '-=0.5')
})
</script>

<template>
  <div class="scene">
    <h2 class="title">Monthly Performance</h2>
    <div class="chart">
      <div v-for="item in data" :key="item.label" class="bar-container">
        <div class="bar" :style="{ height: item.value + '%' }"></div>
        <span class="label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1e1e2f;
  padding: 60px;
}

.title {
  color: white;
  font-size: 48px;
  font-family: system-ui;
  margin-bottom: 60px;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 40px;
  height: 400px;
}

.bar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bar {
  width: 60px;
  background: linear-gradient(to top, #6366f1, #8b5cf6);
  border-radius: 8px 8px 0 0;
}

.label {
  color: #a0a0b0;
  margin-top: 12px;
  font-size: 18px;
  font-family: system-ui;
}
</style>
```

**Render:** `npx vueseq BarChart.vue -d 4 -o chart.mp4`

---

### Morphing Shapes

```vue
<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'

const shapeRef = ref(null)

onMounted(() => {
  const tl = gsap.timeline()
  
  // Circle to square
  tl.to(shapeRef.value, {
    borderRadius: '10%',
    rotation: 45,
    duration: 1,
    ease: 'power2.inOut'
  })
  
  // Square to diamond (already rotated)
  tl.to(shapeRef.value, {
    scale: 1.2,
    duration: 0.5,
    ease: 'power2.out'
  })
  
  // Back to circle
  tl.to(shapeRef.value, {
    borderRadius: '50%',
    rotation: 360,
    scale: 1,
    duration: 1,
    ease: 'power2.inOut'
  })
})
</script>

<template>
  <div class="scene">
    <div ref="shapeRef" class="shape"></div>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d1117;
}

.shape {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: linear-gradient(45deg, #f97316, #ec4899);
}
</style>
```

**Render:** `npx vueseq MorphShape.vue -d 3 -o morph.mp4`

---

## Multi-Scene Videos

For longer videos with distinct scenes (intros, content sections, outros), use **nested GSAP timelines** with scene factory functions. This is the same pattern used in the included `examples/HelloWorld.vue` showcase.

### Architecture Pattern

```javascript
onMounted(() => {
  // Master timeline controls all scenes
  const master = gsap.timeline()
  
  // Add scenes sequentially
  master.add(createScene1_Intro())
  master.add(createScene2_Content(), '-=0.5')  // Overlap transition
  master.add(createScene3_Outro())
})

// Each scene is a factory function returning a timeline
function createScene1_Intro() {
  const tl = gsap.timeline()
  
  tl.from('.intro-title', { opacity: 0, duration: 1 })
  tl.from('.intro-subtitle', { opacity: 0, duration: 0.5 })
  tl.to({}, { duration: 1.5 })  // Hold
  tl.to('.scene-intro', { opacity: 0, duration: 0.6 })  // Fade out
  
  return tl
}
```

### Complete Multi-Scene Example

```vue
<script setup>
import { onMounted } from 'vue'
import gsap from 'gsap'

onMounted(() => {
  const master = gsap.timeline()
  
  master.add(createSceneIntro())
  master.add(createSceneMain(), '-=0.3')
  master.add(createSceneOutro())
})

function createSceneIntro() {
  const tl = gsap.timeline()
  
  // Fade in
  tl.fromTo('.scene-intro', { opacity: 0 }, { opacity: 1, duration: 0.8 })
  
  // Animate content
  tl.from('.intro-title', { y: 40, opacity: 0, duration: 0.8 })
  tl.from('.intro-line', { scaleX: 0, duration: 0.6 }, '-=0.3')
  
  // Hold for readability
  tl.to({}, { duration: 2 })
  
  // Fade out before next scene
  tl.to('.scene-intro', { opacity: 0, duration: 0.5 })
  
  return tl
}

function createSceneMain() {
  const tl = gsap.timeline()
  
  tl.fromTo('.scene-main', { opacity: 0 }, { opacity: 1, duration: 0.8 })
  tl.from('.main-content', { y: 30, opacity: 0, duration: 0.6 })
  tl.to({}, { duration: 3 })  // Hold
  tl.to('.scene-main', { opacity: 0, duration: 0.5 })
  
  return tl
}

function createSceneOutro() {
  const tl = gsap.timeline()
  
  tl.fromTo('.scene-outro', { opacity: 0 }, { opacity: 1, duration: 1 })
  tl.from('.outro-cta', { scale: 0.9, opacity: 0, duration: 0.8 })
  tl.to({}, { duration: 2 })  // Final hold
  
  return tl
}
</script>

<template>
  <div class="video">
    <!-- All scenes stacked with absolute positioning -->
    <div class="scene scene-intro">
      <h1 class="intro-title">Welcome</h1>
      <div class="intro-line"></div>
    </div>
    
    <div class="scene scene-main">
      <div class="main-content">Main Content Here</div>
    </div>
    
    <div class="scene scene-outro">
      <p class="outro-cta">Thanks for watching!</p>
    </div>
  </div>
</template>

<style scoped>
.video {
  width: 100%;
  height: 100%;
  position: relative;
  background: #0a0a0f;
}

.scene {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;  /* Scenes start hidden */
}

.scene-intro { background: linear-gradient(135deg, #1a1a2e, #0f0f1a); opacity: 1; }
.scene-main { background: linear-gradient(135deg, #0d1117, #161b22); }
.scene-outro { background: linear-gradient(135deg, #1a1a2e, #0a0a0f); }
</style>
```

### Key Patterns for Multi-Scene Videos

| Pattern | Purpose |
|---------|---------|
| `master.add(scene, '-=0.5')` | Overlap scenes for smooth transitions |
| `tl.to({}, { duration: 2 })` | Hold/pause to let viewers read content |
| `opacity: 0` in CSS | Scenes start hidden, fade in via GSAP |
| Scene factory functions | Keep code organized and reusable |
| `position: absolute` + `inset: 0` | Stack all scenes on top of each other |

### Timing Tips

- **Calculate total duration**: Sum of all scene durations minus overlaps
- **Set `-d` flag slightly longer**: Ensures no content is cut off
- **Add generous hold times**: Video should be pleasant, not rushed
- **Test with short renders first**: Use `-w 640 -H 360` for quick tests

---

## GSAP Features That Work

| Feature | Example |
|---------|---------|
| Timeline | `gsap.timeline()` |
| Position Parameter | `tl.to(el, {...}, '-=0.5')` |
| Stagger | `stagger: 0.1` or `stagger: { each: 0.1, from: 'center' }` |
| Yoyo | `yoyo: true, repeat: 1` |
| Repeat | `repeat: 3` or `repeat: -1` (infinite) |
| Ease | All GSAP easings work |
| Nested Timelines | Timelines within timelines |
| Labels | `tl.addLabel('intro')` then `tl.play('intro')` |

---

## Things to Avoid

| ❌ Don't Do | ✅ Do Instead |
|------------|---------------|
| `Math.random()` | Use fixed values for determinism |
| `Date.now()` | Use animation time instead |
| `requestAnimationFrame` | Let GSAP handle timing |
| Fetch external resources | Embed or import assets |
| `onComplete` callbacks | These may not fire during seek |
| CSS animations | Use GSAP for all animations |

---

## Programmatic Usage

For batch rendering or integration into build pipelines:

```javascript
import { renderToMp4 } from 'vueseq'

await renderToMp4({
  input: '/absolute/path/to/Video.vue',
  duration: 5,        // seconds
  fps: 30,
  width: 1920,
  height: 1080,
  output: './output.mp4',
  onProgress: ({ percent, frame, total }) => {
    console.log(`${percent}% complete`)
  }
})
```

---

## Troubleshooting

### "FFmpeg not found"
Install FFmpeg:
- macOS: `brew install ffmpeg`
- Ubuntu: `sudo apt install ffmpeg`
- Windows: Download from ffmpeg.org

### "Failed to resolve import 'vue'"
Run `npm install` in the VueSeq directory first.

### Animations don't appear
- Check that animations are in `onMounted()`
- Verify refs are correctly bound with `.value`
- Ensure duration (-d) is long enough for your animation

### Black frames at start
Add a brief delay before animation:
```javascript
gsap.from('.element', { opacity: 0, duration: 1, delay: 0.1 })
```

### Inconsistent renders
- Remove all `Math.random()` calls
- Don't use `Date.now()` or system time
- Avoid fetching external resources

---

## Resolution Presets

| Format | Resolution | Command |
|--------|-----------|---------|
| 1080p | 1920×1080 | `-w 1920 -H 1080` (default) |
| 4K | 3840×2160 | `-w 3840 -H 2160` |
| Square (Instagram) | 1080×1080 | `-w 1080 -H 1080` |
| Vertical (Stories) | 1080×1920 | `-w 1080 -H 1920` |
| 720p | 1280×720 | `-w 1280 -H 720` |

---

## Example Workflow for Agents

When asked to create a video:

1. **Create the Vue component** with GSAP animations in `onMounted()`
2. **Test with short duration first**: `npx vueseq Video.vue -d 2 -w 640 -H 360 -o test.mp4`
3. **Render final version**: `npx vueseq Video.vue -d 5 -o final.mp4`
4. **Verify** the output exists and has correct duration

```bash
# Quick validation
ffprobe -v error -show_format output.mp4 | grep duration
```
