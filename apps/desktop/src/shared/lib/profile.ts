/**
 * profile.js — who is using the app.
 *
 * This is deliberately not hardcoded to any one person. The app reads a name
 * and an email from local storage and uses them in the greeting and the
 * account panel. The defaults are neutral ("Friend", no email) so that a fresh
 * clone of this repository says something sensible to whoever opens it.
 *
 * Nothing here is sent anywhere. This is a local preference, like a nickname,
 * and it is stored in this browser next to everything else.
 */

export const DEFAULT_PROFILE = Object.freeze({
  name: 'Friend',
  email: '',
  // A data URL for the profile picture, or '' to fall back to initials/logo.
  // Never uploaded; it never leaves this browser.
  avatar: '',
  // Shown under the greeting. Empty means "don't show a line", which keeps the
  // home view as quiet as the screenshot it is matched to.
  tagline: '',
})

const MAX_NAME = 40
const MAX_EMAIL = 120
const MAX_TAGLINE = 80

/** A 128px JPEG/PNG data URL is 5-20 KB; this is a ceiling for pathological images. */
export const MAX_AVATAR_BYTES = 512 * 1024

import type { Profile } from '../types'

/** A profile as stored: the domain fields plus the avatar data URL. */
export type StoredProfile = Profile

const clean = (value: unknown, max: number): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Never let the name go empty — the greeting would read "Good evening, ." */
export function normalizeProfile(value: unknown): StoredProfile {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Profile>
  const name = clean(input.name, MAX_NAME)
  return {
    name: name || DEFAULT_PROFILE.name,
    email: clean(input.email, MAX_EMAIL),
    tagline: clean(input.tagline, MAX_TAGLINE),
    // Only ever accept an inline image; anything else silently falls back.
    avatar: typeof input.avatar === 'string' && input.avatar.startsWith('data:image/') ? input.avatar : '',
  }
}

/** "Nishad Islam Utso" -> "NU"; a one-word name -> its first two letters. */
export function initials(name: string): string {
  const parts = clean(name, MAX_NAME).split(' ').filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Shrink an uploaded image before it is stored.
 *
 * localStorage is a few megabytes for the whole app, so a 4 MB photo straight
 * off a phone would eat the budget for chats and artifacts. This draws to a
 * 128px square, cover-fit, and re-encodes it, which lands around 5-20 KB.
 */
export function shrinkImage(
  file: File,
  { size = 128, type = 'image/png' }: { size?: number; type?: string } = {}
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Choose an image file (PNG, JPEG, WebP or GIF).'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('That image could not be decoded.'))
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('This canvas could not be read from.'))
          return
        }
        context.imageSmoothingQuality = 'high'
        const scale = Math.max(size / image.width, size / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
        resolve(canvas.toDataURL(type))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** First name only, for "Good evening, Ada" rather than the full string. */
export function firstName(profile: unknown): string {
  const name = normalizeProfile(profile).name
  return name.split(/\s+/)[0] || DEFAULT_PROFILE.name
}

/**
 * A best-effort starting point from the operating system account. Used only to
 * pre-fill a first-run prompt — it is a guess, so it is always shown and
 * always editable, never silently applied.
 */
export function guessProfileName(): string {
  try {
    const guess = (typeof process !== 'undefined' && process.env?.USER)
      || (typeof process !== 'undefined' && process.env?.USERNAME)
      || ''
    const name = String(guess).trim()
    if (!name) return ''
    // "nishad.islam" or "nishad_islam" reads better as "Nishad Islam".
    return name.replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).slice(0, MAX_NAME)
  } catch {
    return ''
  }
}
