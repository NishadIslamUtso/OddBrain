import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { applyStoredAppearance } from './state/appearance'
import './styles/globals.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing from index.html')

// Before the first paint, so a chosen accent does not flash the default first.
applyStoredAppearance()

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="OddBrain">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
