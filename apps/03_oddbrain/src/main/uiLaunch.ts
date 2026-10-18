/** One normal-window opening per process. Quick/popout renderers do not claim. */
export function createLaunchGate(): () => boolean {
  let claimed = false
  return () => { if (claimed) return false; claimed = true; return true }
}
