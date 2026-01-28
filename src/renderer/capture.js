/**
 * In-Browser Frame Capture Module
 *
 * Provides utilities for capturing DOM frames directly in the browser
 * without PNG encoding/decoding overhead. Uses html2canvas for DOM
 * capture and creates VideoFrame objects directly from canvas (zero-copy GPU).
 */

/**
 * Get the html2canvas script content for injection
 * @returns {Promise<string>}
 */
export async function getHtml2CanvasScript() {
    const { readFile } = await import('fs/promises')
    const { join, dirname } = await import('path')
    const { fileURLToPath } = await import('url')

    // Find html2canvas in node_modules
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const html2canvasPath = join(
        __dirname,
        '../../node_modules/html2canvas/dist/html2canvas.min.js',
    )

    return await readFile(html2canvasPath, 'utf-8')
}

/**
 * Inject capture infrastructure into page
 * @param {import('playwright').Page} page
 * @param {Object} options
 * @param {number} options.width
 * @param {number} options.height
 */
export async function injectCaptureInfrastructure(page, { width, height }) {
    // Inject html2canvas library
    const html2canvasScript = await getHtml2CanvasScript()
    await page.addScriptTag({ content: html2canvasScript })

    // Set up capture canvas and utilities
    await page.evaluate(
        ({ width, height }) => {
            // Create reusable capture canvas (avoid creating new ones each frame)
            const captureCanvas = document.createElement('canvas')
            captureCanvas.width = width
            captureCanvas.height = height
            window.__VUESEQ_CAPTURE_CANVAS__ = captureCanvas

            // Pre-configure html2canvas options for speed
            window.__VUESEQ_CAPTURE_OPTIONS__ = {
                canvas: captureCanvas,
                width,
                height,
                scale: 1,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null, // Transparent - use page background
                logging: false,
                // Performance optimizations
                imageTimeout: 0,
                removeContainer: true,
                foreignObjectRendering: false, // More compatible
            }

            // Frame batch storage for parallel processing
            window.__VUESEQ_FRAME_BATCH__ = []
        },
        { width, height },
    )
}

/**
 * Capture a single frame from DOM to VideoFrame
 * Returns the VideoFrame for encoding
 *
 * @param {import('playwright').Page} page
 * @param {number} timestamp - Frame timestamp in seconds
 * @param {number} fps - Frames per second
 * @returns {Promise<void>} - Frame is added to internal batch
 */
export async function captureFrameToBatch(page, timestamp, fps) {
    await page.evaluate(
        async ({ timestamp, fps }) => {
            const captureCanvas = window.__VUESEQ_CAPTURE_CANVAS__
            const options = window.__VUESEQ_CAPTURE_OPTIONS__

            // Capture DOM to canvas using html2canvas
            await html2canvas(document.body, options)

            // Create VideoFrame directly from canvas (zero-copy on GPU!)
            const frameDuration = 1 / fps
            const videoFrame = new VideoFrame(captureCanvas, {
                timestamp: Math.round(timestamp * 1_000_000), // microseconds
                duration: Math.round(frameDuration * 1_000_000),
            })

            // Store in batch for later encoding
            window.__VUESEQ_FRAME_BATCH__.push(videoFrame)
        },
        { timestamp, fps },
    )
}

/**
 * Encode all frames in the current batch and clear batch
 * @param {import('playwright').Page} page
 */
export async function encodeFrameBatch(page) {
    await page.evaluate(async () => {
        const batch = window.__VUESEQ_FRAME_BATCH__
        const videoSource = window.__VUESEQ_VIDEO_SOURCE__

        // Encode each frame in the batch
        for (const videoFrame of batch) {
            // Add frame to video source at its timestamp
            const timestampSec = videoFrame.timestamp / 1_000_000
            const durationSec = videoFrame.duration / 1_000_000
            await videoSource.add(timestampSec, durationSec)

            // Draw the captured frame to the encoding canvas
            const canvas = window.__VUESEQ_CANVAS__
            const ctx = canvas.getContext('2d')
            ctx.drawImage(videoFrame, 0, 0)

            // Close the VideoFrame to release GPU resources
            videoFrame.close()
        }

        // Clear batch for next round
        window.__VUESEQ_FRAME_BATCH__ = []
    })
}

/**
 * Alternative: Direct canvas encoding without intermediate batch
 * More efficient for single-frame-at-a-time scenarios
 *
 * @param {import('playwright').Page} page
 * @param {number} timestamp - Frame timestamp in seconds
 * @param {number} fps - Frames per second
 */
export async function captureAndEncodeDirect(page, timestamp, fps) {
    await page.evaluate(
        async ({ timestamp, fps }) => {
            const captureCanvas = window.__VUESEQ_CAPTURE_CANVAS__
            const options = window.__VUESEQ_CAPTURE_OPTIONS__
            const encodingCanvas = window.__VUESEQ_CANVAS__
            const ctx = encodingCanvas.getContext('2d')

            // Capture DOM to canvas
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
 * Cleanup capture infrastructure
 * @param {import('playwright').Page} page
 */
export async function cleanupCapture(page) {
    await page.evaluate(() => {
        // Close any remaining frames in batch
        if (window.__VUESEQ_FRAME_BATCH__) {
            for (const frame of window.__VUESEQ_FRAME_BATCH__) {
                try {
                    frame.close()
                } catch {
                    // Already closed
                }
            }
        }

        delete window.__VUESEQ_CAPTURE_CANVAS__
        delete window.__VUESEQ_CAPTURE_OPTIONS__
        delete window.__VUESEQ_FRAME_BATCH__
    })
}
