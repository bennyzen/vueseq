/**
 * FFmpeg Encoder
 * 
 * Encodes PNG frames to MP4 video using FFmpeg.
 * Requires FFmpeg to be installed on the system.
 */

import { spawn } from 'child_process'
import { join } from 'path'

/**
 * Encode frames to video using FFmpeg
 * @param {Object} options
 * @param {string} options.framesDir - Directory containing frame-XXXXX.png files
 * @param {string} options.output - Output video file path
 * @param {number} [options.fps=30] - Frames per second
 * @returns {Promise<string>} - Path to the output video
 */
export function encodeVideo({ framesDir, output, fps = 30 }) {
    return new Promise((resolve, reject) => {
        const args = [
            '-y', // Overwrite output file without asking
            '-framerate', String(fps),
            '-i', join(framesDir, 'frame-%05d.png'),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p', // Compatibility with most players
            '-preset', 'fast',
            '-crf', '18', // High quality (lower = better, 18-23 is good range)
            output
        ]

        const ffmpeg = spawn('ffmpeg', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let stderr = ''
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(output)
            } else {
                reject(new Error(`FFmpeg exited with code ${code}\n${stderr}`))
            }
        })

        ffmpeg.on('error', (err) => {
            if (err.code === 'ENOENT') {
                reject(new Error(
                    'FFmpeg not found. Please install FFmpeg:\n' +
                    '  - macOS: brew install ffmpeg\n' +
                    '  - Ubuntu/Debian: sudo apt install ffmpeg\n' +
                    '  - Windows: Download from https://ffmpeg.org/download.html'
                ))
            } else {
                reject(new Error(`FFmpeg error: ${err.message}`))
            }
        })
    })
}

/**
 * Render a Vue component to MP4 video
 * @param {Object} options
 * @param {string} options.input - Absolute path to the Video.vue component
 * @param {string} [options.output='./output.mp4'] - Output video file path
 * @param {number} [options.fps=30] - Frames per second
 * @param {number} options.duration - Duration in seconds
 * @param {number} [options.width=1920] - Video width in pixels
 * @param {number} [options.height=1080] - Video height in pixels
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<string>} - Path to the output video
 */
export async function renderToMp4(options) {
    const { renderFrames } = await import('./render.js')
    const { output = './output.mp4', ...renderOptions } = options

    const { framesDir, cleanup } = await renderFrames(renderOptions)

    try {
        await encodeVideo({
            framesDir,
            output,
            fps: renderOptions.fps || 30
        })
        return output
    } finally {
        await cleanup()
    }
}
