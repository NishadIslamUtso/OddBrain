import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; label?: string }
type State = { error: Error | null }

/**
 * A crashed pane must never be a silent blank pane. The real machine showed
 * three pages that were simply empty — with the error swallowed by React's
 * default unmount, neither the owner nor the app could say why. This keeps
 * the rest of the app alive and puts the reason on screen, in words.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[boundary] ${this.props.label ?? 'pane'}: ${error.message}`, info.componentStack ?? '')
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-6" role="alert">
        <h2 className="text-[14px] font-semibold text-ink">
          This page could not render{this.props.label ? `: ${this.props.label}` : ''}.
        </h2>
        <p className="mt-2 max-w-[560px] text-[12px] leading-relaxed text-muted">
          The rest of the app still works. The exact reason is below — send it along and it gets fixed:
        </p>
        <pre className="mt-3 max-w-[720px] overflow-x-auto rounded-lg border border-warn/40 bg-card p-3 text-[11px] leading-relaxed text-warn">
          {error.message}
          {error.stack ? `\n\n${error.stack.split('\n').slice(1, 6).join('\n')}` : ''}
        </pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-accent"
        >
          Try again
        </button>
      </div>
    )
  }
}
