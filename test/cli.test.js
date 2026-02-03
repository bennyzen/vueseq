import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const exec = promisify(execFile)
const cli = resolve(import.meta.dirname, '../bin/cli.js')

describe('CLI', () => {
  it('shows help with --help', async () => {
    const { stdout } = await exec('node', [cli, '--help'])
    assert.ok(stdout.includes('VueSeq'))
    assert.ok(stdout.includes('--output'))
    assert.ok(stdout.includes('--duration'))
    assert.ok(stdout.includes('--fps'))
  })

  it('shows version with --version', async () => {
    const { stdout } = await exec('node', [cli, '--version'])
    assert.match(stdout.trim(), /^vueseq v\d+\.\d+\.\d+/)
  })

  it('errors when no input file is given', async () => {
    await assert.rejects(
      () => exec('node', [cli]),
      (err) => {
        assert.ok(err.stderr.includes('Error') || err.stdout.includes('Error'))
        return true
      },
    )
  })

  it('errors when input file does not exist', async () => {
    await assert.rejects(
      () => exec('node', [cli, 'nonexistent.vue']),
      (err) => {
        assert.ok(err.stderr.includes('not found') || err.stdout.includes('not found'))
        return true
      },
    )
  })

  it('errors when input file is not a .vue file', async () => {
    await assert.rejects(
      () => exec('node', [cli, 'package.json']),
      (err) => {
        assert.ok(err.stderr.includes('.vue') || err.stdout.includes('.vue'))
        return true
      },
    )
  })

  it('errors when duration is invalid', async () => {
    await assert.rejects(
      () => exec('node', [cli, 'examples/HelloWorld.vue', '-d', 'abc']),
      (err) => {
        assert.ok(err.stderr.includes('positive number') || err.stdout.includes('positive number'))
        return true
      },
    )
  })

  it('errors when fps is invalid', async () => {
    await assert.rejects(
      () => exec('node', [cli, 'examples/HelloWorld.vue', '-f', '0']),
      (err) => {
        assert.ok(err.stderr.includes('positive number') || err.stdout.includes('positive number'))
        return true
      },
    )
  })
})
