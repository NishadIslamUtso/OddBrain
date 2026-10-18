import { Component, type ErrorInfo, type ReactNode } from 'react'

/** A broken screen must not leave a white window or imply a save succeeded. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message }
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OddBrain screen failed:', error, info.componentStack)
  }
  render(): ReactNode {
    if (this.state.error)
      return (
        <div className="load-failure" role="alert">
          <h1>This screen could not open.</h1>
          <p>{this.state.error}</p>
          <button type="button" className="outline-button" onClick={() => window.location.reload()}>
            Reload
          </button>
          <p>Unsaved changes were not claimed as saved.</p>
        </div>
      )
    return this.props.children
  }
}
