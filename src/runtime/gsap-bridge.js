/**
 * GSAP Bridge - Browser Runtime
 * 
 * This script runs inside the browser (injected by Vite) and provides
 * the deterministic time-control interface for frame-by-frame rendering.
 * 
 * Key design decisions:
 * - We pause globalTimeline to freeze ALL animations
 * - seek() with suppressEvents=true prevents callbacks from firing
 * - The user writes standard GSAP code; no special composables needed
 */

import gsap from 'gsap'

// 1. Pause all animations immediately
gsap.globalTimeline.pause()

// 2. Disable lag smoothing (ensures consistent timing)
gsap.ticker.lagSmoothing(0)

// 3. Expose seek function to Playwright
// This is the core function that enables deterministic rendering
window.__VUESEQ_SEEK__ = (timeInSeconds) => {
  // suppressEvents = true prevents onComplete/onUpdate callbacks from firing
  gsap.globalTimeline.seek(timeInSeconds, true)
}

// 4. Signal ready state
window.__VUESEQ_READY__ = false

// 5. Store video config for external access
window.__VUESEQ_CONFIG__ = null

window.__VUESEQ_SET_CONFIG__ = (config) => {
  window.__VUESEQ_CONFIG__ = config
}

// 6. Mark as ready after a microtask to ensure Vue is mounted
queueMicrotask(() => {
  window.__VUESEQ_READY__ = true
})

export { gsap }
