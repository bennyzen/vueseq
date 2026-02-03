/**
 * Optimized Video Encoder using In-Browser Capture
 *
 * This module eliminates the PNG encode/decode overhead by capturing
 * frames directly in the browser using html2canvas and creating
 * VideoFrames from canvas (zero-copy GPU path).
 *
 * Key optimizations:
 * 1. No PNG encoding/decoding - direct canvas-to-VideoFrame
 * 2. All frame capture happens in-browser (no Node<->browser transfers)
 */

import { chromium } from 'playwright'
import { createVideoServer } from '../bundler/vite.js'
import { writeFile } from 'fs/promises'
import { getTimelineDuration } from './render.js'
import { getOptimalChromiumConfig } from './gpu.js'
import { injectMediabunny, initializeEncoder, finalizeEncoding } from './encoder-helpers.js'
import {
  injectCaptureInfrastructure,
  cleanupCapture,
} from './capture.js'

/**
 * Capture and encode a frame entirely in-browser
 * This eliminates PNG encode/decode overhead
 */
async function captureAndEncodeFrame(page, timestamp, fps) {
  await page.evaluate(
    async ({ timestamp, fps }) => {
      const captureCanvas = window.__VUESEQ_CAPTURE_CANVAS__
      const encodingCanvas = window.__VUESEQ_CANVAS__
      const ctx = encodingCanvas.getContext('2d')
      const options = window.__VUESEQ_CAPTURE_OPTIONS__

      // Capture DOM to canvas using html2canvas
      await html2canvas(document.body, options)

      // Draw captured content to encoding canvas
      ctx.drawImage(captureCanvas, 0, 0)

      // Add frame to video source
      const frameDuration = 1 / fps
      await window.__VUESEQ_VIDEO_SOURCE__.add(timestamp, frameDuration)
    },
    { timestamp, fps },
  )
}

/**
 * Optimized render to MP4 using in-browser capture
 *
 * This version eliminates PNG encoding/decoding overhead by:
 * 1. Capturing frames directly in the browser with html2canvas
 * 2. Creating VideoFrames from canvas (GPU zero-copy)
 *
 * @param {Object} options
 * @param {string} options.input - Path to Video.vue component
 * @param {string} [options.output='./output.mp4'] - Output file path
 * @param {number} [options.fps=30] - Frames per second
 * @param {number} options.duration - Duration in seconds
 * @param {number} [options.width=1920] - Video width
 * @param {number} [options.height=1080] - Video height
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<string>} - Path to output video
 */
export async function renderToMp4Optimized(options) {
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

  // Launch browser with optimal GPU config
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

    // Wait for VueSeq bridge
    await page.waitForFunction(() => window.__VUESEQ_READY__ === true, {
      timeout: 30000,
    })

    await page.waitForTimeout(100)

    // Inject libraries
    await injectMediabunny(page)
    await injectCaptureInfrastructure(page, { width, height })

    // Initialize encoder
    await initializeEncoder(page, { width, height, fps })

    // Capture and encode each frame sequentially
    for (let frame = 0; frame < totalFrames; frame++) {
      const timeInSeconds = frame / fps

      // Seek GSAP to exact time
      await page.evaluate(async (t) => {
        window.__VUESEQ_SEEK__(t)
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }, timeInSeconds)

      // Capture and encode directly in browser (no PNG!)
      await captureAndEncodeFrame(page, timeInSeconds, fps)

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

    // Cleanup capture infrastructure
    await cleanupCapture(page)

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
 * Benchmark comparison between original and optimized methods
 */
export async function benchmarkRenderMethods(options) {
  const { renderToMp4 } = await import('./encode.js')

  console.log('\n📊 Benchmarking render methods...\n')

  // Benchmark original method
  console.log('Testing ORIGINAL method (PNG-based)...')
  const originalStart = Date.now()
  await renderToMp4({
    ...options,
    output: '/tmp/benchmark-original.mp4',
  })
  const originalTime = Date.now() - originalStart

  // Benchmark optimized method
  console.log('Testing OPTIMIZED method (in-browser capture)...')
  const optimizedStart = Date.now()
  await renderToMp4Optimized({
    ...options,
    output: '/tmp/benchmark-optimized.mp4',
  })
  const optimizedTime = Date.now() - optimizedStart

  const improvement = ((originalTime - optimizedTime) / originalTime) * 100

  console.log('\n📈 Results:')
  console.log(`  Original:  ${(originalTime / 1000).toFixed(2)}s`)
  console.log(`  Optimized: ${(optimizedTime / 1000).toFixed(2)}s`)
  console.log(
    `  Improvement: ${improvement.toFixed(1)}% ${improvement > 0 ? 'faster' : 'slower'}`,
  )

  return {
    originalTime,
    optimizedTime,
    improvement,
  }
}
