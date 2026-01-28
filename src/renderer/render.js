/**
 * Frame Renderer
 *
 * The core rendering loop that captures each frame using Playwright.
 * For each frame:
 *   1. Seek GSAP globalTimeline to the exact time
 *   2. Wait for requestAnimationFrame to ensure DOM is painted
 *   3. Take a screenshot
 */

import { chromium } from 'playwright'
import { createVideoServer } from '../bundler/vite.js'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { getOptimalChromiumConfig } from './gpu.js'

// GPU configuration is now handled by the gpu.js module
// which auto-detects the best backend for the current system

/**
 * Get the timeline duration from a Vue component
 * @param {Object} options
 * @param {string} options.input - Absolute path to the Video.vue component
 * @param {number} [options.width=1920] - Video width in pixels
 * @param {number} [options.height=1080] - Video height in pixels
 * @returns {Promise<number|null>} Duration in seconds, or null if not detectable
 */
export async function getTimelineDuration(options) {
  const { input, width = 1920, height = 1080 } = options

  const { url, cleanup } = await createVideoServer({ input, width, height })

  // Get optimal GPU configuration for this system
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
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__VUESEQ_READY__ === true, {
      timeout: 30000,
    })
    // Give Vue/GSAP a moment to set up timelines
    await page.waitForTimeout(100)

    const duration = await page.evaluate(() =>
      window.__VUESEQ_GET_DURATION__?.(),
    )
    return duration
  } finally {
    await browser.close()
    await cleanup()
  }
}

/**
 * Render frames from a Vue component
 * @param {Object} options
 * @param {string} options.input - Absolute path to the Video.vue component
 * @param {number} [options.fps=30] - Frames per second
 * @param {number} [options.duration] - Duration in seconds (auto-detected if not provided)
 * @param {number} [options.width=1920] - Video width in pixels
 * @param {number} [options.height=1080] - Video height in pixels
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<{framesDir: string, totalFrames: number, cleanup: () => Promise<void>}>}
 */
export async function renderFrames(options) {
  let {
    input,
    fps = 30,
    duration,
    width = 1920,
    height = 1080,
    onProgress,
  } = options

  // Auto-detect duration if not provided
  if (!duration) {
    duration = await getTimelineDuration({ input, width, height })
    if (!duration || duration <= 0) {
      throw new Error(
        'Could not auto-detect duration. Specify -d/--duration manually.',
      )
    }
  }

  const totalFrames = Math.ceil(duration * fps)

  // Start Vite server
  const { url, tempDir, cleanup } = await createVideoServer({
    input,
    width,
    height,
  })

  const framesDir = join(tempDir, 'frames')
  await mkdir(framesDir, { recursive: true })

  // Launch headless browser with optimal GPU config
  const gpuConfig = await getOptimalChromiumConfig()
  const launchOptions2 = {
    headless: gpuConfig.headless,
    args: gpuConfig.args,
  }
  if (gpuConfig.channel) {
    launchOptions2.channel = gpuConfig.channel
  }
  const browser = await chromium.launch(launchOptions2)

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

    // Render each frame
    for (let frame = 0; frame < totalFrames; frame++) {
      const timeInSeconds = frame / fps

      // Seek GSAP to exact time and wait for paint
      await page.evaluate(async (t) => {
        window.__VUESEQ_SEEK__(t)
        // Wait for next animation frame to ensure DOM is painted
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }, timeInSeconds)

      // Take screenshot
      const framePath = join(
        framesDir,
        `frame-${String(frame).padStart(5, '0')}.png`,
      )
      await page.screenshot({
        path: framePath,
        type: 'png',
      })

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
  } finally {
    await browser.close()
  }

  return { framesDir, totalFrames, cleanup }
}
