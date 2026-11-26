// Talks to the optimizer worker. One search runs at a time: starting a new one cancels the old (the worker is
// terminated, which is the only way to interrupt a synchronous search). Without Worker support (old browsers, Node,
// tests) the same call runs inline on the main thread, so callers never need to care.
import { runOptimizer, runOptimizerChampions } from './pokemonMath.js'
import { setGeneration } from './generation.js'

export class CancelledError extends Error {
  constructor() { super('Optimization cancelled'); this.name = 'CancelledError' }
}

export function createOptimizerClient({ workerFactory } = {}) {
  const makeWorker = workerFactory ?? (typeof Worker !== 'undefined'
    ? () => new Worker(new URL('../workers/optimizer.worker.js', import.meta.url), { type: 'module' })
    : null)
  let worker = null
  let pending = null // { id, resolve, reject }
  let nextId = 1

  function killWorker() { if (worker) { worker.terminate(); worker = null } }

  function cancel() {
    if (!pending) return
    const p = pending
    pending = null
    killWorker()
    p.reject(new CancelledError())
  }

  function ensureWorker() {
    if (worker) return worker
    worker = makeWorker()
    worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data
      if (!pending || pending.id !== id) return
      const p = pending; pending = null
      ok ? p.resolve(result) : p.reject(new Error(error))
    }
    worker.onerror = (e) => {
      const p = pending; pending = null
      killWorker()
      p?.reject(new Error(e?.message || 'The optimizer worker crashed.'))
    }
    return worker
  }

  function run(champions, args, generation = 9) {
    cancel()
    if (!makeWorker) {
      // Inline fallback: yield once so the "optimizing" state can paint first.
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending = { id, resolve, reject }
        setTimeout(async () => {
          if (!pending || pending.id !== id) return
          try { await setGeneration(generation) } catch (err) { const p = pending; pending = null; p?.reject(err); return }
          if (!pending || pending.id !== id) return
          const p = pending; pending = null
          try { p.resolve(champions ? runOptimizerChampions(...args) : runOptimizer(...args)) } catch (err) { p.reject(err) }
        }, 0)
      })
    }
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending = { id, resolve, reject }
      try { ensureWorker().postMessage({ id, champions, args, generation }) } catch (err) { pending = null; killWorker(); reject(err) }
    })
  }

  return { run, cancel, dispose() { cancel(); killWorker() }, get busy() { return !!pending } }
}
