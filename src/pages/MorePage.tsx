import { useRef, useState } from 'react'
import { useRecorder } from '../RecorderContext'
import { buildBackup, importBackup } from '../lib/storage'
import { downloadText } from '../lib/download'

export default function MorePage() {
  const r = useRecorder()
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const vibrateSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator

  const exportAll = () => {
    const b = buildBackup(localStorage)
    const d = new Date().toISOString().slice(0, 10)
    downloadText(`run-tracker-backup-${d}.json`, JSON.stringify(b), 'application/json')
    setMsg({ ok: true, text: `Exported ${b.runs.length} runs.` })
  }

  const onImport = async (f: File | undefined) => {
    if (!f) return
    try {
      const res = importBackup(localStorage, await f.text())
      r.reloadRuns()
      setMsg({ ok: true, text: `Imported ${res.added} runs (${res.skipped} already here). You now have ${res.total}.` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  let usedKb = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      usedKb += ((localStorage.getItem(k)?.length ?? 0) * 2) / 1024
    }
  } catch {
    /* ignore */
  }

  return (
    <div className="page">
      <h1>Settings &amp; data</h1>

      <section className="card">
        <h2>Settings</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={r.settings.vibrateOnSplit}
            onChange={(e) => r.updateSettings({ vibrateOnSplit: e.target.checked })}
          />
          <span>Vibrate on each km split</span>
        </label>
        {!vibrateSupported && <p className="muted small">This browser doesn't support vibration (e.g. iPhone Safari).</p>}
        <label className="toggle">
          <input
            type="checkbox"
            checked={r.settings.autoFollow}
            onChange={(e) => r.updateSettings({ autoFollow: e.target.checked })}
          />
          <span>Map follows my position by default</span>
        </label>
      </section>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted small">
          Runs are stored only on this device, in this browser (about {Math.round(usedKb)} KB used). Export a backup now
          and then — clearing browser data deletes your runs.
        </p>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={exportAll}>Export all (JSON)</button>
          <button className="btn btn-secondary" onClick={() => file.current?.click()}>Import backup</button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImport(e.target.files?.[0])}
          />
        </div>
        {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      </section>

      <section className="card">
        <h2>Good to know</h2>
        <ul className="small">
          <li>
            <b>Keep the screen on.</b> Browsers stop GPS when the phone is locked or the app is in the background. Run
            Tracker asks the phone to keep the screen awake while recording; if you lock it anyway, the gap is joined
            with a straight line.
          </li>
          <li>Wait for “GPS Good” before starting for the most accurate distance.</li>
          <li>Map tiles need a data connection; the app itself works offline once installed.</li>
          <li>
            Install it: iPhone Safari → Share → <i>Add to Home Screen</i>. Android Chrome → menu → <i>Install app</i> /{' '}
            <i>Add to Home screen</i>.
          </li>
        </ul>
        <p className="muted small">Run Tracker v{__APP_VERSION__} · Map © OpenStreetMap contributors</p>
      </section>
    </div>
  )
}
