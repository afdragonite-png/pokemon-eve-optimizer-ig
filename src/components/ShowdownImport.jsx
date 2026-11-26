import { useState } from 'react'

// A small "paste a Showdown set" box. `onImport(text)` must return { ok, message } (it may be async).
export default function ShowdownImport({ label = 'Import from Showdown', hint, onImport }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!text.trim()) { setStatus({ ok: false, message: 'Paste a set first.' }); return }
    setBusy(true)
    try {
      const res = await onImport(text)
      setStatus(res)
      if (res?.ok) { setText(''); setOpen(false) }
    } catch (err) {
      setStatus({ ok: false, message: 'Import failed: ' + (err?.message ?? 'unknown error') })
    } finally { setBusy(false) }
  }

  return (
    <div style={{ margin: '8px 0' }}>
      <button type="button" className={`pill-toggle ${open ? 'on' : ''}`} onClick={() => { setOpen(!open); setStatus(null) }}>
        📥 {label}
      </button>
      {!open && status?.ok && <span className="hint-text" style={{ marginLeft: 8 }}>{status.message}</span>}
      {open && (
        <div style={{ marginTop: 8 }}>
          <textarea
            rows={9} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'Garchomp @ Rocky Helmet\nAbility: Rough Skin\nLevel: 50\nEVs: 252 HP / 4 Def / 252 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Protect'}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="pill-toggle on" disabled={busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
            <button type="button" className="pill-toggle" onClick={() => { setOpen(false); setStatus(null) }}>Cancel</button>
            {hint && <span className="hint-text">{hint}</span>}
          </div>
          {status && !status.ok && <p className="damage-box danger" style={{ marginTop: 6 }}>{status.message}</p>}
        </div>
      )}
    </div>
  )
}
