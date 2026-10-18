import { sampleEnabled } from '@shared/lib/sampleWorkspace'
import { useEffect, useState } from 'react'
import { vaultGet } from '@shared/lib/vault'
import { isDemo } from '../platform/bridge'

/**
 * Whether there is a vault to keep conversations in, and where it is.
 *
 * Asked once when the app opens, and again whenever a conversation is kept — not
 * a poll. The answer changes when someone moves a folder or a disk goes away, not
 * every few seconds, and a service checked constantly is a service you start
 * writing to cope with being asked.
 *
 * In the browser preview there is no vault behind the interface, so this asks
 * nothing at all: a failed request in the console would break the preview's own
 * rule, and inventing a vault would break a more important one.
 */
export type VaultState = {
  /** 'off' is not a vault state but a decision: keeping conversations is switched off. */
  state: 'unknown' | 'ready' | 'missing' | 'offline' | 'off'
  /** Where the vault is, as the app was told. Shown when it is missing. */
  path: string
  /** The sentence the vault gave, so the interface can repeat it rather than guess. */
  error: string
  /** How many files the vault holds, when it answered. */
  files?: number
}

export default function useVault(revision?: unknown): VaultState {
  const [vault, setVault] = useState<VaultState>({ state: 'unknown', path: '', error: '' })

  useEffect(() => {
    if (isDemo && !sampleEnabled()) return
    let cancelled = false
    const controller = new AbortController()
    vaultGet('/status', controller.signal)
      .then(reply => {
        if (cancelled) return
        if (reply?.available) {
          setVault({
            state: 'ready',
            path: String(reply.vault || ''),
            error: '',
            files: Number(reply?.counts?.files ?? 0),
          })
          return
        }
        setVault({
          state: 'missing',
          path: String(reply?.vault || ''),
          error: String(reply?.error || 'No vault was found.'),
        })
      })
      .catch(() => {
        if (!cancelled) setVault({ state: 'offline', path: '', error: '' })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [revision])

  return vault
}
