#!/usr/bin/env node

/**
 * VueSeq GPU Diagnostics
 *
 * Comprehensive GPU capability testing for different systems.
 * Tests various Chrome GPU backends and headless modes to find
 * the optimal configuration for video rendering.
 *
 * Usage:
 *   node test-gpu.js           # Run full diagnostics
 *   node test-gpu.js --quick   # Quick test (best config only)
 *   node test-gpu.js --json    # Output as JSON
 */

import { chromium } from 'playwright'
import { platform, arch, cpus, totalmem } from 'os'
import { parseArgs } from 'node:util'

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Profiles
// ═══════════════════════════════════════════════════════════════════════════

const GPU_CONFIGS = {
  linux: [
    {
      name: 'Vulkan (Recommended for NVIDIA/AMD)',
      channel: 'chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--use-angle=vulkan',
        '--enable-features=Vulkan',
        '--disable-vulkan-surface',
        '--enable-unsafe-webgpu',
      ],
    },
    {
      name: 'EGL (Good for Intel/Mesa)',
      channel: 'chromium',
      headless: true,
      args: ['--no-sandbox', '--use-gl=egl'],
    },
    {
      name: 'Desktop OpenGL',
      channel: 'chromium',
      headless: true,
      args: ['--no-sandbox', '--use-gl=desktop'],
    },
    {
      name: 'ANGLE OpenGL ES',
      channel: 'chromium',
      headless: true,
      args: ['--no-sandbox', '--use-angle=gl'],
    },
    {
      name: 'SwANGLE (Software Vulkan)',
      channel: 'chromium',
      headless: true,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle'],
    },
  ],
  darwin: [
    {
      name: 'Metal (Recommended for macOS)',
      channel: 'chromium',
      headless: true,
      args: ['--use-angle=metal'],
    },
    {
      name: 'Desktop OpenGL',
      channel: 'chromium',
      headless: true,
      args: ['--use-gl=desktop'],
    },
    {
      name: 'Default (Auto)',
      channel: 'chromium',
      headless: true,
      args: [],
    },
  ],
  win32: [
    {
      name: 'D3D11 (Recommended for Windows)',
      channel: 'chromium',
      headless: true,
      args: ['--use-angle=d3d11'],
    },
    {
      name: 'D3D9',
      channel: 'chromium',
      headless: true,
      args: ['--use-angle=d3d9'],
    },
    {
      name: 'Desktop OpenGL',
      channel: 'chromium',
      headless: true,
      args: ['--use-gl=desktop'],
    },
    {
      name: 'Default (Auto)',
      channel: 'chromium',
      headless: true,
      args: [],
    },
  ],
}

// Legacy headless mode configs (for comparison)
const LEGACY_CONFIGS = [
  {
    name: 'Legacy Headless (Default)',
    headless: true,
    args: ['--no-sandbox'],
  },
  {
    name: 'Legacy Headless + GPU Flags',
    headless: true,
    args: [
      '--no-sandbox',
      '--use-angle=vulkan',
      '--enable-features=Vulkan',
      '--disable-vulkan-surface',
    ],
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// GPU Detection Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test a specific GPU configuration
 */
async function testGPUConfig(config, timeout = 10000) {
  const startTime = Date.now()

  try {
    const launchOptions = {
      headless: config.headless,
      args: config.args,
      timeout: timeout,
    }
    // Add channel option for new headless mode (GPU support)
    if (config.channel) {
      launchOptions.channel = config.channel
    }
    const browser = await chromium.launch(launchOptions)

    const context = await browser.newContext()
    const page = await context.newPage()

    // Comprehensive GPU info extraction
    const gpuInfo = await page.evaluate(() => {
      const result = {
        webgl: null,
        webgl2: null,
        webgpu: null,
        canvas2d: null,
      }

      // Test WebGL 1
      try {
        const canvas1 = document.createElement('canvas')
        const gl =
          canvas1.getContext('webgl') ||
          canvas1.getContext('experimental-webgl')
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
          result.webgl = {
            supported: true,
            renderer: debugInfo
              ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
              : 'Unknown',
            vendor: debugInfo
              ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
              : 'Unknown',
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(
              gl.SHADING_LANGUAGE_VERSION,
            ),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
          }
        } else {
          result.webgl = { supported: false }
        }
      } catch (e) {
        result.webgl = { supported: false, error: e.message }
      }

      // Test WebGL 2
      try {
        const canvas2 = document.createElement('canvas')
        const gl2 = canvas2.getContext('webgl2')
        if (gl2) {
          const debugInfo = gl2.getExtension('WEBGL_debug_renderer_info')
          result.webgl2 = {
            supported: true,
            renderer: debugInfo
              ? gl2.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
              : 'Unknown',
            version: gl2.getParameter(gl2.VERSION),
            maxTextureSize: gl2.getParameter(gl2.MAX_TEXTURE_SIZE),
            max3DTextureSize: gl2.getParameter(gl2.MAX_3D_TEXTURE_SIZE),
          }
        } else {
          result.webgl2 = { supported: false }
        }
      } catch (e) {
        result.webgl2 = { supported: false, error: e.message }
      }

      // Test WebGPU
      try {
        result.webgpu = {
          supported: typeof navigator.gpu !== 'undefined',
        }
        if (result.webgpu.supported && navigator.gpu.requestAdapter) {
          // Note: Can't await in sync evaluate, just check existence
          result.webgpu.hasRequestAdapter = true
        }
      } catch (e) {
        result.webgpu = { supported: false, error: e.message }
      }

      // Test Canvas 2D performance hint
      try {
        const canvas2d = document.createElement('canvas')
        canvas2d.width = 1920
        canvas2d.height = 1080
        const ctx = canvas2d.getContext('2d', { willReadFrequently: false })
        result.canvas2d = {
          supported: !!ctx,
        }
      } catch (e) {
        result.canvas2d = { supported: false, error: e.message }
      }

      return result
    })

    // Test WebGPU adapter asynchronously
    if (gpuInfo.webgpu?.supported) {
      try {
        const webgpuDetails = await page.evaluate(async () => {
          try {
            const adapter = await navigator.gpu.requestAdapter()
            if (adapter) {
              const info = await adapter.requestAdapterInfo()
              return {
                hasAdapter: true,
                vendor: info.vendor || 'Unknown',
                architecture: info.architecture || 'Unknown',
                device: info.device || 'Unknown',
                description: info.description || 'Unknown',
              }
            }
            return { hasAdapter: false }
          } catch (e) {
            return { hasAdapter: false, error: e.message }
          }
        })
        gpuInfo.webgpu = { ...gpuInfo.webgpu, ...webgpuDetails }
      } catch {
        // WebGPU adapter request failed, keep basic info
      }
    }

    await browser.close()

    const elapsed = Date.now() - startTime

    // Determine if hardware accelerated
    const renderer = gpuInfo.webgl?.renderer?.toLowerCase() || ''
    const isSoftware =
      renderer.includes('swiftshader') ||
      renderer.includes('llvmpipe') ||
      renderer.includes('software') ||
      renderer.includes('microsoft basic render') ||
      renderer.includes('mesa') && renderer.includes('llvm')

    return {
      success: true,
      hardwareAccelerated: !isSoftware,
      gpuInfo,
      launchTime: elapsed,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      launchTime: Date.now() - startTime,
    }
  }
}

/**
 * Run a simple render benchmark
 */
async function runRenderBenchmark(config) {
  try {
    const launchOptions = {
      headless: config.headless,
      args: config.args,
    }
    if (config.channel) {
      launchOptions.channel = config.channel
    }
    const browser = await chromium.launch(launchOptions)

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const page = await context.newPage()

    // Create a simple animation test page
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; background: #1a1a2e; overflow: hidden; }
          .box {
            width: 100px;
            height: 100px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 10px;
            position: absolute;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
          }
        </style>
      </head>
      <body>
        <div id="container"></div>
        <script>
          const container = document.getElementById('container');
          for (let i = 0; i < 50; i++) {
            const box = document.createElement('div');
            box.className = 'box';
            box.style.left = Math.random() * (window.innerWidth - 100) + 'px';
            box.style.top = Math.random() * (window.innerHeight - 100) + 'px';
            container.appendChild(box);
          }
        </script>
      </body>
      </html>
    `)

    // Run screenshot benchmark
    const iterations = 10
    const startTime = Date.now()

    for (let i = 0; i < iterations; i++) {
      await page.screenshot({ type: 'png' })
    }

    const elapsed = Date.now() - startTime
    const avgFrameTime = elapsed / iterations
    const estimatedFps = 1000 / avgFrameTime

    await browser.close()

    return {
      success: true,
      iterations,
      totalTime: elapsed,
      avgFrameTime: Math.round(avgFrameTime * 10) / 10,
      estimatedFps: Math.round(estimatedFps * 10) / 10,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Output Formatting
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`
}

function printHeader(text) {
  console.log()
  console.log(colorize('═'.repeat(70), 'cyan'))
  console.log(colorize(`  ${text}`, 'bright'))
  console.log(colorize('═'.repeat(70), 'cyan'))
}

function printSubHeader(text) {
  console.log()
  console.log(colorize(`── ${text} `, 'blue') + colorize('─'.repeat(50), 'dim'))
}

function printSystemInfo() {
  const plat = platform()
  const architecture = arch()
  const cpuModel = cpus()[0]?.model || 'Unknown'
  const cpuCount = cpus().length
  const totalMemGB = (totalmem() / 1024 / 1024 / 1024).toFixed(1)

  printHeader('VueSeq GPU Diagnostics')
  console.log()
  console.log(colorize('  System Information', 'bright'))
  console.log(colorize('  ─────────────────', 'dim'))
  console.log(`  Platform:    ${colorize(plat, 'cyan')} (${architecture})`)
  console.log(`  CPU:         ${cpuModel}`)
  console.log(`  CPU Cores:   ${cpuCount}`)
  console.log(`  Memory:      ${totalMemGB} GB`)
  console.log(`  Node.js:     ${process.version}`)
}

function printConfigResult(config, result, benchmark = null) {
  const statusIcon = result.success
    ? result.hardwareAccelerated
      ? colorize('✓', 'green')
      : colorize('○', 'yellow')
    : colorize('✗', 'red')

  const statusText = result.success
    ? result.hardwareAccelerated
      ? colorize('HARDWARE', 'green')
      : colorize('SOFTWARE', 'yellow')
    : colorize('FAILED', 'red')

  console.log()
  console.log(`  ${statusIcon} ${colorize(config.name, 'bright')}`)
  console.log(`    Status:     ${statusText}`)

  if (result.success) {
    const renderer = result.gpuInfo?.webgl?.renderer || 'Unknown'
    const vendor = result.gpuInfo?.webgl?.vendor || 'Unknown'
    console.log(`    Renderer:   ${colorize(renderer, 'cyan')}`)
    console.log(`    Vendor:     ${vendor}`)
    console.log(
      `    Launch:     ${result.launchTime}ms`,
    )

    if (result.gpuInfo?.webgl2?.supported) {
      console.log(`    WebGL2:     ${colorize('Supported', 'green')}`)
    }
    if (result.gpuInfo?.webgpu?.hasAdapter) {
      console.log(
        `    WebGPU:     ${colorize('Supported', 'green')} (${result.gpuInfo.webgpu.vendor || 'Unknown'})`,
      )
    }

    if (benchmark?.success) {
      console.log(
        `    Benchmark:  ${colorize(benchmark.estimatedFps + ' fps', 'magenta')} (${benchmark.avgFrameTime}ms/frame)`,
      )
    }
  } else {
    console.log(`    Error:      ${colorize(result.error, 'red')}`)
  }

  // Show flags used
  if (config.args.length > 0) {
    console.log(
      `    Flags:      ${colorize(config.args.join(' '), 'dim')}`,
    )
  }
}

function printRecommendation(results) {
  printHeader('Recommendation')

  // Find best hardware-accelerated config
  const hardwareConfigs = results.filter(
    (r) => r.result.success && r.result.hardwareAccelerated,
  )

  if (hardwareConfigs.length > 0) {
    // Sort by benchmark FPS if available, otherwise by launch time
    hardwareConfigs.sort((a, b) => {
      if (a.benchmark?.estimatedFps && b.benchmark?.estimatedFps) {
        return b.benchmark.estimatedFps - a.benchmark.estimatedFps
      }
      return a.result.launchTime - b.result.launchTime
    })

    const best = hardwareConfigs[0]
    console.log()
    console.log(
      `  ${colorize('Best Configuration:', 'bright')} ${colorize(best.config.name, 'green')}`,
    )
    console.log()
    console.log(
      `  ${colorize('Renderer:', 'dim')} ${best.result.gpuInfo?.webgl?.renderer}`,
    )
    if (best.benchmark?.success) {
      console.log(
        `  ${colorize('Performance:', 'dim')} ~${best.benchmark.estimatedFps} fps screenshot capture`,
      )
    }
    console.log()
    console.log(colorize('  Chromium flags to use:', 'bright'))
    console.log()
    if (best.config.args.length > 0) {
      best.config.args.forEach((arg) => {
        console.log(`    ${colorize(arg, 'cyan')}`)
      })
    } else {
      console.log(`    ${colorize('(none required)', 'dim')}`)
    }
    console.log()
    console.log(
      `  ${colorize('Headless mode:', 'bright')} ${colorize(String(best.config.headless), 'cyan')}`,
    )
  } else {
    // Only software rendering available
    const softwareConfigs = results.filter((r) => r.result.success)
    if (softwareConfigs.length > 0) {
      console.log()
      console.log(
        colorize(
          '  ⚠ No hardware GPU acceleration available',
          'yellow',
        ),
      )
      console.log()
      console.log(
        '  VueSeq will use software rendering (SwiftShader).',
      )
      console.log(
        '  This is slower but will still work correctly.',
      )
      console.log()
      console.log(colorize('  To enable GPU acceleration:', 'bright'))
      console.log('  • Ensure GPU drivers are installed')
      console.log('  • On Linux: Install Vulkan drivers (vulkan-tools)')
      console.log('  • In containers: Pass through GPU devices')
    } else {
      console.log()
      console.log(colorize('  ✗ All configurations failed', 'red'))
      console.log()
      console.log('  Please check:')
      console.log('  • Playwright is installed correctly')
      console.log('  • Chromium browser is available')
      console.log('  • System has required dependencies')
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const { values } = parseArgs({
    options: {
      quick: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      benchmark: { type: 'boolean', short: 'b', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help) {
    console.log(`
VueSeq GPU Diagnostics

Usage:
  node test-gpu.js [options]

Options:
  --quick      Quick test (platform-specific configs only)
  --benchmark  Run render benchmark for each config (slower but more accurate)
  --json       Output results as JSON
  -h, --help   Show this help

Examples:
  node test-gpu.js                    # Full diagnostics
  node test-gpu.js --quick            # Quick platform-specific test
  node test-gpu.js --benchmark        # Include render benchmarks
  node test-gpu.js --json             # JSON output for scripting
`)
    process.exit(0)
  }

  const plat = platform()
  const configs = [
    ...(GPU_CONFIGS[plat] || GPU_CONFIGS.linux),
    ...(values.quick ? [] : LEGACY_CONFIGS),
  ]

  if (!values.json) {
    printSystemInfo()
    printSubHeader(`Testing ${configs.length} GPU configurations`)
  }

  const results = []

  for (const config of configs) {
    if (!values.json) {
      process.stdout.write(
        `\r  Testing: ${config.name}...`.padEnd(60),
      )
    }

    const result = await testGPUConfig(config)
    let benchmark = null

    if (values.benchmark && result.success) {
      benchmark = await runRenderBenchmark(config)
    }

    results.push({ config, result, benchmark })
  }

  if (values.json) {
    // JSON output mode
    const output = {
      system: {
        platform: plat,
        arch: arch(),
        cpuModel: cpus()[0]?.model,
        cpuCount: cpus().length,
        memoryGB: Math.round((totalmem() / 1024 / 1024 / 1024) * 10) / 10,
        nodeVersion: process.version,
      },
      results: results.map((r) => ({
        name: r.config.name,
        headless: r.config.headless,
        args: r.config.args,
        success: r.result.success,
        hardwareAccelerated: r.result.hardwareAccelerated || false,
        renderer: r.result.gpuInfo?.webgl?.renderer,
        vendor: r.result.gpuInfo?.webgl?.vendor,
        launchTime: r.result.launchTime,
        webgl2: r.result.gpuInfo?.webgl2?.supported || false,
        webgpu: r.result.gpuInfo?.webgpu?.hasAdapter || false,
        benchmark: r.benchmark,
        error: r.result.error,
      })),
      recommendation: null,
    }

    // Find recommendation
    const hwConfigs = results.filter(
      (r) => r.result.success && r.result.hardwareAccelerated,
    )
    if (hwConfigs.length > 0) {
      hwConfigs.sort((a, b) => {
        if (a.benchmark?.estimatedFps && b.benchmark?.estimatedFps) {
          return b.benchmark.estimatedFps - a.benchmark.estimatedFps
        }
        return a.result.launchTime - b.result.launchTime
      })
      const best = hwConfigs[0]
      output.recommendation = {
        name: best.config.name,
        headless: best.config.headless,
        args: best.config.args,
        renderer: best.result.gpuInfo?.webgl?.renderer,
      }
    }

    console.log(JSON.stringify(output, null, 2))
  } else {
    // Clear the "Testing..." line
    process.stdout.write('\r' + ' '.repeat(60) + '\r')

    // Print results
    for (const { config, result, benchmark } of results) {
      printConfigResult(config, result, benchmark)
    }

    // Print recommendation
    printRecommendation(results)

    console.log()
    console.log(colorize('─'.repeat(70), 'dim'))
    console.log(
      colorize('  Run with --benchmark for render performance testing', 'dim'),
    )
    console.log(colorize('─'.repeat(70), 'dim'))
    console.log()
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message)
  process.exit(1)
})
