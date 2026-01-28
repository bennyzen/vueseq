/**
 * GPU Detection and Configuration Module
 *
 * Provides adaptive GPU acceleration by detecting the optimal
 * GPU backend for the current system and providing appropriate
 * Chromium flags.
 */

import { chromium } from 'playwright'
import { platform } from 'os'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// ═══════════════════════════════════════════════════════════════════════════
// GPU Configuration Profiles (ordered by priority)
// ═══════════════════════════════════════════════════════════════════════════

const GPU_BACKENDS = {
    linux: [
        {
            name: 'vulkan',
            label: 'Vulkan (NVIDIA/AMD)',
            // Use channel: 'chromium' for new headless mode with GPU support
            channel: 'chromium',
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-ipc-flooding-protection',
                '--use-angle=vulkan',
                '--enable-features=Vulkan',
                '--disable-vulkan-surface',
                '--enable-unsafe-webgpu',
                '--ignore-gpu-blocklist',
            ],
        },
        {
            name: 'egl',
            label: 'EGL (Intel/Mesa)',
            channel: 'chromium',
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--use-gl=egl',
                '--ignore-gpu-blocklist',
            ],
        },
        {
            name: 'desktop',
            label: 'Desktop OpenGL',
            channel: 'chromium',
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--use-gl=desktop',
                '--ignore-gpu-blocklist',
            ],
        },
        {
            name: 'angle-gl',
            label: 'ANGLE OpenGL ES',
            channel: 'chromium',
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--use-angle=gl',
                '--ignore-gpu-blocklist',
            ],
        },
    ],
    darwin: [
        {
            name: 'metal',
            label: 'Metal (Recommended)',
            channel: 'chromium',
            headless: true,
            args: ['--use-angle=metal'],
        },
        {
            name: 'desktop',
            label: 'Desktop OpenGL',
            channel: 'chromium',
            headless: true,
            args: ['--use-gl=desktop'],
        },
        {
            name: 'auto',
            label: 'Auto',
            channel: 'chromium',
            headless: true,
            args: [],
        },
    ],
    win32: [
        {
            name: 'd3d11',
            label: 'Direct3D 11 (Recommended)',
            channel: 'chromium',
            headless: true,
            args: ['--no-sandbox', '--use-angle=d3d11'],
        },
        {
            name: 'd3d9',
            label: 'Direct3D 9',
            channel: 'chromium',
            headless: true,
            args: ['--no-sandbox', '--use-angle=d3d9'],
        },
        {
            name: 'desktop',
            label: 'Desktop OpenGL',
            channel: 'chromium',
            headless: true,
            args: ['--no-sandbox', '--use-gl=desktop'],
        },
        {
            name: 'auto',
            label: 'Auto',
            channel: 'chromium',
            headless: true,
            args: ['--no-sandbox'],
        },
    ],
}

// Software fallback for all platforms (legacy headless, no channel)
const SOFTWARE_FALLBACK = {
    name: 'software',
    label: 'Software (SwiftShader)',
    channel: undefined,
    headless: true,
    args: ['--no-sandbox'],
}

// ═══════════════════════════════════════════════════════════════════════════
// GPU Detection Cache
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_FILE = join(tmpdir(), 'vueseq-gpu-config.json')
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

let cachedConfig = null

/**
 * Load cached GPU configuration
 */
async function loadCachedConfig() {
    try {
        const data = await readFile(CACHE_FILE, 'utf-8')
        const cache = JSON.parse(data)

        // Check if cache is still valid
        if (Date.now() - cache.timestamp < CACHE_TTL) {
            return cache.config
        }
    } catch {
        // Cache doesn't exist or is invalid
    }
    return null
}

/**
 * Save GPU configuration to cache
 */
async function saveCachedConfig(config) {
    try {
        const cache = {
            timestamp: Date.now(),
            config,
        }
        await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2))
    } catch {
        // Ignore cache write errors
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GPU Detection Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test if a GPU configuration provides hardware acceleration
 */
async function testGPUBackend(backend, timeout = 8000) {
    try {
        const launchOptions = {
            headless: backend.headless,
            args: backend.args,
            timeout,
        }
        // Add channel option for new headless mode (GPU support)
        if (backend.channel) {
            launchOptions.channel = backend.channel
        }
        const browser = await chromium.launch(launchOptions)

        const context = await browser.newContext()
        const page = await context.newPage()

        const gpuInfo = await page.evaluate(() => {
            const canvas = document.createElement('canvas')
            const gl =
                canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

            if (!gl) {
                return { supported: false }
            }

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
                const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)

                const rendererLower = (renderer || '').toLowerCase()
                const isSoftware =
                    rendererLower.includes('swiftshader') ||
                    rendererLower.includes('llvmpipe') ||
                    rendererLower.includes('software') ||
                    rendererLower.includes('microsoft basic render')

                return {
                    supported: true,
                    renderer,
                    vendor,
                    isHardwareAccelerated: !isSoftware,
                }
            }

            return { supported: true, isHardwareAccelerated: false }
        })

        await browser.close()
        return gpuInfo
    } catch (error) {
        return { supported: false, error: error.message }
    }
}

/**
 * Detect the best GPU configuration for the current system
 * @param {Object} options
 * @param {boolean} [options.forceDetect=false] - Skip cache and re-detect
 * @param {string} [options.preferBackend] - Prefer a specific backend if available
 * @returns {Promise<GPUConfig>}
 */
export async function detectBestGPUConfig(options = {}) {
    const { forceDetect = false, preferBackend } = options

    // Check cache first (unless forced)
    if (!forceDetect && cachedConfig) {
        return cachedConfig
    }

    if (!forceDetect) {
        const cached = await loadCachedConfig()
        if (cached) {
            cachedConfig = cached
            return cached
        }
    }

    const plat = platform()
    const backends = GPU_BACKENDS[plat] || GPU_BACKENDS.linux

    // If a specific backend is preferred, try it first
    if (preferBackend) {
        const preferred = backends.find((b) => b.name === preferBackend)
        if (preferred) {
            const result = await testGPUBackend(preferred)
            if (result.isHardwareAccelerated) {
                const config = {
                    backend: preferred.name,
                    label: preferred.label,
                    channel: preferred.channel,
                    headless: preferred.headless,
                    args: preferred.args,
                    isHardwareAccelerated: true,
                    renderer: result.renderer,
                    vendor: result.vendor,
                }
                cachedConfig = config
                await saveCachedConfig(config)
                return config
            }
        }
    }

    // Try each backend in priority order
    for (const backend of backends) {
        const result = await testGPUBackend(backend)

        if (result.isHardwareAccelerated) {
            const config = {
                backend: backend.name,
                label: backend.label,
                channel: backend.channel,
                headless: backend.headless,
                args: backend.args,
                isHardwareAccelerated: true,
                renderer: result.renderer,
                vendor: result.vendor,
            }

            cachedConfig = config
            await saveCachedConfig(config)
            return config
        }
    }

    // Fall back to software rendering
    const config = {
        backend: SOFTWARE_FALLBACK.name,
        label: SOFTWARE_FALLBACK.label,
        channel: SOFTWARE_FALLBACK.channel,
        headless: SOFTWARE_FALLBACK.headless,
        args: SOFTWARE_FALLBACK.args,
        isHardwareAccelerated: false,
        renderer: 'SwiftShader',
        vendor: 'Google',
    }

    cachedConfig = config
    await saveCachedConfig(config)
    return config
}

/**
 * Get Chromium flags for a specific backend or auto-detect
 * @param {string} [backend='auto'] - Backend name or 'auto' for detection
 * @returns {Promise<{headless: boolean, channel?: string, args: string[]}>}
 */
export async function getOptimalChromiumConfig(backend = 'auto') {
    if (backend === 'auto') {
        const config = await detectBestGPUConfig()
        return {
            headless: config.headless,
            channel: config.channel,
            args: config.args,
        }
    }

    // Manual backend selection
    const plat = platform()
    const backends = GPU_BACKENDS[plat] || GPU_BACKENDS.linux
    const selected = backends.find((b) => b.name === backend)

    if (selected) {
        return {
            headless: selected.headless,
            channel: selected.channel,
            args: selected.args,
        }
    }

    // Fallback
    return {
        headless: SOFTWARE_FALLBACK.headless,
        channel: SOFTWARE_FALLBACK.channel,
        args: SOFTWARE_FALLBACK.args,
    }
}

/**
 * Get just the Chromium args (for compatibility with existing code)
 * @returns {Promise<string[]>}
 */
export async function getOptimalChromiumFlags() {
    const config = await getOptimalChromiumConfig('auto')
    return config.args
}

/**
 * Get available GPU backends for the current platform
 * @returns {Array<{name: string, label: string}>}
 */
export function getAvailableBackends() {
    const plat = platform()
    const backends = GPU_BACKENDS[plat] || GPU_BACKENDS.linux
    return [
        { name: 'auto', label: 'Auto-detect' },
        ...backends.map((b) => ({ name: b.name, label: b.label })),
        { name: 'software', label: 'Software (SwiftShader)' },
    ]
}

/**
 * Clear the GPU configuration cache
 */
export async function clearGPUCache() {
    cachedConfig = null
    try {
        const { unlink } = await import('fs/promises')
        await unlink(CACHE_FILE)
    } catch {
        // Ignore if file doesn't exist
    }
}

/**
 * Check GPU acceleration status (quick check)
 * @returns {Promise<{accelerated: boolean, status: string, backend: string}>}
 */
export async function checkGPUAcceleration() {
    const config = await detectBestGPUConfig()
    return {
        accelerated: config.isHardwareAccelerated,
        status: config.renderer,
        backend: config.backend,
        label: config.label,
    }
}
