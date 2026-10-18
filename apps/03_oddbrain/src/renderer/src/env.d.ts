import type { NativeApi } from '../../shared/desktop'

declare global {
  interface Window {
    oddbrain?: NativeApi
  }
}
export {}
