import { useCallback, useEffect, useRef, useState } from 'react'
import { getCapabilities, isRemoteModel, listModels, showModel } from '../lib/ollama.js'
const unverified = { verified: false, vision: false, thinking: false }
export default function useModels(model, setModel) {
  const [models, setModels] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [capabilities, setCapabilities] = useState(unverified)
  const [verification, setVerification] = useState({ name: '', local: false, error: '' })
  const refreshRef = useRef(null)
  const refresh = useCallback(async () => {
    refreshRef.current?.abort()
    const controller = new AbortController()
    refreshRef.current = controller
    const timer = setTimeout(() => controller.abort(), 8000)
    setStatus('loading')
    try {
      const data = await listModels(controller.signal)
      if (!Array.isArray(data.models)) throw new Error('Ollama returned an invalid model list.')
      if (controller.signal.aborted || refreshRef.current !== controller) return
      // Ollama can list cloud models too. They are NOT authorized in local mode.
      setModels(data.models.filter(item => typeof item.name === 'string' && !isRemoteModel(item.name, item)))
      setStatus('online'); setError('')
    } catch (error) {
      if (refreshRef.current === controller) {
        setModels([]); setStatus('offline')
        setError(error.name === 'AbortError' ? 'Ollama did not respond within 8 seconds.' : error.message)
      }
    } finally { clearTimeout(timer) }
  }, [])
  useEffect(() => { refresh(); return () => refreshRef.current?.abort() }, [refresh])
  useEffect(() => {
    setCapabilities(unverified)
    setVerification({ name: model, local: false, error: '' })
    if (status !== 'online' || !models.some(item => item.name === model)) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), 8000)
    showModel(model, controller.signal).then(metadata => {
      if (controller.signal.aborted) return
      const remote = isRemoteModel(model, metadata)
      setCapabilities(remote ? unverified : getCapabilities(metadata))
      setVerification({ name: model, local: !remote, error: remote ? 'This Ollama entry uses a remote/cloud model. It is disabled: no cloud destination has been approved.' : '' })
    }).catch(error => {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setVerification({ name: model, local: false, error: controller.signal.reason === 'timeout' ? 'Ollama model verification timed out. Refresh models and try again.' : `Could not verify the selected model: ${error.message}` })
    }).finally(() => clearTimeout(timer))
    return () => controller.abort()
  }, [model, models, status])
  const installed = models.some(item => item.name === model)
  const localError = verification.name === model ? verification.error : ''
  return { model, select: setModel, models, status, error: error || localError || (status === 'online' && !installed ? `Selected model ${model} is not installed locally. Choose an installed model; nothing is downloaded or switched automatically.` : ''),
    capabilities, refresh, available: status === 'online' && installed && verification.name === model && verification.local }
}
