import { memo } from 'react'
import { calculateStat, calculateStatChampions, ivFor } from '../lib/pokemonMath'
import { activeGeneration } from '../lib/generation'

// A KO / survive / outspeed goal counts as "met" when its chance is at least this high.
export const GOAL_MET_CHANCE = 0.5

// One row per possible number of hits for a multi-hit move (the optimizer uses the highlighted one).
function HitBreakdown({ rows, chanceLabel }) {
  if (!rows) return null
  return (
    <table className="stat-table" style={{ fontSize: 12, marginTop: 6 }}>
      <thead><tr><th>Hits</th><th>Damage</th><th>% HP</th><th>{chanceLabel}</th></tr></thead>
      <tbody>
        {rows.map(b => (
          <tr key={b.hits} style={b.isCurrent ? { fontWeight: 700 } : undefined}>
            <td>{b.hits}{b.isCurrent ? ' ◀' : ''}</td>
            <td>{b.min}–{b.max}</td>
            <td>{b.minPct.toFixed(1)}–{b.maxPct.toFixed(1)}%</td>
            <td>{Math.round(b.chance * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
function moveNote(o) {
  const bits = []
  if (o.special === 'ohko') bits.push('OHKO move')
  else if (o.special === 'fixed') bits.push('fixed damage')
  else if (o.special === 'half-current') bits.push('halves current HP')
  if (o.hitCount > 1) bits.push(o.parentalBond ? 'Parental Bond' : `${o.hitCount} hits`)
  return bits.length ? ` (${bits.join(', ')})` : ''
}
// Sturdy / Focus Sash / Disguise / Ice Face and stat-boosting berries or abilities that change the maths.
function effectNote(o) {
  const bits = []
  if (o.endure === 'sturdy') bits.push('Sturdy: survives any hit from full HP')
  if (o.endure === 'sash') bits.push('Focus Sash: survives one hit from full HP')
  if (o.guard === 'disguise') bits.push('Disguise absorbs the first hit')
  if (o.guard === 'ice-face') bits.push('Ice Face absorbs the first physical hit')
  if (o.boostEffects?.length) bits.push('gains Defense / Sp. Def as it is hit (berry / ability)')
  return bits.length ? bits.join(' · ') : ''
}
function perHitText(o) {
  return o.perHit && o.perHit.length > 1 ? ` [${o.perHit.map(h => `${h.min}–${h.max}`).join(' + ')}]` : ''
}

function goalLabel(g) {
  if (!g) return 'a goal'
  const what = g.type === 'ko' ? `KO${g.koHits > 1 ? ` (${g.koHits}HKO)` : ''}` : g.type === 'survive' ? `Survive${g.surviveHits > 1 ? ` (${g.surviveHits} hits)` : ''}` : 'Outspeed'
  return `${what}${g.opponentName ? ` — ${g.opponentName}` : ''}`
}
const DROP_REASON = { 'speed-unreachable': "can't be reached even with maximum Speed", unreachable: "can't be reached even with maximum investment", budget: "didn't fit in the budget" }

// What the optimizer gave up to produce an answer at all (Phase 4: graceful degradation).
function DegradedNotice({ degraded, goals, championsMode }) {
  const byId = new Map(goals.map(g => [g.id, g]))
  return (
    <div className="damage-box warn" role="status">
      <p><strong>{!championsMode && activeGeneration() <= 2 ? 'Not every goal can be met, even with every stat maxed.' : `Not every goal fits in ${championsMode ? '66 SP' : '510 EVs'}.`}</strong> This is the best compromise the optimizer found, giving up the lowest-priority goals first.</p>
      <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
        {degraded.dropped.map(d => (
          <li key={d.id}><strong>Gave up:</strong> {goalLabel(byId.get(d.id))} <span className="hint-text">({DROP_REASON[d.reason] ?? DROP_REASON.budget})</span></li>
        ))}
        {degraded.relaxed.map(r => (
          <li key={r.id}><strong>Eased:</strong> {goalLabel(byId.get(r.id))} — {r.type === 'ko' ? `${r.from === 1 ? 'OHKO' : r.from + 'HKO'} → ${r.to}HKO` : `survive ${r.from} hit${r.from > 1 ? 's' : ''} → ${r.to}`}</li>
        ))}
      </ul>
      <p className="hint-text" style={{ marginTop: 6 }}>Raise a goal's priority in its tab to protect it. The chances below are for the goals as you set them.</p>
    </div>
  )
}

// The whole results area. Memoized: it only re-renders when the result / evaluation actually change, not on every
// keystroke elsewhere in the app.
function ResultsView({ result, postview, goals, pokemonData, ivs, level, championsMode }) {
  if (!result) return null
  const unit = championsMode ? 'SP' : 'EVs'
  const oldGen = !championsMode && activeGeneration() <= 2 // Gens 1-2: stat experience, no cap worth showing, no natures
  const budget = championsMode ? 66 : oldGen ? 1512 : 510
  const dropped = new Set((result.degraded?.dropped ?? []).map(d => d.id))
  const goalsMet = postview ? postview.filter(o => !o.incomplete && o.chance >= GOAL_MET_CHANCE).length : 0
  return (
    <>
      <div className="editor-card">
        <h4>{oldGen ? 'Spread' : `Best nature: ${result.natureName}`} {' '}(total {unit} used: {result.totalCost}{oldGen ? '' : ` / ${budget}`})</h4>
        <ul>
          {pokemonData.stats.map((s) => {
            const key = s.stat.name
            const val = championsMode ? result.spNeeded[key] : result.evsNeeded[key]
            const final = championsMode
              ? calculateStatChampions(key, s.base_stat, val, result.natureName)
              : calculateStat(key, s.base_stat, ivFor(key, result.ivs ?? ivs), val, level, result.natureName)
            // Only IVs the optimizer changed are shown (everything else is 31). Champions has no IVs.
            const ivNote = !championsMode && result.ivOverrides?.[key] !== undefined ? ` (${result.ivOverrides[key]} IV)` : ''
            return <li key={key}>{key}: {val} {unit}{ivNote} → <span className="stat-pill">{final}</span></li>
          })}
        </ul>
      </div>

      {result.degraded && <div className="editor-card"><DegradedNotice degraded={result.degraded} goals={goals} championsMode={championsMode} /></div>}

      {postview && goals.length > 0 && (
        <div className="editor-card">
          <h4>Goals met (≥{Math.round(GOAL_MET_CHANCE * 100)}% chance): {goalsMet} / {goals.length}</h4>
          {goalsMet < goals.length && !result.degraded && (
            <p className="damage-box warn">
              Some goals are below a {Math.round(GOAL_MET_CHANCE * 100)}% chance or couldn't be evaluated. {oldGen ? 'Even with every stat maxed' : `Within ${budget} ${unit}`} the spread above gives the best odds the optimizer found.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {postview.map((o, i) => (
              <div key={goals[i]?.id ?? i} className={`damage-box ${o.incomplete ? 'warn' : o.chance === 1 ? 'safe' : o.chance > 0 ? 'warn' : 'danger'}`}>
                {dropped.has(goals[i]?.id) && <p className="hint-text">Given up to make the rest fit — this is the chance you get anyway:</p>}
                {o.incomplete && <p>{o.type} vs {o.opponentName || '?'}: incomplete data, could not evaluate.</p>}

                {o.type === 'outspeed' && !o.incomplete && (
                  <p>
                    <strong>Outspeed {o.opponentName}</strong> {o.trickRoom ? '(Trick Room)' : ''} —
                    You: {o.yourSpeed} vs Them: {o.theirSpeed} →
                    {' '}{o.orderDecided
                      ? (o.orderDecided === 'win'
                          ? '✅ You move first (they move last: Lagging Tail / Stall)'
                          : '❌ They move first (you move last: Lagging Tail / Stall)')
                      : o.quickClaw
                        ? `${Math.round(o.chance * 100)}% chance to move first (Quick Claw / Quick Draw in play)`
                        : o.tie ? '🤝 Speed tie — 50% chance to move first' : o.outcome ? '✅ You move first' : '❌ They move first'}
                  </p>
                )}
                {o.type === 'survive' && !o.incomplete && (
                  <div>
                    {o.protectedTurn ? (
                      <p><strong>Protect vs {o.opponentName}'s {o.moveName}</strong> — 🛡️ Protected, 0 damage this turn</p>
                    ) : (
                      <>
                        <p>
                          <strong>{o.opponentName}'s {o.moveName}</strong>
                          {o.critical ? ' 💥 crit' : ''}{moveNote(o)}{' '}
                          {o.immune ? 'has no effect.' : (
                            <>deals {o.min}–{o.max} damage per use{perHitText(o)}
                            {' '}({o.minPct.toFixed(1)}%–{o.maxPct.toFixed(1)}% of your {Math.round(o.hpStat)} HP).</>
                          )}
                          {' '}{o.hits > 1
                            ? `Chance to survive all ${o.hits} attacks: ${Math.round(o.survivalChance * 100)}%`
                            : `Chance to survive: ${Math.round(o.survivalChance * 100)}%`}
                          {o.maxPct >= 100 && o.survivalChance > 0 && ' (max roll alone can KO)'}
                          {o.survivalChance === 1 && o.maxPct >= 100 && ' ⚠️ inconsistent — check inputs'}
                        </p>
                        {effectNote(o) && <p className="hint-text">{effectNote(o)}</p>}
                        <HitBreakdown rows={o.breakdown} chanceLabel="Survive" />
                      </>
                    )}
                  </div>
                )}
                {o.type === 'ko' && !o.incomplete && (
                  <div>
                    {o.protectedTurn ? (
                      <p><strong>{o.opponentName} Protects</strong> — 🛡️ your {o.moveName} deals 0 damage this turn</p>
                    ) : (
                      <>
                        <p>
                          <strong>{o.hits === 1 ? 'OHKO' : `${o.hits}HKO`} {o.opponentName} with {o.moveName}</strong>
                          {o.critical ? ' 💥 crit' : ''}{moveNote(o)} —{' '}
                          {o.immune ? 'no effect' : (
                            <>{o.min}–{o.max} dmg per use{perHitText(o)} ({o.minPct.toFixed(1)}%–{o.maxPct.toFixed(1)}% of {Math.round(o.oppHP)} HP) →
                            {' '}{Math.round(o.koChance * 100)}% chance to {o.hits === 1 ? 'OHKO' : `${o.hits}HKO`}</>
                          )}
                        </p>
                        {effectNote(o) && <p className="hint-text">{effectNote(o)}</p>}
                        <HitBreakdown rows={o.breakdown} chanceLabel={o.hits === 1 ? 'OHKO' : `${o.hits}HKO`} />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default memo(ResultsView)
