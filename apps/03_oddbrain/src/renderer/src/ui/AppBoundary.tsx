import { Component, type ErrorInfo, type ReactNode } from 'react'
/** Unexpected rendering failures show a recovery action, never a blank page. */
export default class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo): void { console.error('OddBrain interface error', error, info) }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return <main className="ob-render-error"><h1>This screen could not open.</h1><p>Your saved files and settings have not been reset.</p><button type="button" className="ob-small-button" onClick={() => window.location.reload()}>Reload OddBrain</button></main>
  }
}
