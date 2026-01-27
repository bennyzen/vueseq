/**
 * VueSeq - Public API
 * 
 * A minimal, deterministic video renderer for Vue 3 + GSAP.
 */

export { renderFrames } from './renderer/render.js'
export { encodeVideo, renderToMp4 } from './renderer/encode.js'
export { createVideoServer } from './bundler/vite.js'
