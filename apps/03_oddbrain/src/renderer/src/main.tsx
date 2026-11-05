import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AppBoundary from './ui/AppBoundary'
import { applyStoredLook } from './state/look'
import { applyStoredAppearance } from './state/appearance'
import { prepareSamples } from '@shared/lib/sampleWorkspace'
import { installSampleBridge } from './platform/sampleBridge'
import { bridge, getEngineApi } from './platform/bridge'
import './styles/globals.css'
import './styles/desktop.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing from index.html')

prepareSamples()
installSampleBridge(bridge, getEngineApi())

// Before the first paint, so a chosen accent does not flash the default first.
applyStoredAppearance()
applyStoredLook()

createRoot(container).render(
  <StrictMode>
    <AppBoundary><App /></AppBoundary>
  </StrictMode>
)
