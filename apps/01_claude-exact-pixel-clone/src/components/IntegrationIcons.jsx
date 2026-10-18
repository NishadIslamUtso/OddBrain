// Inline, local-only illustrations for the screenshot cards. No CDN/font load.
export function VSCodeIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#23a9f2" d="m17.4 1.5 5.1 2.5v16l-5.1 2.5-9.2-8.1-5.3 4.1-2.4-1.2V6.7l2.4-1.2 5.3 4.1zm0 5.1-5.7 5.4 5.7 5.4zM3 8.8v6.4L6.4 12z" /></svg>
}
export function JetBrainsIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#fb256c" d="M1 7 12 1l11 8-5 14L1 20z" /><path fill="#fc851d" d="m13 1 10 6-5 8-9-7z" /><rect x="5" y="5" width="14" height="14" fill="#070707" /><text x="7" y="12" fill="white" fontSize="6" fontFamily="Arial" fontWeight="bold">JB</text><path stroke="white" strokeWidth="1.3" d="M7 16h5" /></svg>
}
export function SlackIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><g fill="#36c5f0"><rect x="2" y="9" width="9" height="4" rx="2" /><circle cx="9" cy="5" r="2" /></g><g fill="#2eb67d"><rect x="11" y="2" width="4" height="9" rx="2" /><circle cx="19" cy="9" r="2" /></g><g fill="#ecb22e"><rect x="13" y="11" width="9" height="4" rx="2" /><circle cx="15" cy="19" r="2" /></g><g fill="#e01e5a"><rect x="9" y="13" width="4" height="9" rx="2" /><circle cx="5" cy="15" r="2" /></g></svg>
}
export function DesktopIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m2 5 8-1v7H2zm11-2 9-1v9h-9zM2 14h8v7l-8-1zm11 0h9v9l-9-1z" /></svg>
}
export function TerminalIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="1" /><path d="m6 8 4 4-4 4m6 0h6" /></svg>
}
