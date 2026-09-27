export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Share a file via the Web Share API if the browser supports sharing files. */
export async function shareText(filename: string, text: string, mime: string): Promise<boolean> {
  try {
    const file = new File([text], filename, { type: mime })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
      return true
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return true
  }
  return false
}

export function canShareFiles(): boolean {
  try {
    const f = new File(['x'], 'x.gpx', { type: 'application/gpx+xml' })
    return !!navigator.canShare && navigator.canShare({ files: [f] })
  } catch {
    return false
  }
}
