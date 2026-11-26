import { useState } from 'react'
import { NATURES, STAT_KEYS } from '../lib/pokemonMath'

const LABELS = { hp: 'HP', attack: 'Atk', defense: 'Def', 'special-attack': 'SpA', 'special-defense': 'SpD', speed: 'Spe' }

// Optional constraints for the optimizer: lock the nature, pin individual stats to an exact investment.
// Everything left on "auto" is still optimized.
export default function OptimizerOptions({ lockedNature, setLockedNature, pinned, setPinned, championsMode, generation = 9 }) {
  const [open, setOpen] = useState(false)
  const unit = championsMode ? 'SP' : 'EVs'
  const max = championsMode ? 32 : 252, step = championsMode ? 1 : 4, budget = championsMode ? 66 : generation <= 2 ? 1512 : 510
  const pinnedTotal = STAT_KEYS.reduce((n, k) => n + (pinned[k] === '' || pinned[k] == null ? 0 : Number(pinned[k])), 0)
  const active = !!lockedNature || STAT_KEYS.some(k => pinned[k] !== '' && pinned[k] != null)

  return (
    <div className="editor-card">
      <h4 onClick={() => setOpen(!open)} style={{ cursor: 'pointer', userSelect: 'none', margin: 0, border: open ? undefined : 'none', paddingBottom: open ? undefined : 0 }}>
        Optimizer options {active ? <span className="stat-pill" style={{ fontSize: 11, marginLeft: 6 }}>in use</span> : null} {open ? '▾' : '▸'}
      </h4>
      {open && (
        <div style={{ marginTop: 10 }}>
          {(championsMode || generation >= 3) && <div className="field-row">
            <label>Nature:</label>
            <select value={lockedNature} onChange={(e) => setLockedNature(e.target.value)}>
              <option value="">Auto (optimizer picks)</option>
              {Object.keys(NATURES).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>}
          <div className="field-row" style={{ alignItems: 'flex-start' }}>
            <label>Pin {unit}:</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STAT_KEYS.map(k => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 11 }}>{LABELS[k]}</span>
                  <input type="number" min="0" max={max} step={step} placeholder="auto" style={{ width: 62 }}
                    value={pinned[k] ?? ''}
                    onChange={(e) => setPinned({ ...pinned, [k]: e.target.value === '' ? '' : Math.max(0, Math.min(max, Number(e.target.value))) })} />
                </div>
              ))}
            </div>
          </div>
          <p className="hint-text" style={{ margin: '4px 0' }}>
            A pinned stat gets exactly that many {unit}; the optimizer works with the rest ({pinnedTotal} / {budget} pinned).
            {pinnedTotal > budget && ' ⚠️ That is over the limit.'}
          </p>
          {active && (
            <button type="button" className="pill-toggle" onClick={() => { setLockedNature(''); setPinned({}) }}>Clear options</button>
          )}
        </div>
      )}
    </div>
  )
}
