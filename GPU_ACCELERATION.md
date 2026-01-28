# GPU Acceleration Analysis for VueSeq

## Summary

This document captures the investigation into GPU acceleration for VueSeq's video rendering pipeline, including the migration from FFmpeg to WebCodecs API and findings about GPU utilization.

---

## Migration: FFmpeg → WebCodecs API

### What Changed

| Aspect                    | Before (FFmpeg)           | After (WebCodecs)                 |
| ------------------------- | ------------------------- | --------------------------------- |
| **Video Encoder**         | External FFmpeg binary    | Native browser `VideoEncoder` API |
| **MP4 Muxer**             | FFmpeg                    | `mediabunny` JS library           |
| **Dependencies**          | FFmpeg must be installed  | Pure JavaScript dependencies      |
| **Installation**          | `brew install ffmpeg` etc | `npm install` only                |
| **Hardware Acceleration** | Via FFmpeg flags          | Via WebCodecs hardware encoders   |

### Implementation Details

**New Encoder** (`src/renderer/encode.js`):

- Uses `VideoEncoder` with `h264` codec
- Configured for hardware-accelerated encoding when available
- Outputs MP4 via `mediabunny` muxer
- No temporary files - pure in-memory processing

**Data Flow**:

```
Vue Component → GSAP Animation → Playwright Screenshot → PNG Buffer →
Sharp Decode → VideoEncoder (GPU) → Mediabunny Muxer → MP4 File
```

---

## GPU Acceleration Reality Check

### What "GPU Acceleration" Actually Means

The CLI reports: `GPU Acceleration: ✓ Enabled (ANGLE (NVIDIA, Vulkan 1.4.325...))`

However, **this only applies to the final H.264 encoding step**. The full pipeline tells a different story:

### Current Data Flow with GPU Usage

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Playwright Page)                                          │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐    │
│  │ Vue/GSAP Render │───→│ SwiftShader (CPU! ⚠️)               │    │
│  │                 │    │ No GPU acceleration here            │    │
│  └─────────────────┘    └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
            ↓ page.screenshot() → PNG Buffer (CPU)
┌─────────────────────────────────────────────────────────────────────┐
│  Node.js Process                                                    │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐    │
│  │ Decode PNG      │───→│ WebCodecs VideoEncoder              │    │
│  │ (sharp - CPU)   │    │ Hardware H.264 encode (GPU ✓)       │    │
│  └─────────────────┘    │ Small spikes seen here              │    │
│                         └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Why So Little GPU Usage?

1. **Vue/GSAP Rendering** → CPU via SwiftShader (Chrome's software renderer)
2. **Screenshot PNG Encoding** → CPU
3. **PNG Decoding** → CPU via sharp library
4. **H.264 Encoding** → GPU (this is the small spike you see)

**Key Insight**: Hardware video encoders excel at throughput, not latency. At 30fps sequential frame encoding, we're feeding the GPU one frame every 33ms - far below its capability.

---

## Root Cause: SwiftShader vs GPU Rendering

### Chrome in Headless Mode

```javascript
// Current configuration (headless: true)
const browser = await chromium.launch({
  headless: true,  // Forces SwiftShader software renderer
  args: ['--use-gl=egl', '--use-angle=vulkan', ...]
})
```

Even with GPU flags, Chrome's legacy headless mode forces all WebGL/GPU operations through **SwiftShader** - a CPU-based implementation.

### The Playwright Version Problem

```javascript
// What we WANT to use (requires Playwright 1.50+)
headless: 'new' // or 'shell'

// What Playwright 1.58.0 accepts
headless: true // boolean only
```

The "new" headless mode (available in Chrome) supports GPU passthrough, but Playwright 1.58.0's API doesn't accept string values for the `headless` option.

### Verified GPU Info from Chrome

```json
{
  "gpu": {
    "vendor": "NVIDIA",
    "device": "NVIDIA GeForce RTX 3070",
    "driver": "Vulkan 1.4.325",
    "backend": "ANGLE (Vulkan)"
  },
  "status": {
    "canvas": "hardware accelerated",
    "webgl": "hardware accelerated",
    "webgl2": "hardware accelerated"
  },
  "renderer": "SwiftShader" // ← Software fallback for headless
}
```

**The GPU is detected and available, but the actual rendering still uses SwiftShader.**

---

## Performance Measurements

### FFmpeg vs WebCodecs Comparison

| Metric                 | FFmpeg          | WebCodecs     | Difference   |
| ---------------------- | --------------- | ------------- | ------------ |
| HelloWorld (42 frames) | ~1.4s           | ~1.7s         | ~20% slower  |
| Showcase (330 frames)  | ~45s            | ~70s          | ~55% slower  |
| Installation           | External binary | npm install   | Much simpler |
| Dependencies           | FFmpeg required | None external | Better       |

### Why WebCodecs is Slower

1. **PNG transfer overhead**: Every frame goes: Browser → PNG → Node Buffer → Sharp decode → VideoEncoder
2. **Sequential processing**: Frame N must complete before Frame N+1 starts
3. **SwiftShader bottleneck**: All animation rendering on CPU
4. **Hardware encoder underutilization**: Sequential 33ms frames don't saturate GPU

---

## Potential Optimizations

### 1. Enable Real GPU Rendering

**Approach**: Run Chrome in headed mode

```javascript
headless: false // True GPU rendering
```

**Impact**: Very High - GSAP animations would use real GPU
**Trade-off**: Requires display server (X11/Wayland) or virtual framebuffer

### 2. Parallel Frame Capture

**Approach**: Capture multiple frames in parallel, batch encode

```javascript
// Instead of: for (frame of frames) { capture; encode; }
// Do: const batch = await Promise.all(frames.map(capture));
//     await encoder.encodeBatch(batch);
```

**Impact**: Medium - Better GPU encoder saturation
**Complexity**: Medium - Requires timeline synchronization

### 3. Eliminate PNG Intermediate

**Approach**: Get raw RGBA buffer from Playwright instead of PNG

```javascript
// Use CDP (Chrome DevTools Protocol) to capture raw pixels
const { data } = await page._client.send('Page.captureScreenshot', {
  format: 'jpeg', // Or find raw buffer method
  quality: 100,
})
```

**Impact**: High - Removes encode/decode overhead
**Complexity**: High - May require CDP hacks

### 4. Hardware-Accelerated PNG Decode

**Approach**: Use GPU for PNG decoding

- Look for libraries that use GPU compute (CUDA/OpenCL)
- Or use WebCodecs `ImageDecoder` API if available

**Impact**: Medium
**Complexity**: Low-Medium

### 5. Virtual Display with GPU Passthrough

**Approach**: Xvfb or similar with GPU access

```bash
xvfb-run --server-args="-screen 0 1920x1080x24+32" node render.js
```

**Impact**: Very High (enables headless GPU)
**Complexity**: High - Complex setup, platform-specific

---

## Open Questions

1. **Can we use Playwright's new headless mode?**
   - Requires Playwright 1.50+ (untested)
   - Would enable GPU passthrough without display server

2. **Is raw frame capture possible?**
   - Can we bypass PNG entirely?
   - Chrome DevTools Protocol may have options

3. **What's the optimal batch size?**
   - How many frames to capture in parallel?
   - Memory constraints vs GPU saturation

4. **Should we keep FFmpeg as fallback?**
   - WebCodecs is simpler but slower
   - Optional FFmpeg path for performance-critical use cases?

---

## Recommendations

### Short Term

- Accept current performance trade-off for simplicity
- Document the SwiftShader limitation clearly
- Keep FFmpeg encoder as optional fallback

### Medium Term

- Test Playwright 1.50+ with new headless mode
- Implement parallel frame capture for better throughput
- Profile exact time spent in each pipeline stage

### Long Term

- Investigate raw pixel capture (no PNG)
- Consider headed mode with virtual display for server environments
- Benchmark GPU vs CPU rendering for different animation types

---

## Files Modified

| File                     | Change                                      |
| ------------------------ | ------------------------------------------- |
| `src/renderer/encode.js` | New WebCodecs encoder                       |
| `src/renderer/render.js` | Updated to use WebCodecs, GPU flags         |
| `bin/cli.js`             | Added GPU detection display                 |
| `package.json`           | Added mediabunny dependency, removed FFmpeg |
| `README.md`              | Removed FFmpeg references                   |
| `AGENTS.md`              | Updated requirements section                |

---

## References

- [WebCodecs API Spec](https://w3c.github.io/webcodecs/)
- [Mediabunny Library](https://github.com/Yahweasel/mediabunny)
- [Playwright Headless Modes](https://playwright.dev/docs/next/browsers#chromium-headless)
- [SwiftShader Project](https://github.com/google/swiftshader)
- [Chrome GPU Flags](https://peter.sh/experiments/chromium-command-line-switches/)
