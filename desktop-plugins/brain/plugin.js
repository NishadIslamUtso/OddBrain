// Brain — Memory_OB desktop plugin for Hermes.
//
// Step 2: read-only Vault + Review screen.
// The Vault page reads records from the brain folder via the plugin's Python backend.
// The Review page lets the user approve or deny memory proposals.
//
// Rules this file obeys:
//   - imports limited to @hermes/plugin-sdk, react, react/jsx-runtime
//   - namespace-import + feature-detect on all SDK areas
//   - jsx() calls, not JSX — loaded uncompiled
//   - theme variables only; background untouched

import * as sdk from '@hermes/plugin-sdk'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'
import { useState, useEffect, useCallback } from 'react'

// Brain path loaded from manifest at runtime; fallback to hardcoded default
let BRAIN_PATH = 'C:\\Users\\Nishad Islam Utso\\Documents\\Hermes\\Memory_OB'
try {
  const manifest = ctx?.host?.getManifest?.()
  if (manifest?.config?.brain_path) {
    BRAIN_PATH = manifest.config.brain_path
  }
} catch {}

const KINDS = [
  'system', 'inbox', 'sources', 'memory', 'working-memory',
  'knowledge', 'review', 'sharing-receipts', 'journal',
  'activity', 'people', 'archive'
]

function Row({ label, value }) {
  return jsxs('div', {
    className: 'flex items-baseline justify-between gap-3 py-1',
    children: [
      jsxs('span', { className: 'text-(--ui-text-tertiary)', children: [label, ' '] }),
      jsx('span', { className: 'text-(--ui-text-secondary)', children: value })
    ]
  })
}

function RecordCard({ rec, onOpen }) {
  const kindColor = {
    'memory': 'text-(--ui-text-secondary)',
    'journal': 'text-(--ui-accent)',
    'review': 'text-(--ui-text-tertiary)',
    'archive': 'text-(--ui-text-quaternary)',
  }[rec.kind] || 'text-(--ui-text-secondary)'

  return jsxs('div', {
    className: 'flex flex-col gap-1 rounded-md border border-(--ui-stroke-secondary) p-3 cursor-pointer hover:border-(--ui-accent) transition-colors',
    onClick: () => onOpen(rec),
    children: [
      jsxs('div', { className: 'flex items-center gap-2', children: [
        jsx('span', { className: `text-xs font-medium ${kindColor}`, children: rec.kind }),
        jsx('span', { className: 'text-xs text-(--ui-text-quaternary)', children: rec.status }),
      ]}),
      jsx('div', {
        className: 'text-sm font-medium text-(--ui-text-primary)',
        children: rec.title || rec.id
      }),
      jsx('div', {
        className: 'text-xs text-(--ui-text-tertiary) line-clamp-2',
        children: rec.body_preview
      }),
    ]
  })
}

function ProposalCard({ prop, onApprove, onDeny, onOpen }) {
  return jsxs('div', {
    className: 'flex flex-col gap-2 rounded-md border border-(--ui-stroke-secondary) p-3',
    children: [
      jsxs('div', { className: 'flex items-center justify-between', children: [
        jsxs('div', { className: 'flex items-center gap-2', children: [
          jsx('span', { className: 'text-xs font-medium text-orange-400', children: 'proposal' }),
          jsx('span', { className: 'text-xs text-(--ui-text-quaternary)', children: prop.proposal_id }),
        ]}),
        jsxs('div', { className: 'flex gap-2', children: [
          jsx('button', {
            onClick: (e) => { e.stopPropagation(); onApprove(prop.proposal_id) },
            className: 'rounded-md bg-(--ui-accent)/20 px-2 py-0.5 text-xs text-(--ui-accent) hover:bg-(--ui-accent)/30',
            children: 'Approve'
          }),
          jsx('button', {
            onClick: (e) => { e.stopPropagation(); onDeny(prop.proposal_id) },
            className: 'rounded-md bg-red-500/20 px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/30',
            children: 'Deny'
          }),
        ]}),
      ]}),
      jsx('div', {
        className: 'text-sm font-medium text-(--ui-text-primary) cursor-pointer',
        onClick: () => onOpen(prop),
        children: prop.title || prop.id
      }),
      jsx('div', {
        className: 'text-xs text-(--ui-text-tertiary) line-clamp-2',
        children: prop.body_preview
      }),
      jsxs('div', { className: 'text-xs text-(--ui-text-quaternary)', children: [
        `→ ${prop.destination || '03 Memory'}`,
        prop.source && ` · from ${prop.source}`,
      ]}),
    ]
  })
}

function VaultPage({ ctx }) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [selected, setSelected] = useState(null)

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (kindFilter) params.set('kind', kindFilter)
      params.set('limit', '100')
      const data = await ctx.rest(`/records?${params}`)
      setRecords(data.records || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, kindFilter])

  useEffect(() => { loadRecords() }, [loadRecords])

  return jsxs('div', {
    className: 'flex h-full flex-col gap-4 p-4 text-sm',
    children: [
      jsxs('div', { className: 'flex flex-col gap-1', children: [
        jsx('div', { className: 'text-base font-medium', children: 'Vault' }),
        jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Memory_OB records — read-only' }),
      ]}),
      jsxs('div', { className: 'flex flex-col gap-2 sm:flex-row', children: [
        jsxs('div', { className: 'flex-1', children: [
          jsx('input', {
            type: 'text', placeholder: 'Search vault...', value: search,
            onChange: (e) => setSearch(e.target.value),
            className: 'w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-background-secondary) px-3 py-1.5 text-sm text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent) focus:outline-none',
          }),
        ]}),
        jsxs('select', {
          value: kindFilter, onChange: (e) => setKindFilter(e.target.value),
          className: 'rounded-md border border-(--ui-stroke-secondary) bg-(--ui-background-secondary) px-3 py-1.5 text-sm text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none',
          children: [
            jsx('option', { value: '', children: 'All kinds' }),
            ...KINDS.map(k => jsx('option', { key: k, value: k, children: k }))
          ]
        }),
      ]}),
      error && jsxs('div', {
        className: 'rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400',
        children: [
          jsx('div', { className: 'font-medium', children: 'Vault error' }),
          jsx('div', { children: error }),
        ]
      }),
      loading && jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Loading records…' }),
      !loading && !error && jsxs('div', {
        className: 'text-xs text-(--ui-text-quaternary)',
        children: [total, ' records', kindFilter && ` in ${kindFilter}`, search && ` matching "${search}"`]
      }),
      !loading && !error && jsxs('div', {
        className: 'flex flex-col gap-2 overflow-y-auto',
        children: records.length === 0
          ? jsx('div', { className: 'text-(--ui-text-quaternary)', children: 'No records found.' })
          : records.map(rec => jsx(RecordCard, { key: rec.id, rec, onOpen: setSelected }))
      }),
      selected && jsxs('div', {
        className: 'mt-auto flex max-h-[50vh] flex-col gap-2 rounded-md border border-(--ui-stroke-secondary) p-3',
        children: [
          jsxs('div', { className: 'flex items-center justify-between', children: [
            jsxs('div', { className: 'flex items-center gap-2', children: [
              jsx('span', { className: 'text-xs font-medium text-(--ui-text-tertiary)', children: selected.kind }),
              jsx('span', { className: 'text-xs text-(--ui-text-quaternary)', children: selected.status }),
            ]}),
            jsx('button', { onClick: () => setSelected(null), className: 'text-xs text-(--ui-text-quaternary)', children: 'Close' }),
          ]}),
          jsx('div', { className: 'text-sm font-medium', children: selected.title || selected.id }),
          jsxs('div', {
            className: 'overflow-y-auto whitespace-pre-wrap select-text text-xs text-(--ui-text-secondary)',
            style: { maxHeight: '30vh' },
            children: [selected.body]
          }),
          jsxs('div', { className: 'text-xs text-(--ui-text-quaternary)', children: [selected.path, selected.created && ` · ${selected.created}`] }),
        ]
      }),
      jsx('div', { className: 'mt-auto text-(--ui-text-quaternary)', children: `Vault: ${BRAIN_PATH}` }),
    ]
  })
}

function ReviewPage({ ctx }) {
  const [proposals, setProposals] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [selected, setSelected] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)
  const [denyReason, setDenyReason] = useState('')

  const loadProposals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filter) params.set('status', filter)
      params.set('limit', '50')
      const data = await ctx.rest(`/proposals?${params}`)
      setProposals(data.proposals || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { loadProposals() }, [loadProposals])

  const handleApprove = useCallback(async (pid) => {
    setActionMsg(`Approving ${pid}…`)
    try {
      const res = await ctx.rest(`/proposals/${pid}/approve`, { method: 'POST' })
      setActionMsg(`${pid} approved ✓`)
      setTimeout(() => setActionMsg(null), 3000)
      loadProposals()
      setSelected(null)
    } catch (e) {
      setActionMsg(`Error: ${e.message}`)
    }
  }, [loadProposals])

  const handleDeny = useCallback(async (pid) => {
    const reason = (denyReason || '').trim()
    setActionMsg(`Denying ${pid}…`)
    try {
      await ctx.rest(`/proposals/${pid}/deny`, {
        method: 'POST',
        body: { reason: reason || undefined },
      })
      setActionMsg(`${pid} denied`)
      setTimeout(() => setActionMsg(null), 3000)
      loadProposals()
      setSelected(null)
      setDenyReason('')
    } catch (e) {
      setActionMsg(`Error: ${e.message}`)
    }
  }, [loadProposals, denyReason])

  return jsxs('div', {
    className: 'flex h-full flex-col gap-4 p-4 text-sm',
    children: [
      jsxs('div', { className: 'flex flex-col gap-1', children: [
        jsx('div', { className: 'text-base font-medium', children: 'Review' }),
        jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Memory proposals — approve or deny before they become facts' }),
      ]}),

      jsxs('div', { className: 'flex flex-col gap-2 sm:flex-row sm:items-center', children: [
        jsxs('select', {
          value: filter, onChange: (e) => setFilter(e.target.value),
          className: 'rounded-md border border-(--ui-stroke-secondary) bg-(--ui-background-secondary) px-3 py-1.5 text-sm text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none',
          children: [
            jsx('option', { value: 'pending', children: 'Pending' }),
            jsx('option', { value: 'approved', children: 'Approved' }),
            jsx('option', { value: 'denied', children: 'Denied' }),
            jsx('option', { value: '', children: 'All' }),
          ]
        }),
        jsxs('div', { className: 'text-xs text-(--ui-text-quaternary)', children: [total, ' proposals'] }),
        actionMsg && jsxs('div', {
          className: 'text-xs',
          children: [actionMsg.includes('Error') ? 'text-red-400' : 'text-(--ui-accent)', actionMsg]
        }),
      ]}),

      error && jsxs('div', {
        className: 'rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400',
        children: [
          jsx('div', { className: 'font-medium', children: 'Review error' }),
          jsx('div', { children: error }),
        ]
      }),

      loading && jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Loading proposals…' }),

      !loading && !error && jsxs('div', {
        className: 'flex flex-col gap-2 overflow-y-auto',
        children: proposals.length === 0
          ? jsxs('div', { className: 'text-(--ui-text-quaternary)', children: [
              'No proposals found. ',
              filter === 'pending' && "The agent can propose memories from chat — they'll appear here for your approval."
            ]})
          : proposals.map(prop => jsx(ProposalCard, {
              key: prop.proposal_id || prop.id,
              prop,
              onApprove: handleApprove,
              onDeny: handleDeny,
              onOpen: setSelected,
            }))
      }),

      selected && jsxs('div', {
        className: 'mt-auto flex flex-col gap-2 rounded-md border border-(--ui-stroke-secondary) p-3',
        children: [
          jsxs('div', { className: 'flex items-center justify-between', children: [
            jsxs('div', { className: 'flex items-center gap-2', children: [
              jsx('span', { className: 'text-xs font-medium text-orange-400', children: 'proposal' }),
              jsx('span', { className: 'text-xs text-(--ui-text-quaternary)', children: selected.proposal_id }),
              jsx('span', { className: 'text-xs text-(--ui-text-quaternary)', children: selected.status }),
            ]}),
            jsx('button', { onClick: () => setSelected(null), className: 'text-xs text-(--ui-text-quaternary)', children: 'Close' }),
          ]}),
          jsx('div', { className: 'text-sm font-medium', children: selected.title || selected.id }),
          jsx('pre', { className: 'whitespace-pre-wrap text-xs text-(--ui-text-secondary)', children: selected.body }),
          jsxs('div', { className: 'text-xs text-(--ui-text-quaternary)', children: [
            selected.path,
            selected.destination && ` → ${selected.destination}`,
            selected.created && ` · ${selected.created}`,
          ]}),
          selected.status === 'pending' && jsxs('div', { className: 'flex flex-col gap-2 mt-2', children: [
            jsxs('div', { className: 'flex gap-2', children: [
              jsx('button', {
                onClick: () => handleApprove(selected.proposal_id),
                className: 'rounded-md bg-(--ui-accent)/20 px-3 py-1 text-xs text-(--ui-accent) hover:bg-(--ui-accent)/30',
                children: 'Approve'
              }),
              jsx('button', {
                onClick: () => handleDeny(selected.proposal_id),
                className: 'rounded-md bg-red-500/20 px-3 py-1 text-xs text-red-400 hover:bg-red-500/30',
                children: 'Deny'
              }),
            ]}),
            jsx('input', {
              type: 'text',
              placeholder: 'Deny reason (optional)',
              value: denyReason,
              onChange: (e) => setDenyReason(e.target.value),
              className: 'w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-background-secondary) px-3 py-1.5 text-xs text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent) focus:outline-none',
            }),
          ]}),
        ]
      }),
    ]
  })
}


function SearchPage({ ctx }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await ctx.rest(`/search?q=${encodeURIComponent(q)}&limit=20`)
      setResults(data.results || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 250)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  return jsxs('div', {
    className: 'flex h-full flex-col gap-4 p-4 text-sm',
    children: [
      jsxs('div', { className: 'flex flex-col gap-1', children: [
        jsx('div', { className: 'text-base font-medium', children: 'Semantic search' }),
        jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Keyword relevance across the vault' }),
      ]}),
      jsx('input', {
        type: 'text', placeholder: 'Search the vault...', value: query,
        onChange: (e) => setQuery(e.target.value),
        className: 'w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-background-secondary) px-3 py-1.5 text-sm text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent) focus:outline-none',
      }),
      error && jsxs('div', {
        className: 'rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400',
        children: [
          jsx('div', { className: 'font-medium', children: 'Search error' }),
          jsx('div', { children: error }),
        ]
      }),
      loading && jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Searching...' }),
      !loading && !error && jsxs('div', {
        className: 'text-xs text-(--ui-text-quaternary)',
        children: [results.length, ' results']
      }),
      !loading && !error && jsxs('div', {
        className: 'flex flex-col gap-2 overflow-y-auto',
        children: results.length === 0 && query.trim()
          ? jsx('div', { className: 'text-(--ui-text-quaternary)', children: 'No matches.' })
          : results.map(r => jsx('div', {
              key: r.id,
              className: 'rounded-md border border-(--ui-stroke-secondary) p-3 cursor-pointer hover:border-(--ui-accent) transition-colors',
              onClick: () => setSelected(r),
              children: jsxs('div', { children: [
                jsxs('div', { className: 'flex items-center justify-between', children: [
                  jsx('div', { className: 'text-sm font-medium text-(--ui-text-primary)', children: r.title || r.id }),
                  jsxs('span', { className: 'text-xs text-(--ui-text-quaternary)', children: ['score ', r.score] }),
                ]}),
                jsx('div', { className: 'text-xs text-(--ui-text-tertiary) line-clamp-2', children: r.preview }),
              ]})
            }))
      }),
      selected && jsxs('div', {
        className: 'mt-auto flex max-h-[50vh] flex-col gap-2 rounded-md border border-(--ui-stroke-secondary) p-3',
        children: [
          jsxs('div', { className: 'flex items-center justify-between', children: [
            jsx('div', { className: 'text-sm font-medium', children: selected.title || selected.id }),
            jsx('button', { onClick: () => setSelected(null), className: 'text-xs text-(--ui-text-quaternary)', children: 'Close' }),
          ]}),
          jsxs('div', {
            className: 'overflow-y-auto whitespace-pre-wrap select-text text-xs text-(--ui-text-secondary)',
            style: { maxHeight: '30vh' },
            children: [selected.preview]
          }),
          jsxs('div', { className: 'text-xs text-(--ui-text-quaternary)', children: [selected.path, ' score ' + selected.score] }),
        ]
      }),
    ]
  })
}

function GraphPage({ ctx }) {
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ctx.rest('/graph?limit=200')
      .then(data => {
        if (!cancelled) setGraph(data)
      })
      .catch(e => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const nodes = graph?.nodes || []
  const edges = graph?.edges || []

  return jsxs('div', {
    className: 'flex h-full flex-col gap-4 p-4 text-sm',
    children: [
      jsxs('div', { className: 'flex flex-col gap-1', children: [
        jsx('div', { className: 'text-base font-medium', children: 'Connection graph' }),
        jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Records linked by shared tags' }),
      ]}),
      error && jsxs('div', {
        className: 'rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400',
        children: [
          jsx('div', { className: 'font-medium', children: 'Graph error' }),
          jsx('div', { children: error }),
        ]
      }),
      loading && jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Loading graph...' }),
      !loading && !error && jsxs('div', {
        className: 'text-xs text-(--ui-text-quaternary)',
        children: [nodes.length, ' nodes', edges.length, ' edges']
      }),
      !loading && !error && jsxs('div', {
        className: 'flex flex-col gap-2 overflow-y-auto',
        children: nodes.length === 0
          ? jsx('div', { className: 'text-(--ui-text-quaternary)', children: 'No graph data yet.' })
          : nodes.map(n => jsxs('div', {
              key: n.id,
              className: 'rounded-md border border-(--ui-stroke-secondary) p-3',
              children: [
                jsxs('div', { className: 'flex items-center gap-2', children: [
                  jsx('span', { className: 'text-xs font-medium text-(--ui-text-primary)', children: n.title || n.id }),
                  jsxs('span', { className: 'text-xs text-(--ui-text-quaternary)', children: [n.kind, ' · ', n.status] }),
                ]}),
                jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: n.path }),
              ]
            }))
      }),
    ]
  })
}
function BrainPage({ ctx }) {
  const [tab, setTab] = useState('vault')
  const [brainModel, setBrainModel] = useState('auto')
  const [availableModels, setAvailableModels] = useState([])
  const [modelsLoaded, setModelsLoaded] = useState(false)

  const ROUTES = "routes"
  if (typeof ROUTES !== 'string') {
    return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Brain SDK not available on this host.' })
  }

  useEffect(() => {
    let cancelled = false
    ctx.rest('/settings').then(data => {
      if (!cancelled && data && data.model) setBrainModel(data.model)
    }).catch(() => {})
    ctx.rest('/models').then(data => {
      if (!cancelled && data && Array.isArray(data.models)) {
        setAvailableModels(data.models)
        setModelsLoaded(true)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [ctx])

  const handleModelChange = useCallback(async (value) => {
    setBrainModel(value)
    try {
      await ctx.rest('/settings', {
        method: 'POST',
        body: { model: value },
      })
    } catch (e) {
      console.error('Failed to save Brain model setting', e)
    }
  }, [ctx])

  return jsxs('div', {
    className: 'flex h-full flex-col text-sm',
    children: [
      jsxs('div', {
        className: 'flex border-b border-(--ui-stroke-secondary)',
        children: [
          jsx('button', {
            onClick: () => setTab('vault'),
            className: `px-4 py-2 text-xs ${tab === 'vault' ? 'border-b-2 border-(--ui-accent) text-(--ui-text-primary)' : 'text-(--ui-text-tertiary)'}`,
            children: 'Vault'
          }),
          jsx('button', {
            onClick: () => setTab('search'),
            className: `px-4 py-2 text-xs ${tab === 'search' ? 'border-b-2 border-(--ui-accent) text-(--ui-text-primary)' : 'text-(--ui-text-tertiary)'}`,
            children: 'Search'
          }),
          jsx('button', {
            onClick: () => setTab('graph'),
            className: `px-4 py-2 text-xs ${tab === 'graph' ? 'border-b-2 border-(--ui-accent) text-(--ui-text-primary)' : 'text-(--ui-text-tertiary)'}`,
            children: 'Graph'
          }),
          jsx('button', {
            onClick: () => setTab('review'),
            className: `px-4 py-2 text-xs ${tab === 'review' ? 'border-b-2 border-(--ui-accent) text-(--ui-text-primary)' : 'text-(--ui-text-tertiary)'}`,
            children: 'Review'
          }),
          jsxs('div', { className: 'ml-auto flex items-center gap-2 px-3', children: [
            jsxs('span', { className: 'text-xs text-(--ui-text-quaternary)', children: ['Model:', ' '] }),
            jsxs('select', {
              value: brainModel,
              onChange: (e) => handleModelChange(e.target.value),
              className: 'rounded-md border border-(--ui-stroke-secondary) bg-(--ui-background-secondary) px-2 py-1 text-xs text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none',
              children: [
                jsx('option', { value: 'auto', children: 'auto (main model)' }),
                ...availableModels.filter(m => m !== 'auto').map(m => jsx('option', { key: m, value: m, children: m })),
              ]
            }),
          ]}),
        ]
      }),
      jsx('div', { className: 'flex-1 overflow-hidden', children: tab === 'vault' ? jsx(VaultPage, { ctx }) : tab === 'search' ? jsx(SearchPage, { ctx }) : tab === 'graph' ? jsx(GraphPage, { ctx }) : jsx(ReviewPage, { ctx }) }),
    ]
  })
}

export default {
  id: 'brain',
  name: 'Brain',
  register(ctx) {
    const ROUTES = "routes"
    const NAV = "sidebar.nav"
    const PALETTE = "palette"

    const contributions = [
      {
        id: 'brain',
        area: ROUTES,
        data: { path: '/brain' },
        render: () => jsx(BrainPage, { ctx }),
      },
    ]

    if (typeof NAV === 'string') {
      contributions.push({
        id: 'nav',
        area: NAV,
        data: { path: '/brain', label: 'Brain', codicon: 'project' }
      })
    }

    if (typeof PALETTE === 'string') {
      contributions.push({
        id: 'open',
        area: PALETTE,
        data: {
          id: 'brain.open',
          label: 'Open Brain',
          keywords: ['brain', 'memory', 'vault'],
          run: () => ctx.runAction("view.navigate", { path: "/brain" })
        }
      })
    }

    ctx.registerMany(contributions)

    // Pet notification: check for pending proposals every 30s
    const petDisposer = ctx.setInterval(async () => {
      try {
        const proposals = await ctx.rest('/proposals?status=pending&limit=5')
        const count = proposals.total || 0
        if (count > 0 && ctx.pet.visible) {
          const msg = `Brain: ${count} memory proposal${count > 1 ? 's' : ''} awaiting review`
          const clear = ctx.pet.say(msg, { ttlMs: 8000 })
          setTimeout(clear, 8000)
        }
      } catch {
        // backend not ready yet
      }
    }, 30000)
    ctx.onDispose(petDisposer)
  }
}