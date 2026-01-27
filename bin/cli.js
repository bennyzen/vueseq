#!/usr/bin/env node

/**
 * VueSeq CLI
 * 
 * Render Vue + GSAP components to video.
 * 
 * Usage:
 *   vueseq <Video.vue> [options]
 * 
 * Example:
 *   vueseq MyAnimation.vue -d 5 -o my-video.mp4
 */

import { parseArgs } from 'node:util'
import { resolve, extname } from 'node:path'
import { existsSync } from 'node:fs'

// Show help text
function showHelp() {
    console.log(`
VueSeq - Render Vue + GSAP components to video

USAGE:
  vueseq <Video.vue> [options]

OPTIONS:
  -o, --output   Output file (default: ./output.mp4)
  -d, --duration Duration in seconds (auto-detected if not specified)
  -f, --fps      Frames per second (default: 30)
  -w, --width    Video width in pixels (default: 1920)
  -H, --height   Video height in pixels (default: 1080)
  --help         Show this help message

EXAMPLE:
  npx vueseq examples/HelloWorld.vue -o examples/hello.mp4
  npx vueseq examples/Showcase.vue -w 1280 -H 720 -f 60 -o examples/showcase.mp4
`)
}

// Parse command line arguments
const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        output: { type: 'string', short: 'o', default: './output.mp4' },
        duration: { type: 'string', short: 'd' },
        fps: { type: 'string', short: 'f', default: '30' },
        width: { type: 'string', short: 'w', default: '1920' },
        height: { type: 'string', short: 'H', default: '1080' },
        help: { type: 'boolean' }
    }
})

// Show help if requested
if (values.help) {
    showHelp()
    process.exit(0)
}

// Validate input file
const input = positionals[0]
if (!input) {
    console.error('Error: Please specify a .vue file\n')
    showHelp()
    process.exit(1)
}

const inputPath = resolve(input)
if (!existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`)
    process.exit(1)
}

if (extname(inputPath) !== '.vue') {
    console.error('Error: Input must be a .vue file')
    process.exit(1)
}

// Parse duration if provided
let duration = null
let durationAuto = false

if (values.duration) {
    duration = parseFloat(values.duration)
    if (isNaN(duration) || duration <= 0) {
        console.error('Error: Duration must be a positive number')
        process.exit(1)
    }
} else {
    durationAuto = true
}

// Parse numeric options
const fps = parseInt(values.fps)
const width = parseInt(values.width)
const height = parseInt(values.height)

if (isNaN(fps) || fps <= 0) {
    console.error('Error: FPS must be a positive number')
    process.exit(1)
}

if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
    console.error('Error: Width and height must be positive numbers')
    process.exit(1)
}

// Import renderer and start rendering
try {
    const { renderToMp4 } = await import('../src/renderer/encode.js')
    const { getTimelineDuration } = await import('../src/renderer/render.js')

    // Auto-detect duration if not provided
    if (durationAuto) {
        console.log(`\nVueSeq - Detecting timeline duration...`)
        duration = await getTimelineDuration({ input: inputPath, width, height })
        if (!duration || duration <= 0) {
            console.error('Error: Could not auto-detect duration. Use -d to specify manually.')
            process.exit(1)
        }
        console.log(`  Auto-detected: ${duration.toFixed(2)}s`)
    }

    console.log(`\nVueSeq - Rendering ${input}`)
    console.log(`  Duration: ${duration}s at ${fps}fps (${Math.ceil(duration * fps)} frames)${durationAuto ? ' (auto)' : ''}`)
    console.log(`  Resolution: ${width}x${height}`)
    console.log(`  Output: ${values.output}\n`)

    const startTime = Date.now()
    let lastLoggedPercent = -1

    await renderToMp4({
        input: inputPath,
        duration,
        fps,
        width,
        height,
        output: values.output,
        onProgress: ({ frame, total, percent }) => {
            // Only log every 5% to reduce noise
            if (percent % 5 === 0 && percent !== lastLoggedPercent) {
                lastLoggedPercent = percent
                process.stdout.write(`\rRendering: ${percent}% (${frame + 1}/${total} frames)`)
            }
        }
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n\n✓ Video saved to ${values.output} (${elapsed}s)`)

} catch (error) {
    console.error(`\nError: ${error.message}`)
    process.exit(1)
}
