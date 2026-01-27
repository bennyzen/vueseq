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

/**
 * Render frames from a Vue component
 * @param {Object} options
 * @param {string} options.input - Absolute path to the Video.vue component
 * @param {number} [options.fps=30] - Frames per second
 * @param {number} options.duration - Duration in seconds
 * @param {number} [options.width=1920] - Video width in pixels
 * @param {number} [options.height=1080] - Video height in pixels
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<{framesDir: string, totalFrames: number, cleanup: () => Promise<void>}>}
 */
export async function renderFrames(options) {
    const {
        input,
        fps = 30,
        duration,
        width = 1920,
        height = 1080,
        onProgress
    } = options

    if (!duration || duration <= 0) {
        throw new Error('Duration must be a positive number (in seconds)')
    }

    const totalFrames = Math.ceil(duration * fps)

    // Start Vite server
    const { url, tempDir, cleanup } = await createVideoServer({ input, width, height })

    const framesDir = join(tempDir, 'frames')
    await mkdir(framesDir, { recursive: true })

    // Launch headless browser
    const browser = await chromium.launch({
        headless: true
    })

    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1
    })

    const page = await context.newPage()

    try {
        // Load the page
        await page.goto(url, { waitUntil: 'networkidle' })

        // Wait for VueSeq bridge to be ready
        await page.waitForFunction(
            () => window.__VUESEQ_READY__ === true,
            { timeout: 30000 }
        )

        // Give Vue a moment to mount and GSAP to set up timelines
        await page.waitForTimeout(100)

        // Render each frame
        for (let frame = 0; frame < totalFrames; frame++) {
            const timeInSeconds = frame / fps

            // Seek GSAP to exact time and wait for paint
            await page.evaluate(async (t) => {
                window.__VUESEQ_SEEK__(t)
                // Wait for next animation frame to ensure DOM is painted
                await new Promise(resolve => requestAnimationFrame(resolve))
            }, timeInSeconds)

            // Take screenshot
            const framePath = join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`)
            await page.screenshot({
                path: framePath,
                type: 'png'
            })

            // Progress callback
            if (onProgress) {
                onProgress({
                    frame,
                    total: totalFrames,
                    timeInSeconds,
                    percent: Math.round((frame + 1) / totalFrames * 100)
                })
            }
        }
    } finally {
        await browser.close()
    }

    return { framesDir, totalFrames, cleanup }
}
