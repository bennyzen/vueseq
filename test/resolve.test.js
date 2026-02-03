import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

describe('dependency resolution', () => {
  it('can resolve mediabunny CJS bundle', () => {
    const bundlePath = require.resolve('mediabunny')
    assert.ok(existsSync(bundlePath), `mediabunny bundle not found at ${bundlePath}`)
    assert.ok(bundlePath.endsWith('.cjs'), `expected .cjs bundle, got ${bundlePath}`)
  })

  it('can resolve html2canvas minified bundle', () => {
    const pkg = require.resolve('html2canvas/package.json')
    const bundlePath = join(dirname(pkg), 'dist', 'html2canvas.min.js')
    assert.ok(existsSync(bundlePath), `html2canvas bundle not found at ${bundlePath}`)
  })

  it('can resolve vue package', () => {
    const pkg = require.resolve('vue/package.json')
    assert.ok(existsSync(pkg))
  })

  it('can resolve gsap package', () => {
    const pkg = require.resolve('gsap/package.json')
    assert.ok(existsSync(pkg))
  })

  it('can resolve @vitejs/plugin-vue', () => {
    const pkg = require.resolve('@vitejs/plugin-vue')
    assert.ok(existsSync(pkg))
  })

  it('can resolve vite', () => {
    const pkg = require.resolve('vite')
    assert.ok(existsSync(pkg))
  })
})
