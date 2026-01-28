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
import { existsSync, readFileSync } from 'node:fs'

// Show help text
function showHelp() {
  console.log(`
VueSeq - Render Vue + GSAP components to video

USAGE:
  vueseq <Video.vue> [options]

OPTIONS:
  -o, --output      Output file (default: ./output.mp4)
  -d, --duration    Duration in seconds (auto-detected if not specified)
  -f, --fps         Frames per second (default: 30)
  -w, --width       Video width in pixels (default: 1920)
  -H, --height      Video height in pixels (default: 1080)
  --gpu-backend     GPU backend: auto, vulkan, egl, metal, d3d11, software (default: auto)
  --optimized       Use optimized in-browser capture (eliminates PNG overhead)
  --parallel        Use parallel frame capture with multiple browser pages
  --workers         Number of parallel workers (default: auto-detected cores)
  --monitor-memory  Log memory usage during rendering
  --benchmark       Compare original vs optimized render methods
  -v, --version     Show version number
  --help            Show this help message

EXAMPLE:
  npx vueseq examples/HelloWorld.vue -o examples/hello.mp4
  npx vueseq examples/HelloWorld.vue --optimized -o examples/hello.mp4
  npx vueseq examples/Showcase.vue --parallel --workers 4 --monitor-memory

GPU DIAGNOSTICS:
  node test-gpu.js              # Run full GPU diagnostics
  node test-gpu.js --benchmark  # Include render benchmarks
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
    'gpu-backend': { type: 'string', default: 'auto' },
    optimized: { type: 'boolean', default: false },
    parallel: { type: 'boolean', default: false },
    workers: { type: 'string' },
    'monitor-memory': { type: 'boolean', default: false },
    benchmark: { type: 'boolean', default: false },
    version: { type: 'boolean', short: 'v' },
    help: { type: 'boolean' },
  },
})

// Show version if requested
if (values.version) {
  try {
    const pkgPath = new URL('../package.json', import.meta.url)
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    console.log(`vueseq v${pkg.version}`)
  } catch (e) {
    console.error('Error reading version:', e.message)
  }
  process.exit(0)
}

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
  const { renderToMp4, renderToMp4Optimized, benchmarkRenderMethods } =
    await import('../src/renderer/encode.js')
  const { renderToMp4Parallel } = await import(
    '../src/renderer/encode-parallel.js'
  )
  const { getTimelineDuration } = await import('../src/renderer/render.js')
  const { detectBestGPUConfig, clearGPUCache } = await import(
    '../src/renderer/gpu.js'
  )

  // Get GPU backend preference
  const gpuBackend = values['gpu-backend'] || 'auto'

  // Clear cache if specific backend requested (force re-detection)
  if (gpuBackend !== 'auto') {
    await clearGPUCache()
  }

  // Check GPU acceleration status
  const gpuConfig = await detectBestGPUConfig({
    preferBackend: gpuBackend !== 'auto' ? gpuBackend : undefined,
  })

  const gpuIcon = gpuConfig.isHardwareAccelerated ? '✓' : '○'
  const gpuMode = gpuConfig.isHardwareAccelerated ? 'Hardware' : 'Software'
  console.log(`\nGPU: ${gpuIcon} ${gpuMode}(${gpuConfig.label})`)
  console.log(`     Renderer: ${gpuConfig.renderer}`)

  // Run benchmark mode if requested
  if (values.benchmark) {
    console.log('\n📊 Running render benchmark...')
    await benchmarkRenderMethods({
      input: inputPath,
      duration: duration || 2,
      fps,
      width,
      height,
    })
    process.exit(0)
  }

  // Auto-detect duration if not provided
  if (durationAuto) {
    console.log(`\nVueSeq - Detecting timeline duration...`)
    duration = await getTimelineDuration({ input: inputPath, width, height })
    if (!duration || duration <= 0) {
      console.error(
        'Error: Could not auto-detect duration. Use -d to specify manually.',
      )
      process.exit(1)
    }
    console.log(`  Auto - detected: ${duration.toFixed(2)}s`)
  }

  // Select renderer based on flags
  const useParallel = values.parallel
  const useOptimized = values.optimized
  const numWorkers = values.workers ? parseInt(values.workers, 10) : undefined
  const monitorMemory = values['monitor-memory']

  let renderMethod
  if (useParallel) {
    renderMethod = `Parallel(${numWorkers || 'Auto'} workers)`
  } else if (useOptimized) {
    renderMethod = 'Optimized (in-browser capture)'
  } else {
    renderMethod = 'Standard (PNG-based)'
  }

  console.log(`\nVueSeq - Rendering ${input} `)
  console.log(`  Method: ${renderMethod} `)
  console.log(
    `  Duration: ${duration}s at ${fps} fps(${Math.ceil(duration * fps)} frames)${durationAuto ? ' (auto)' : ''} `,
  )
  console.log(`  Resolution: ${width}x${height} `)
  console.log(`  Output: ${values.output} \n`)

  const startTime = Date.now()
  let lastLoggedPercent = -1

  // Select render function
  let renderFn
  if (useParallel) {
    renderFn = renderToMp4Parallel
  } else if (useOptimized) {
    renderFn = renderToMp4Optimized
  } else {
    renderFn = renderToMp4
  }

  await renderFn({
    input: inputPath,
    duration,
    fps,
    width,
    height,
    output: values.output,
    workers: numWorkers,
    monitorMemory,
    onProgress: ({ frame, total, percent, workerId }) => {
      // Only log every 5% to reduce noise
      if (percent % 5 === 0 && percent !== lastLoggedPercent) {
        lastLoggedPercent = percent
        const workerInfo = workerId !== undefined ? ` [W${workerId}]` : ''
        process.stdout.write(
          `\rRendering: ${percent}% (${frame + 1}/${total} frames)${workerInfo} `,
        )
      }
    },
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n\n✓ Video saved to ${values.output} (${elapsed}s)`)
} catch (error) {
  console.error(`\nError: ${error.message} `)
  process.exit(1)
}



