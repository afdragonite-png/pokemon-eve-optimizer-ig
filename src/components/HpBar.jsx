import { STATUS_CONDITIONS } from '../lib/pokemonMath'

const STATUS_SHORT = { none: 'None', burn: 'BRN', paralysis: 'PAR', poison: 'PSN', toxic: 'TOX', asleep: 'SLP', frozen: 'FRZ' }

function clampPercent(v, maxHp) {
  const n = Number(v)
  if (Number.isNaN(n)) return 100
  return Math.max(100 / maxHp, Math.min(100, n))
}

export default function HpBar({ label, percent, onPercentChange, status, onStatusChange, maxHp = 100 }) {
  const pct = clampPercent(percent, maxHp)
  const cur = Math.max(1, Math.round(pct * maxHp / 100))
  const tone = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low'

  function setCur(n) { onPercentChange(clampPercent((Number(n) / maxHp) * 100, maxHp)) }

  function setFromPointer(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    setCur(Math.round(((e.clientX - rect.left) / rect.width) * maxHp))
  }

  return (
    <div className="hp-bar-wrap">
      <div className="hp-bar-header">
        <span className="hp-bar-label">{label}</span>
        <span>
          <span className="stat-pill">{cur} / {maxHp}</span>
          {' '}<span className="hint-text">({Math.round(pct)}%)</span>
        </span>
      </div>

      <div
        className="hp-bar-track"
        role="slider" aria-valuemin={1} aria-valuemax={100} aria-valuenow={pct}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e) }}
        onPointerMove={(e) => { if (e.buttons & 1) setFromPointer(e) }}
      >
        <div className={`hp-bar-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="hp-bar-controls">
        <input type="number" min="1" max={maxHp} style={{ width: 70 }} value={cur}
          onChange={(e) => setCur(e.target.value)} /> / {maxHp}
        {[100, 50, 25, 10].map(n => (
          <button key={n} type="button" className={`pill-toggle spikes-num ${Math.abs(pct - n) < 0.01 ? 'on' : ''}`}
            onClick={() => onPercentChange(n)}>{n}%</button>
        ))}
      </div>

      <div className="status-select-row" style={{ marginTop: 6 }}>
        <span className="hint-text" style={{ marginRight: 6 }}>Status</span>
        {STATUS_CONDITIONS.map(s => (
          <button key={s} type="button" className={`pill-toggle spikes-num ${status === s ? 'on' : ''}`}
            onClick={() => onStatusChange(s)}>
            {STATUS_SHORT[s]}
          </button>
        ))}
      </div>
    </div>
  )
}
