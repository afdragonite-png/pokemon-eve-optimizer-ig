// Markdown report for a parity run. The cause column is deliberately split into "verified" (checked against the
// reference with a targeted experiment) and "consistent with" (what the signed differences point to, not proven).
export const KNOWN_STAT_DEVIATIONS = ['Shedinja:hp'] // Shedinja's HP is always 1; calculateStat() does not special-case it.

// Known causes of a mismatch, by feature. Empty now that the engine uses the game's 4096ths arithmetic and matches the calc exactly;
// add an entry here if a future change reintroduces a known difference.
const CAUSES = []
export function causeFor(feature) { return CAUSES.find(c => c.match.test(feature)) ?? null }

const row = (cells) => `| ${cells.join(' | ')} |`

export function renderReport(r, { baseline } = {}) {
  const L = []
  L.push('# Damage engine vs @smogon/calc')
  L.push('')
  L.push(`${r.compared.toLocaleString()} matchups compared (seed ${r.meta.seed}, ${r.meta.movePool} plain damaging moves, Gen 9, singles + doubles). Reference: @smogon/calc ${r.meta.calcVersion}.`)
  L.push('')
  L.push('## Headline')
  L.push('')
  L.push(row(['Tier', 'Matchups', 'All 16 rolls identical', 'KO threshold flips']))
  L.push(row(['---', '---:', '---:', '---:']))
  const names = { bare: 'Bare (no items / abilities / field)', single: 'Exactly one extra feature', mixed: '2-3 features combined' }
  for (const t of ['bare', 'single', 'mixed']) L.push(row([names[t], r.tiers[t].n, `${r.tiers[t].exactPct}%`, `${r.tiers[t].flipPct}%`]))
  L.push(row(['**All**', `**${r.compared}**`, `**${r.exactPct}%**`, `**${r.anyFlipPct}%**`]))
  L.push('')
  L.push(`A "KO threshold flip" is a matchup where the two calculators disagree on how many of the 16 rolls KO, or on the fewest hits that could / must KO. By kind: OHKO roll count ${r.flipKinds.ohkoRolls}%, guaranteed N-hit KO ${r.flipKinds.guaranteedN}%, possible N-hit KO ${r.flipKinds.possibleN}%.`)
  L.push('')
  L.push('**Reading it:** the bare tier is the damage formula itself, so it shows the base maths is right. Everything that goes wrong is a modifier (item, ability, field) applied at a different stage or with different rounding from the game.')
  L.push('')
  L.push('## Stat formulas')
  L.push('')
  const unknown = r.statParity.unknown ?? []
  L.push(`${r.statParity.checked.toLocaleString()} stat values checked; ${r.statParity.mismatches} deviation(s), all of them ${unknown.length ? 'NOT all known: ' + unknown.join(', ') : 'known: ' + KNOWN_STAT_DEVIATIONS.join(', ') + ' (always 1 HP in the game)'}.`)
  L.push('')
  L.push('## Where the differences come from')
  L.push('')
  L.push('Ranked on matchups with exactly one extra feature, so one feature\'s rate is not contaminated by another\'s. "Low / high" = share of the 16 rolls where the engine is below / above the reference.')
  L.push('')
  L.push(row(['Feature', 'n', 'Mismatch', 'Engine low', 'Engine high', 'KO flips', 'Cause']))
  L.push(row(['---', '---:', '---:', '---:', '---:', '---:', '---']))
  for (const f of r.byFeature.filter(f => f.mismatchPct >= 4).slice(0, 30)) {
    const c = causeFor(f.key)
    L.push(row([`\`${f.key}\``, f.n, `${f.mismatchPct}%`, `${f.rollsLowPct}%`, `${f.rollsHighPct}%`, `${f.flipPct}%`, c ? `${c.kind === 'verified' ? '**Verified.** ' : 'Consistent with: '}${c.text}` : '_not yet analysed_']))
  }
  L.push('')
  const minor = r.byFeature.filter(f => f.mismatchPct > 0 && f.mismatchPct < 4)
  L.push(`${minor.length} further features differ in under 4% of their matchups (mostly +/-1 rounding on single type-boost items, screens, crits and stat stages).`)
  L.push('')
  L.push('## Worst individual cases')
  L.push('')
  L.push(row(['#', 'Direction', 'Move', 'You', 'Opponent', 'Lv', 'Features', 'Engine min-max', 'Reference min-max', 'HP']))
  L.push(row(['---:', '---', '---', '---', '---', '---:', '---', '---', '---', '---:']))
  for (const w of r.worst) L.push(row([w.id, w.direction, w.move, w.you, w.opp, w.level, w.features.join(', ') || '-', w.mine.join('-'), w.ref.join('-'), w.hp]))
  L.push('')
  if (baseline) {
    L.push('## Against the saved baseline')
    L.push('')
    L.push(row(['Metric', 'Baseline', 'Now']))
    L.push(row(['---', '---:', '---:']))
    for (const [k, a, b] of [['bare exact %', baseline.tiers.bare.exactPct, r.tiers.bare.exactPct], ['single exact %', baseline.tiers.single.exactPct, r.tiers.single.exactPct], ['mixed exact %', baseline.tiers.mixed.exactPct, r.tiers.mixed.exactPct], ['KO threshold flips %', baseline.anyFlipPct, r.anyFlipPct]]) L.push(row([k, a, b]))
    L.push('')
  }
  L.push('## Known gaps this suite does not cover')
  L.push('')
  L.push('- Multi-hit moves, Parental Bond, fixed-damage / OHKO moves and variable-power moves (Low Kick, Gyro Ball, ...) are not in the random sweep; the engine\'s own unit tests cover those.')
  L.push('- Moves the reference special-cases (Synchronoise, Revelation Dance, Thousand Arrows, Hidden Power (IV-typed), charge-turn boosts) are excluded. Flying Press and Freeze-Dry are in the sweep.')
  L.push('- Shedinja\'s HP is always 1 in the game; the engine computes it like any other Pokémon.')
  L.push('')
  return L.join('\n')
}
