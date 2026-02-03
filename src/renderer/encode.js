/**
 * Video Encoder using WebCodecs API + Mediabunny
 *
 * Encodes video directly in the browser using WebCodecs API.
 * No FFmpeg required - all encoding happens via hardware-accelerated WebCodecs.
 */

import { chromium } from 'playwright'
import { createVideoServer } from '../bundler/vite.js'
import { writeFile } from 'fs/promises'
import { getTimelineDuration } from './render.js'
import { getOptimalChromiumConfig, checkGPUAcceleration } from './gpu.js'
import { injectMediabunny, initializeEncoder, finalizeEncoding } from './encoder-helpers.js'

/**
 * Encode a single frame using Mediabunny
 * @param {import('playwright').Page} page
 * @param {Buffer} imageBuffer - PNG image buffer from Playwright
 * @param {number} frameIndex - Current frame index
 */
async function encodeFrame(page, imageBuffer, frameIndex, fps) {
  // Convert buffer to base64 for transmission to browser
  const base64Data = imageBuffer.toString('base64')
  const dataUrl = `data:image/png;base64,${base64Data}`

  await page.evaluate(
    async ({ dataUrl, frameIndex, fps }) => {
      // Load image
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = dataUrl
      })

      // Draw to canvas
      const canvas = window.__VUESEQ_CANVAS__
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      // Add frame to video source
      // Timestamp in seconds
      const timestamp = frameIndex / fps
      const frameDuration = 1 / fps
      await window.__VUESEQ_VIDEO_SOURCE__.add(timestamp, frameDuration)
    },
    { dataUrl, frameIndex, fps },
  )
}

/**
 * Render a Vue component to MP4 video using WebCodecs API via Mediabunny
 * @param {Object} options
 * @param {string} options.input - Absolute path to the Video.vue component
 * @param {string} [options.output='./output.mp4'] - Output video file path
 * @param {number} [options.fps=30] - Frames per second
 * @param {number} options.duration - Duration in seconds (auto-detected if not provided)
 * @param {number} [options.width=1920] - Video width in pixels
 * @param {number} [options.height=1080] - Video height in pixels
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<string>} - Path to the output video
 */
export async function renderToMp4(options) {
  const {
    input,
    output = './output.mp4',
    fps = 30,
    duration: providedDuration,
    width = 1920,
    height = 1080,
    onProgress,
  } = options

  // Auto-detect duration if not provided
  let duration = providedDuration
  if (!duration || duration <= 0) {
    duration = await getTimelineDuration({ input, width, height })
    if (!duration || duration <= 0) {
      throw new Error(
        'Could not auto-detect duration. Specify duration manually.',
      )
    }
  }

  const totalFrames = Math.ceil(duration * fps)

  // Start Vite server
  const { url, cleanup: cleanupServer } = await createVideoServer({
    input,
    width,
    height,
  })

  // Launch headless browser with optimal GPU config
  // The gpu.js module auto-detects the best backend (Vulkan, Metal, D3D11, etc.)
  // and uses the new headless mode for GPU passthrough
  const gpuConfig = await getOptimalChromiumConfig()
  const launchOptions = {
    headless: gpuConfig.headless,
    args: gpuConfig.args,
  }
  if (gpuConfig.channel) {
    launchOptions.channel = gpuConfig.channel
  }
  const browser = await chromium.launch(launchOptions)

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  })

  const page = await context.newPage()

  try {
    // Load the page
    await page.goto(url, { waitUntil: 'networkidle' })

    // Wait for VueSeq bridge to be ready
    await page.waitForFunction(() => window.__VUESEQ_READY__ === true, {
      timeout: 30000,
    })

    // Give Vue a moment to mount and GSAP to set up timelines
    await page.waitForTimeout(100)

    // Inject Mediabunny library
    await injectMediabunny(page)

    // Initialize encoder
    await initializeEncoder(page, { width, height, fps })

    // Render and encode each frame
    for (let frame = 0; frame < totalFrames; frame++) {
      const timeInSeconds = frame / fps

      // Seek GSAP to exact time
      await page.evaluate(async (t) => {
        window.__VUESEQ_SEEK__(t)
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }, timeInSeconds)

      // Take screenshot
      const screenshotBuffer = await page.screenshot({ type: 'png' })

      // Encode the frame
      await encodeFrame(page, screenshotBuffer, frame, fps)

      // Progress callback
      if (onProgress) {
        onProgress({
          frame,
          total: totalFrames,
          timeInSeconds,
          percent: Math.round(((frame + 1) / totalFrames) * 100),
        })
      }
    }

    // Finalize and get MP4 data (Base64)
    const base64Data = await finalizeEncoding(page)

    // Write the MP4 file
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64')
    await writeFile(output, buffer)

    return output
  } finally {
    await browser.close()
    await cleanupServer()
  }
}

/**
 * Check GPU hardware acceleration status
 * Re-exported from gpu.js module
 */
export { checkGPUAcceleration } from './gpu.js'

/**
 * Check if WebCodecs API is supported in the current environment
 * @returns {Promise<boolean>}
 */
export async function isWebCodecsSupported() {
  try {
    const gpuConfig = await getOptimalChromiumConfig()
    const launchOptions = {
      headless: gpuConfig.headless,
      args: gpuConfig.args,
    }
    if (gpuConfig.channel) {
      launchOptions.channel = gpuConfig.channel
    }
    const browser = await chromium.launch(launchOptions)
    const context = await browser.newContext()
    const page = await context.newPage()

    const supported = await page.evaluate(() => {
      return (
        typeof VideoEncoder !== 'undefined' &&
        typeof VideoFrame !== 'undefined' &&
        typeof VideoEncoder.isConfigSupported === 'function'
      )
    })

    await browser.close()
    return supported
  } catch {
    return false
  }
}

// Optimized encoder using in-browser capture (no PNG overhead)
export { renderToMp4Optimized, benchmarkRenderMethods } from './encode-optimized.js'

// Legacy FFmpeg-based encoding (kept for compatibility if needed)
// TODO: Remove in future version
export { encodeVideo } from './ffmpeg-encode.js'


