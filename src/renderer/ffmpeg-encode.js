/**
 * FFmpeg Encoder (Legacy)
 *
 * Kept for backward compatibility. WebCodecs is now the default.
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
 * @deprecated Use WebCodecs-based encoding instead
 */
export function encodeVideo({ framesDir, output, fps = 30 }) {
  console.warn('FFmpeg encoding is deprecated. WebCodecs is now the default.')

  return new Promise((resolve, reject) => {
    const args = [
      '-y', // Overwrite output file without asking
      '-framerate',
      String(fps),
      '-i',
      join(framesDir, 'frame-%05d.png'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p', // Compatibility with most players
      '-preset',
      'fast',
      '-crf',
      '18', // High quality (lower = better, 18-23 is good range)
      output,
    ]

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
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
        reject(
          new Error(
            'FFmpeg not found. Please install FFmpeg or use WebCodecs (default).',
          ),
        )
      } else {
        reject(new Error(`FFmpeg error: ${err.message}`))
      }
    })
  })
}
