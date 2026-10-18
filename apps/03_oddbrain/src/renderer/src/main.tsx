import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import AppBoundary from './ui/AppBoundary'
import { applyStoredLook } from './state/look'
import { applyStoredAppearance } from './state/appearance'
import './styles/globals.css'
import './styles/desktop.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing from index.html')

// Before the first paint, so a chosen accent does not flash the default first.
applyStoredAppearance()
applyStoredLook()

createRoot(container).render(
  <StrictMode>
    {/* Two boundaries, on purpose. ErrorBoundary catches first: it names the
        reason in words, keeps the rest of the app alive and offers Try again —
        a crashed pane is never a silent blank pane. AppBoundary is the backstop
        behind it, styled from desktop.css rather than utility classes, so a
        failure in the styling layer itself still leaves a way back in. */}
    <AppBoundary>
      <ErrorBoundary label="OddBrain">
        <App />
      </ErrorBoundary>
    </AppBoundary>
  </StrictMode>
)
