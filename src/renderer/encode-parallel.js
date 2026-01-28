/**
 * Parallel Frame Capture Worker (Distributed Capture in Batches)
 *
 * Architecture: Scatter-Gather
 * 1. Workers (xN): Capture DOM -> JPEG DataURL (Fast & Light)
 * 2. Node.js: Aggregates frames buffers
 * 3. Main Page: Receives JPEGs -> Decodes (Parallel) -> Encodes to MP4
 */

import { chromium } from 'playwright'
import { createVideoServer } from '../bundler/vite.js'
import { readFile, writeFile } from 'fs/promises'
import { getTimelineDuration } from './render.js'
import { join } from 'path'
import { cpus } from 'os'
import { getOptimalChromiumConfig } from './gpu.js'
import { getHtml2CanvasScript } from './capture.js'

const DEFAULT_WORKERS = Math.max(1, cpus().length)

// In-memory buffer limit (frames)
// Increased to 300 to absorb bursts (10s at 30fps)
const MAX_BUFFERED_FRAMES = 300

/**
 * Inject required libraries into a page
 */
async function injectLibraries(page, { width, height }) {
    // Inject Mediabunny
    const mediabunnyPath = join(
        process.cwd(),
        'node_modules',
        'mediabunny',
        'dist',
        'bundles',
        'mediabunny.cjs',
    )
    const mediabunnyCode = await readFile(mediabunnyPath, 'utf-8')
    await page.addScriptTag({ content: mediabunnyCode })

    // Inject html2canvas
    const html2canvasScript = await getHtml2CanvasScript()
    await page.addScriptTag({ content: html2canvasScript })

    // Setup capture infrastructure
    await page.evaluate(
        ({ width, height }) => {
            const captureCanvas = document.createElement('canvas')
            captureCanvas.width = width
            captureCanvas.height = height
            window.__VUESEQ_CAPTURE_CANVAS__ = captureCanvas

            window.__VUESEQ_CAPTURE_OPTIONS__ = {
                canvas: captureCanvas,
                width,
                height,
                scale: 1,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                logging: false,
                imageTimeout: 0,
                removeContainer: true,
                foreignObjectRendering: false,
            }
        },
        { width, height },
    )
}

/**
 * Capture frame and return JPEG Data URL
 */
async function captureFrameJPEG(page, timestamp) {
    return await page.evaluate(
        async ({ timestamp }) => {
            // Seek
            window.__VUESEQ_SEEK__(timestamp)
            await new Promise((resolve) => requestAnimationFrame(resolve))

            // Capture
            await html2canvas(document.body, window.__VUESEQ_CAPTURE_OPTIONS__)

            const canvas = window.__VUESEQ_CAPTURE_CANVAS__
            // JPEG 0.95 is visually indistinguishable for video source but much faster/smaller than PNG
            return canvas.toDataURL('image/jpeg', 0.95)
        },
        { timestamp },
    )
}

/**
 * Render to MP4 using parallel frame capture
 */
export async function renderToMp4Parallel(options) {
    const {
        input,
        output = './output.mp4',
        fps = 30,
        duration: providedDuration,
        width = 1920,
        height = 1080,
        workers: providedWorkers,
        monitorMemory = false,
        onProgress,
    } = options

    // Determine Logic
    let numWorkers = providedWorkers ? parseInt(providedWorkers, 10) : DEFAULT_WORKERS
    if (!providedWorkers) {
        console.log(`  Auto-detected ${numWorkers} CPU cores (Use --workers N to override)`)
    }
    console.log(`  Initializing ${numWorkers} capture workers...`)

    // 1. Setup
    let duration = providedDuration
    if (!duration || duration <= 0) {
        duration = await getTimelineDuration({ input, width, height })
        if (!duration) throw new Error('Could not auto-detect duration.')
    }
    const totalFrames = Math.ceil(duration * fps)

    const { url, cleanup: cleanupServer } = await createVideoServer({
        input,
        width,
        height,
    })

    const gpuConfig = await getOptimalChromiumConfig()
    const launchOptions = {
        headless: gpuConfig.headless,
        args: gpuConfig.args,
    }
    if (gpuConfig.channel) {
        launchOptions.channel = gpuConfig.channel
    }
    // Disable queueing on Node side
    const browser = await chromium.launch(launchOptions)

    try {
        const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 1,
        })

        // 2. Initialize Pages
        const pages = []

        // Create Encoder Page (Main)
        const encoderPage = await context.newPage()
        await encoderPage.goto(url, { waitUntil: 'networkidle' })
        await injectLibraries(encoderPage, { width, height })
        pages.push(encoderPage)

        // Create Worker Pages
        for (let i = 0; i < numWorkers; i++) {
            const page = await context.newPage()
            await page.goto(url, { waitUntil: 'networkidle' })
            await page.waitForFunction(() => window.__VUESEQ_READY__ === true)
            await injectLibraries(page, { width, height })
            pages.push(page)
        }

        // Initialize Encoder on Main Page
        await encoderPage.evaluate(async ({ width, height, fps }) => {
            const { Output, Mp4OutputFormat, BufferTarget, QUALITY_HIGH, CanvasSource } = window.Mediabunny
            window.__VUESEQ_OUTPUT__ = new Output({
                format: new Mp4OutputFormat(),
                target: new BufferTarget(),
            })
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            window.__VUESEQ_ENCODE_CANVAS__ = canvas
            window.__VUESEQ_CTX__ = canvas.getContext('2d', { alpha: false })

            window.__VUESEQ_VIDEO_SOURCE__ = new CanvasSource(canvas, {
                codec: 'avc',
                bitrate: QUALITY_HIGH,
            })
            window.__VUESEQ_OUTPUT__.addVideoTrack(window.__VUESEQ_VIDEO_SOURCE__)
            await window.__VUESEQ_OUTPUT__.start()

            // Helper for pipelined loading
            window.loadAndEncode = async (frames) => {
                // 1. Parallel Load (Decode JPEGs)
                const images = await Promise.all(frames.map(frame => {
                    return new Promise((resolve) => {
                        const img = new Image()
                        img.onload = () => resolve({ img, timestamp: frame.timestamp })
                        img.src = frame.dataUrl
                    })
                }))

                // 2. Sequential Encode
                const ctx = window.__VUESEQ_CTX__
                const duration = 1 / fps
                for (const { img, timestamp } of images) {
                    ctx.drawImage(img, 0, 0)
                    await window.__VUESEQ_VIDEO_SOURCE__.add(timestamp, duration)
                }
            }
        }, { width, height, fps })


        // 3. Orchestrate
        const frameBuffer = new Map()
        let nextEncodeFrame = 0
        let encodedCount = 0

        // Batch size for transfer to encoder (reduces IPC overhead)
        const ENCODE_BATCH_SIZE = 5

        const frameAssignments = Array.from({ length: numWorkers }, () => [])
        for (let i = 0; i < totalFrames; i++) {
            frameAssignments[i % numWorkers].push(i)
        }

        // Function to process the encode queue in Batches
        const processEncodeQueue = async () => {
            const batch = []

            // Collect available sequential frames
            let lookahead = nextEncodeFrame
            while (frameBuffer.has(lookahead) && batch.length < ENCODE_BATCH_SIZE) {
                batch.push({
                    dataUrl: frameBuffer.get(lookahead),
                    timestamp: lookahead / fps
                })
                frameBuffer.delete(lookahead)
                lookahead++
            }

            if (batch.length > 0) {
                // Send batch to encoder
                await encoderPage.evaluate(async ({ frames, fps }) => {
                    await window.loadAndEncode(frames)
                }, { frames: batch, fps })

                nextEncodeFrame = lookahead
                encodedCount += batch.length

                if (onProgress) {
                    onProgress({
                        frame: encodedCount,
                        total: totalFrames,
                        percent: Math.round((encodedCount / totalFrames) * 100)
                    })
                }
            }
        }

        // Worker Loop
        const runWorker = async (workerIndex) => {
            const page = pages[workerIndex + 1]
            const frames = frameAssignments[workerIndex]

            for (const frameIndex of frames) {
                // Flow Control
                if (frameBuffer.size > MAX_BUFFERED_FRAMES) {
                    // Log only once per wait cycle to avoid spam
                    // console.log(`[Worker ${workerIndex}] Buffer full. Waiting...`) 
                    while (frameBuffer.size > MAX_BUFFERED_FRAMES - ENCODE_BATCH_SIZE) {
                        // Wait until space clears up roughly one batch
                        await new Promise(r => setTimeout(r, 50))
                        // Try to drain queue while waiting (if main thread is free here)
                        await processEncodeQueue()
                    }
                }

                const timestamp = frameIndex / fps
                const dataUrl = await captureFrameJPEG(page, timestamp)

                frameBuffer.set(frameIndex, dataUrl)

                // Try to encode available frames
                await processEncodeQueue()
            }
        }

        console.log(`  Starting parallel capture...`)

        // Run all workers
        await Promise.all(Array.from({ length: numWorkers }, (_, i) => runWorker(i)))

        // Ensure all remaining frames are encoded
        while (encodedCount < totalFrames) {
            await processEncodeQueue()
            if (encodedCount < totalFrames) await new Promise(r => setTimeout(r, 100))
        }

        console.log(`  Encoding complete. Finalizing MP4...`)

        // Finalize
        console.log(`  Transferring video data (Base64)...`)
        const base64Data = await encoderPage.evaluate(async () => {
            window.__VUESEQ_VIDEO_SOURCE__.close()
            await window.__VUESEQ_OUTPUT__.finalize()
            const buffer = window.__VUESEQ_OUTPUT__.target.buffer

            // Fast conversion to Base64 via Blob (avoids massive Array serialization overhead)
            const blob = new Blob([buffer], { type: 'video/mp4' })
            return new Promise((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result)
                reader.readAsDataURL(blob)
            })
        })

        const buffer = Buffer.from(base64Data.split(',')[1], 'base64')
        await writeFile(output, buffer)
        return output

    } finally {
        await browser.close()
        await cleanupServer()
    }
}

export { renderToMp4Parallel as renderParallel }
