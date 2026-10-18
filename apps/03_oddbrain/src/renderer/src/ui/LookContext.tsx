import { createContext, useContext } from 'react'
import { DEFAULT_LOOK, type LookPreferences } from '../state/look'

/** A read-only view of the one App-owned UI preference. No second engine/store. */
export const LookContext = createContext<LookPreferences>(DEFAULT_LOOK)
export const useLook = (): LookPreferences => useContext(LookContext)

export const LookActions = createContext<(patch: Partial<LookPreferences>) => void>(() => undefined)
