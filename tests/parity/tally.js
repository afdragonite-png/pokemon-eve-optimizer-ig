// Debug tool: which moves / features mismatch?   PARITY_GEN=8 node tests/parity/tally.js [n] [seed]
import { generateScenarios } from './scenarios.js'
import { runScenario, compareHit } from './compare.js'
const n = +process.argv[2] || 20000, seed = +process.argv[3] || 1
const byMove = new Map(), feat = new Map(); let bad = 0, tot = 0
for (const sc of generateScenarios(n, seed)) {
  let run
  try { run = await runScenario(sc) } catch (e) { console.log('ERR', sc.move.slug, e.message.slice(0, 100)); continue }
  if (run.skipped) continue
  tot++
  const ok = compareHit(run).exact
  if (ok) continue
  bad++
  const ex = { dir: sc.direction, f: sc.features.join(','), you: sc.you.species, opp: sc.opp.species, lv: sc.level, mine: run.mine.rolls[0] + '-' + run.mine.rolls.at(-1), ref: run.ref.rolls[0] + '-' + run.ref.rolls.at(-1) }
  const e = byMove.get(sc.move.slug) || { bad: 0, ex }; e.bad++; byMove.set(sc.move.slug, e)
  for (const f of new Set(sc.features)) feat.set(f, (feat.get(f) || 0) + 1)
}
console.log(`total ${tot} bad ${bad}`)
for (const [m, e] of [...byMove].sort((a, b) => b[1].bad - a[1].bad).slice(0, 25)) console.log(m.padEnd(22), e.bad, JSON.stringify(e.ex))
console.log([...feat].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' '))
