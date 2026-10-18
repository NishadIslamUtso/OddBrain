import { useRef, useState } from 'react'
import { ImagePlus, Trash2, RotateCcw } from 'lucide-react'
import BrainMark from './BrainMark.jsx'
import { initials, shrinkImage, MAX_AVATAR_BYTES } from '../lib/profile.js'

/**
 * AvatarPicker — choose a profile picture.
 *
 * The real file input is `hidden`, so the browser's native "No file chosen"
 * control never appears. The visible control is our own button, and the chosen
 * filename is rendered by us. Note this means the filename is only ever a label:
 * it is never sent anywhere, and the image is shrunk and stored locally.
 */
export default function AvatarPicker({ profile, onChange, notify }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState('')
  const [error, setError] = useState('')

  async function handleFile(file) {
    setError('')
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      const message = `"${file.name}" is not an image. Choose a PNG, JPEG, WebP or GIF.`
      setError(message)
      notify?.(message)
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      const message = `"${file.name}" is larger than 12 MB. Pick a smaller image.`
      setError(message)
      notify?.(message)
      return
    }
    setChosen(file.name)
    setBusy(true)
    try {
      const dataUrl = await shrinkImage(file)
      // Guard against a pathological source that still encodes large.
      if (dataUrl.length > MAX_AVATAR_BYTES) throw new Error('That image is too detailed to store. Try a simpler one.')
      onChange({ avatar: dataUrl })
      notify?.(`Profile picture updated from "${file.name}". Shrunk to 128px and stored in this browser only.`)
    } catch (failure) {
      setError(failure.message)
      setChosen('')
      notify?.(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-preview" aria-hidden="true">
        {profile.avatar
          ? <img src={profile.avatar} alt="" width="56" height="56" />
          : profile.name
            ? <span className="avatar-fallback">{initials(profile.name)}</span>
            : <BrainMark size={38} />}
      </div>

      <div className="avatar-controls">
        <div className="avatar-buttons">
          {/* The visible control. The input below stays hidden on purpose. */}
          <button type="button" className="secondary-button" onClick={() => input.current?.click()} disabled={busy}>
            <ImagePlus size={15} />{busy ? 'Processing…' : 'Choose image…'}
          </button>

          {profile.avatar && (
            <>
              <button type="button" className="secondary-button" onClick={() => { onChange({ avatar: '' }); setChosen(''); notify?.('Profile picture removed.') }}>
                <Trash2 size={15} />Remove
              </button>
              <button type="button" className="secondary-button" onClick={() => { onChange({ avatar: '' }); setChosen(''); notify?.('Falling back to your initials.') }}>
                <RotateCcw size={15} />Use initials
              </button>
            </>
          )}
        </div>

        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={event => { handleFile(event.target.files?.[0]); event.target.value = '' }}
        />

        <p className="avatar-note">
          {chosen
            ? <>Selected: <strong>{chosen}</strong></>
            : 'PNG, JPEG, WebP or GIF. Resized to 128px and kept in this browser — never uploaded.'}
        </p>
        {error && <p className="avatar-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
