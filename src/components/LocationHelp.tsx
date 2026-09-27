export default function LocationHelp({ code, onRetry }: { code: number; onRetry: () => void }) {
  if (code !== 1) {
    return (
      <div className="banner banner-warn">
        <strong>Can't get your location.</strong> Make sure Location / GPS is switched on for your phone, and that you're
        outdoors with a clear view of the sky.
        <div className="banner-actions">
          <button className="btn btn-small" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="banner banner-error">
      <strong>Location access is blocked.</strong> Run Tracker needs your location to record runs. It stays on your phone
      and is never uploaded.
      <ul>
        <li>
          <b>iPhone (Safari):</b> in the Settings app, check <i>Privacy &amp; Security → Location Services</i> is on and
          Safari Websites is allowed. Then, in Safari, tap the <i>aA</i> (page settings) button in the address bar →{' '}
          <i>Website Settings</i> → set Location to <i>Ask</i> or <i>Allow</i>.
        </li>
        <li>
          <b>Android (Chrome):</b> tap the icon to the left of the address bar → <i>Permissions</i> (or{' '}
          <i>Site settings</i>) → allow Location. Also check Location is turned on in your phone's quick settings.
        </li>
        <li>If you installed the app to your home screen, the same browser setting applies.</li>
      </ul>
      Then reload the page or tap Try again.
      <div className="banner-actions">
        <button className="btn btn-small" onClick={onRetry}>
          Try again
        </button>
        <button className="btn btn-small btn-ghost" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  )
}
