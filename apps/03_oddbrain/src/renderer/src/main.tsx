import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { applyStoredAppearance } from './state/appearance'
import { installFindHighlightStyles } from './lib/findHighlightStyles'
import './styles/globals.css'
import './styles/desktop.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing from index.html')

// Before the first paint, so chosen colors and Find highlights are ready.
applyStoredAppearance()
installFindHighlightStyles()

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="OddBrain">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
