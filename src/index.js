/**
 * VueSeq - Public API
 *
 * A minimal, deterministic video renderer for Vue 3 + GSAP.
 * Uses WebCodecs API for hardware-accelerated video encoding.
 */

export { renderFrames } from './renderer/render.js'
export { renderToMp4, isWebCodecsSupported } from './renderer/encode.js'
export { createVideoServer } from './bundler/vite.js'
