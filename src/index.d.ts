/**
 * VueSeq - Type Definitions
 *
 * A minimal, deterministic video renderer for Vue 3 + GSAP.
 */

export interface ProgressInfo {
  /** Current frame index (0-based) */
  frame: number
  /** Total number of frames */
  total: number
  /** Current time position in seconds */
  timeInSeconds: number
  /** Completion percentage (0-100) */
  percent: number
}

export interface RenderFramesOptions {
  /** Absolute path to the Video.vue component */
  input: string
  /** Frames per second (default: 30) */
  fps?: number
  /** Duration in seconds (auto-detected from GSAP timeline if not provided) */
  duration?: number
  /** Video width in pixels (default: 1920) */
  width?: number
  /** Video height in pixels (default: 1080) */
  height?: number
  /** Progress callback invoked after each frame is captured */
  onProgress?: (info: ProgressInfo) => void
}

export interface RenderFramesResult {
  /** Path to the directory containing the rendered PNG frames */
  framesDir: string
  /** Total number of frames rendered */
  totalFrames: number
  /** Cleanup function to remove the temp directory and stop the Vite server */
  cleanup: () => Promise<void>
}

export interface RenderToMp4Options {
  /** Absolute path to the Video.vue component */
  input: string
  /** Output video file path (default: './output.mp4') */
  output?: string
  /** Frames per second (default: 30) */
  fps?: number
  /** Duration in seconds (auto-detected from GSAP timeline if not provided) */
  duration?: number
  /** Video width in pixels (default: 1920) */
  width?: number
  /** Video height in pixels (default: 1080) */
  height?: number
  /** Progress callback invoked after each frame is encoded */
  onProgress?: (info: ProgressInfo) => void
}

export interface CreateVideoServerOptions {
  /** Absolute path to the Video.vue component */
  input: string
  /** Video width in pixels */
  width: number
  /** Video height in pixels */
  height: number
}

export interface VideoServer {
  /** Local URL of the running Vite dev server */
  url: string
  /** Path to the temporary directory used by the server */
  tempDir: string
  /** Stop the server and remove the temp directory */
  cleanup: () => Promise<void>
}

/**
 * Render frames from a Vue component to PNG files.
 *
 * Launches a headless browser, serves the component via Vite,
 * and captures each frame by seeking the GSAP globalTimeline.
 */
export function renderFrames(options: RenderFramesOptions): Promise<RenderFramesResult>

/**
 * Render a Vue component directly to an MP4 video file.
 *
 * Uses WebCodecs API (via Mediabunny) for hardware-accelerated
 * H.264 encoding entirely in the browser. No FFmpeg required.
 */
export function renderToMp4(options: RenderToMp4Options): Promise<string>

/**
 * Check if the WebCodecs API is supported in the current environment.
 *
 * Launches a temporary browser instance to verify that VideoEncoder
 * and VideoFrame APIs are available.
 */
export function isWebCodecsSupported(): Promise<boolean>

/**
 * Create a Vite dev server that serves a Vue component for rendering.
 *
 * The server injects the GSAP bridge runtime and provides a
 * deterministic rendering environment. Call `cleanup()` on the
 * returned object when done.
 */
export function createVideoServer(options: CreateVideoServerOptions): Promise<VideoServer>
