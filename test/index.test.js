import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('public API exports', () => {
  it('exports renderFrames', async () => {
    const mod = await import('../src/index.js')
    assert.equal(typeof mod.renderFrames, 'function')
  })

  it('exports renderToMp4', async () => {
    const mod = await import('../src/index.js')
    assert.equal(typeof mod.renderToMp4, 'function')
  })

  it('exports isWebCodecsSupported', async () => {
    const mod = await import('../src/index.js')
    assert.equal(typeof mod.isWebCodecsSupported, 'function')
  })

  it('exports createVideoServer', async () => {
    const mod = await import('../src/index.js')
    assert.equal(typeof mod.createVideoServer, 'function')
  })
})
