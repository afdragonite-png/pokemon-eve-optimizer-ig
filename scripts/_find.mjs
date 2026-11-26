import * as legacy from '../tests/fixtures/pokemonMath.legacy.js'
import * as current from '../src/lib/pokemonMath.js'
import { generateProblems, scoreOptimizer, summarize, compareEngines } from '../tests/parity/optimizerScore.js'
for (const opts of [{ minGoals: 3, maxGoals: 6, surviveHits: 2, koHits: 1 }, { minGoals: 3, maxGoals: 6, surviveHits: 3, koHits: 1 }]) {
  const problems = generateProblems(120, 3, opts)
  const a = await scoreOptimizer(legacy, problems), b = await scoreOptimizer(current, problems)
  const infA = a.filter(r => !r.answered).length, infB = b.filter(r => !r.answered).length
  console.log(JSON.stringify(opts), 'legacy infeasible', infA, 'current infeasible', infB, 'degraded', b.filter(r => r.degraded).length)
  console.log(' legacy', JSON.stringify(summarize(a))); console.log(' current', JSON.stringify(summarize(b)))
  const c = compareEngines(a, b); console.log(' better', c.better, 'same', c.same, 'worse', c.worse)
  const ex = b.find(r => r.degraded); if (ex) console.log(' example degraded:', JSON.stringify({ id: ex.id, degraded: ex.degraded, chances: ex.chances, cost: ex.cost }))
}
