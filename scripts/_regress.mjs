import * as legacy from '../tests/fixtures/pokemonMath.legacy.js'
import * as current from '../src/lib/pokemonMath.js'
import { generateProblems, scoreOptimizer, compareEngines } from '../tests/parity/optimizerScore.js'
const problems = generateProblems(120, 3, { minGoals: 3, maxGoals: 6, surviveHits: 2, koHits: 1 })
const a = await scoreOptimizer(legacy, problems), b = await scoreOptimizer(current, problems)
const c = compareEngines(a, b)
console.log('better', c.better, 'same', c.same, 'worse', c.worse)
for (const r of c.regressions) { console.log(JSON.stringify(r)); console.log(JSON.stringify(problems[r.id].goals.map(g => ({ t: g.type, move: g.move?.slug, opp: g.opp.species })))); console.log(JSON.stringify(b[r.id].degraded), JSON.stringify(a[r.id])) }
