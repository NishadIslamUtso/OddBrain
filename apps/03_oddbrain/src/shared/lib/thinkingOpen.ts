/**
 * Whether thinking blocks are unfolded. The owner's rule: a thinking block is
 * COLLAPSED unless he opened one — and once he opens one, every thinking
 * block shows open from then on. One shared flag, kept in this window's
 * storage, announced so open rows follow without a reload.
 */
export const THINKING_OPEN_KEY = 'ai-assistant.thinking-open'
export const THINKING_OPEN_EVENT = 'ob:thinking-open'

export function thinkingOpenNow(): boolean {
  try {
    return localStorage.getItem(THINKING_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

export function setThinkingOpen(open: boolean): void {
  try {
    localStorage.setItem(THINKING_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* storage refused — the flag lives only for this row then */
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(THINKING_OPEN_EVENT))
  }
}
