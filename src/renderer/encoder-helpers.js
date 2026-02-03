/**
 * Shared encoder helpers for Mediabunny-based video encoding.
 *
 * Used by both the standard encoder (encode.js) and the
 * optimized in-browser capture encoder (encode-optimized.js).
 */

import { readFile } from 'fs/promises'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/**
 * Inject Mediabunny library into the page
 * @param {import('playwright').Page} page
 */
export async function injectMediabunny(page) {
  const libPath = require.resolve('mediabunny')
  const libCode = await readFile(libPath, 'utf-8')
  await page.addScriptTag({ content: libCode })
}

/**
 * Initialize Mediabunny encoder in the browser context
 * @param {import('playwright').Page} page
 * @param {Object} config
 * @param {number} config.width
 * @param {number} config.height
 * @param {number} config.fps
 */
export async function initializeEncoder(page, { width, height, fps }) {
  await page.evaluate(
    async ({ width, height, fps }) => {
      const {
        Output,
        Mp4OutputFormat,
        BufferTarget,
        QUALITY_HIGH,
        CanvasSource,
      } = window.Mediabunny

      // Create output with MP4 format
      window.__VUESEQ_OUTPUT__ = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
      })

      // Store canvas for reuse
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      window.__VUESEQ_CANVAS__ = canvas

      // Create CanvasSource with encoding config
      window.__VUESEQ_VIDEO_SOURCE__ = new CanvasSource(canvas, {
        codec: 'avc',
        bitrate: QUALITY_HIGH,
      })

      window.__VUESEQ_OUTPUT__.addVideoTrack(window.__VUESEQ_VIDEO_SOURCE__)
      window.__VUESEQ_FPS__ = fps

      await window.__VUESEQ_OUTPUT__.start()
    },
    { width, height, fps },
  )
}

/**
 * Finalize encoding and retrieve the MP4 data as a Base64 data URL
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} - Base64 data URL of the MP4
 */
export async function finalizeEncoding(page) {
  console.log('  Transferring video data (Base64)...')
  return await page.evaluate(async () => {
    window.__VUESEQ_VIDEO_SOURCE__.close()
    await window.__VUESEQ_OUTPUT__.finalize()
    const buffer = window.__VUESEQ_OUTPUT__.target.buffer

    // Cleanup
    delete window.__VUESEQ_OUTPUT__
    delete window.__VUESEQ_CANVAS__
    delete window.__VUESEQ_VIDEO_SOURCE__
    delete window.__VUESEQ_FPS__

    // Fast conversion via Blob
    const blob = new Blob([buffer], { type: 'video/mp4' })
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
      reader.readAsDataURL(blob)
    })
  })
}
