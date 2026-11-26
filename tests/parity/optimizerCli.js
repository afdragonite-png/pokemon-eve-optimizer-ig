// npm run optscore -- --n 300 --seed 1   : legacy (frozen Phase 2) vs current optimizer, graded by @smogon/calc.
import * as legacy from '../fixtures/pokemonMath.legacy.js'
import * as current from '../../src/lib/pokemonMath.js'
import { generateProblems, scoreOptimizer, summarize, compareEngines } from './optimizerScore.js'
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt }
const n = Number(arg('n', 300)), seed = Number(arg('seed', 1))
const hard = process.argv.includes('--hard')
const problems = generateProblems(n, seed, hard ? { minGoals: 4, maxGoals: 7 } : {})
const a = await scoreOptimizer(legacy, problems)
const b = await scoreOptimizer(current, problems)
console.log('legacy ', JSON.stringify(summarize(a)))
console.log('current', JSON.stringify(summarize(b)))
const cmp = compareEngines(a, b)
console.log(`current vs legacy on the same problems: better ${cmp.better}, same ${cmp.same}, worse ${cmp.worse}`)
for (const r of cmp.regressions.slice(0, 5)) console.log('  worse:', JSON.stringify(r))
