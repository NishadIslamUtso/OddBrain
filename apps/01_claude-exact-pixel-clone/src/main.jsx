import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/**
 * A crash used to leave a blank page with nothing but a console message, which
 * is useless when the app is being opened through a preview. Show the error on
 * screen instead: the person looking at it can read it and send it over.
 */
const panel = (title, detail) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  margin: 0,
  padding: 20,
  overflow: 'auto',
  background: '#1a1a1a',
  color: '#ff9d9d',
  font: '13px/1.6 ui-monospace, Consolas, monospace',
  whiteSpace: 'pre-wrap',
  content: `${title}\n\n${detail}`,
})

function showFailure(title, detail) {
  const root = document.getElementById('root')
  if (!root) return
  if (root.textContent.trim()) return // something rendered — don't cover it
  const pre = document.createElement('pre')
  Object.assign(pre.style, panel(title, detail))
  pre.style.content = ''
  pre.textContent = `${title}\n\n${detail}`
  root.appendChild(pre)
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('AI ASSistant crashed:', error, info)
  }
  render() {
    if (this.state.error) {
      return <pre style={panel('AI ASSistant failed to start.', String(this.state.error?.stack || this.state.error))}>{`AI ASSistant failed to start.\n\n${String(this.state.error?.stack || this.state.error)}`}</pre>
    }
    return this.props.children
  }
}

// Module-evaluation errors happen before React mounts, so catch those too.
window.addEventListener('error', (event) => {
  showFailure('AI ASSistant failed to load.', `${event.message}\n${event.filename}:${event.lineno}`)
})
window.addEventListener('unhandledrejection', (event) => {
  showFailure('AI ASSistant hit an unhandled error.', String(event.reason?.stack || event.reason))
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
