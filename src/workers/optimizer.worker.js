// Runs the optimizer off the main thread so a heavy search (several multi-hit goals) can't freeze the page.
// Protocol: { id, champions, args, generation } in -> { id, ok: true, result } | { id, ok: false, error } out.
// `args` are exactly the arguments of runOptimizer / runOptimizerChampions (plain data, structured-cloneable).
import { runOptimizer, runOptimizerChampions } from '../lib/pokemonMath.js'
import { setGeneration } from '../lib/generation.js'

self.onmessage = async (e) => {
  const { id, champions, args, generation = 9 } = e.data
  try {
    await setGeneration(generation) // same type chart / rules as the main thread
    const result = champions ? runOptimizerChampions(...args) : runOptimizer(...args)
    self.postMessage({ id, ok: true, result })
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) })
  }
}
