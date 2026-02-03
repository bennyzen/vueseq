import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('gpu module', () => {
  it('exports getOptimalChromiumConfig', async () => {
    const mod = await import('../src/renderer/gpu.js')
    assert.equal(typeof mod.getOptimalChromiumConfig, 'function')
  })

  it('exports getAvailableBackends', async () => {
    const mod = await import('../src/renderer/gpu.js')
    assert.equal(typeof mod.getAvailableBackends, 'function')
  })

  it('getAvailableBackends returns array with auto option', async () => {
    const { getAvailableBackends } = await import('../src/renderer/gpu.js')
    const backends = getAvailableBackends()
    assert.ok(Array.isArray(backends))
    assert.ok(backends.length > 0)
    assert.ok(backends.some(b => b.name === 'auto'))
    assert.ok(backends.some(b => b.name === 'software'))
  })

  it('getAvailableBackends entries have name and label', async () => {
    const { getAvailableBackends } = await import('../src/renderer/gpu.js')
    const backends = getAvailableBackends()
    for (const backend of backends) {
      assert.equal(typeof backend.name, 'string')
      assert.equal(typeof backend.label, 'string')
    }
  })

  it('getOptimalChromiumConfig with manual backend returns correct shape', async () => {
    const { getOptimalChromiumConfig } = await import('../src/renderer/gpu.js')
    const config = await getOptimalChromiumConfig('software')
    assert.equal(typeof config.headless, 'boolean')
    assert.ok(Array.isArray(config.args))
  })
})
