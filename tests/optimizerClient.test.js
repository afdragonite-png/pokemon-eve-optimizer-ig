import { describe, it, expect } from 'vitest'
import { createOptimizerClient, CancelledError } from '../src/lib/optimizerClient.js'
import { runOptimizer } from '../src/lib/pokemonMath.js'
import { generateProblems, buildEngineInputs } from './parity/optimizerScore.js'

// A fake Worker that records messages and lets the test answer them.
function fakeWorkerFactory() {
  const made = []
  const factory = () => {
    const w = { sent: [], terminated: false, onmessage: null, onerror: null, postMessage(m) { this.sent.push(m) }, terminate() { this.terminated = true } }
    made.push(w); return w
  }
  return { factory, made }
}

describe('optimizer client', () => {
  it('runs inline when there is no Worker, and matches a direct call', async () => {
    const [p] = generateProblems(1, 11, { minGoals: 2, maxGoals: 2 })
    const { youData, goals, userMoveCategories, bc } = await buildEngineInputs(p)
    const flat = Object.fromEntries(['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map(k => [k, 31]))
    const args = [youData, flat, p.level, goals, userMoveCategories, '', '', bc, 'singles', {}, true, true]
    const client = createOptimizerClient({ workerFactory: null })
    // workerFactory:null falls through to `typeof Worker` (undefined in node) -> inline
    const viaClient = await client.run(false, args)
    expect(viaClient).toEqual(runOptimizer(...args))
    expect(client.busy).toBe(false)
  })

  it('resolves with the worker result and ignores answers to stale ids', async () => {
    const { factory, made } = fakeWorkerFactory()
    const client = createOptimizerClient({ workerFactory: factory })
    const p = client.run(false, ['x'])
    const w = made[0]
    expect(w.sent[0]).toMatchObject({ champions: false, args: ['x'] })
    w.onmessage({ data: { id: 999, ok: true, result: 'stale' } })
    expect(client.busy).toBe(true)
    w.onmessage({ data: { id: w.sent[0].id, ok: true, result: 'fresh' } })
    await expect(p).resolves.toBe('fresh')
  })

  it('cancel() rejects with CancelledError and terminates the worker; the next run gets a new worker', async () => {
    const { factory, made } = fakeWorkerFactory()
    const client = createOptimizerClient({ workerFactory: factory })
    const first = client.run(false, [1])
    client.cancel()
    await expect(first).rejects.toBeInstanceOf(CancelledError)
    expect(made[0].terminated).toBe(true)
    const second = client.run(true, [2])
    expect(made.length).toBe(2)
    made[1].onmessage({ data: { id: made[1].sent[0].id, ok: true, result: 'ok2' } })
    await expect(second).resolves.toBe('ok2')
  })

  it('starting a new run cancels the one in flight', async () => {
    const { factory, made } = fakeWorkerFactory()
    const client = createOptimizerClient({ workerFactory: factory })
    const a = client.run(false, ['a'])
    const b = client.run(false, ['b'])
    await expect(a).rejects.toBeInstanceOf(CancelledError)
    made[made.length - 1].onmessage({ data: { id: made[made.length - 1].sent[0].id, ok: true, result: 'B' } })
    await expect(b).resolves.toBe('B')
  })

  it('surfaces worker-side errors and crashes', async () => {
    const { factory, made } = fakeWorkerFactory()
    const client = createOptimizerClient({ workerFactory: factory })
    const a = client.run(false, [])
    made[0].onmessage({ data: { id: made[0].sent[0].id, ok: false, error: 'boom' } })
    await expect(a).rejects.toThrow('boom')
    const b = client.run(false, [])
    const w = made[made.length - 1]
    w.onerror({ message: 'crashed' })
    await expect(b).rejects.toThrow('crashed')
    expect(w.terminated).toBe(true)
  })
})
