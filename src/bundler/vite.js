/**
 * Vite Bundler
 * 
 * Creates a temporary Vite dev server that:
 * 1. Serves the user's Video.vue component
 * 2. Injects the GSAP bridge runtime
 * 3. Provides an entry HTML file
 */

import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/**
 * Create a Vite dev server for rendering a Vue component
 * @param {Object} options
 * @param {string} options.input - Absolute path to the Video.vue component
 * @param {number} options.width - Video width in pixels
 * @param {number} options.height - Video height in pixels
 * @returns {Promise<{url: string, tempDir: string, cleanup: () => Promise<void>}>}
 */
export async function createVideoServer({ input, width, height }) {
    // Create temp directory for build artifacts
    const tempDir = await mkdtemp(resolve(tmpdir(), 'vueseq-'))

    // Path to the gsap-bridge runtime
    const gsapBridgePath = resolve(__dirname, '../runtime/gsap-bridge.js')

    // User's project directory (where the video component lives)
    const userProjectDir = dirname(input)

    // VueSeq package root (for resolving our dependencies)
    const vueseqRoot = resolve(__dirname, '../..')

    // Resolve package paths from vueseq's node_modules
    const vuePath = dirname(require.resolve('vue/package.json'))
    const gsapPath = dirname(require.resolve('gsap/package.json'))

    // Generate entry HTML with proper viewport sizing
    const entryHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}, height=${height}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: ${width}px; 
      height: ${height}px; 
      overflow: hidden;
      background: #000;
    }
    #app {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/@vueseq/entry.js"></script>
</body>
</html>`

    await writeFile(resolve(tempDir, 'index.html'), entryHtml)

    // Virtual module plugin for the entry point
    const virtualEntryPlugin = {
        name: 'vueseq-entry',
        resolveId(id) {
            if (id === '/@vueseq/entry.js') return id
            if (id === '/@vueseq/gsap-bridge.js') return gsapBridgePath
        },
        load(id) {
            if (id === '/@vueseq/entry.js') {
                // Generate the entry module that imports the user's component
                return `
import { createApp } from 'vue'
import '/@vueseq/gsap-bridge.js'
import Video from '${input}'

const app = createApp(Video)
app.mount('#app')

// Signal ready after Vue has mounted
window.__VUESEQ_READY__ = true
`
            }
        }
    }

    const server = await createServer({
        root: tempDir,
        plugins: [vue(), virtualEntryPlugin],
        server: {
            port: 0, // Auto-assign available port
            strictPort: false
        },
        resolve: {
            alias: {
                // Resolve vue and gsap from vueseq's node_modules
                'vue': vuePath,
                'gsap': gsapPath
            }
        },
        optimizeDeps: {
            // Let Vite know where to find these
            include: ['vue', 'gsap'],
            // Force re-optimization in temp directory
            force: true,
            // Include paths for the optimizer to search
            entries: [input]
        },
        // Allow serving files from:
        // 1. temp directory (index.html)
        // 2. user's project (Video.vue and its imports)
        // 3. vueseq package (gsap-bridge.js and dependencies)
        fs: {
            allow: [
                tempDir,
                userProjectDir,
                vueseqRoot,
                vuePath,
                gsapPath
            ]
        },
        logLevel: 'warn' // Reduce noise during rendering
    })

    await server.listen()
    const address = server.httpServer.address()
    const url = `http://localhost:${address.port}`

    return {
        url,
        tempDir,
        cleanup: async () => {
            await server.close()
            await rm(tempDir, { recursive: true, force: true })
        }
    }
}
