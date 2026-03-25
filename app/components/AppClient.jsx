'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { NODE_COLORS, getNodeLabel } from '../lib/schema'

const SUGGESTED = [
  'Which products appear in the most billing documents?',
  'Find sales orders delivered but never billed',
  'Trace the full O2C flow — order to payment',
  'Which customer has the highest total order value?',
  'Show all cancelled invoices',
  'Which plants dispatched the most deliveries?',
  'Find invoices that have never been paid',
  'Show all journal entries and what invoices they record',
]

// ── Node inspector panel ──────────────────────────────────────────────────────
function NodeInfoPanel({ node, onExpand, onClose }) {
  if (!node) return null
  const { labels, properties } = node
  const label = labels[0]
  const color = NODE_COLORS[label] || { background: '#334155', text: '#fff' }
  const entries = Object.entries(properties).filter(([, v]) => v !== null && v !== '' && v !== undefined)
  return (
    <div className="absolute top-16 right-4 w-72 bg-[#1a2035] border border-slate-700/80 rounded-2xl shadow-2xl z-20 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: color.background + 'dd' }}>
        <div>
          <span className="font-bold text-sm text-white">{label}</span>
          <p className="text-xs text-white/70 truncate mt-0.5">{getNodeLabel(label, properties)}</p>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white text-xl w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition">×</button>
      </div>
      <div className="px-4 py-3 space-y-1.5 max-h-72 overflow-y-auto">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2 text-xs border-b border-slate-800 pb-1.5 last:border-0">
            <span className="text-slate-400 truncate font-medium">{k}</span>
            <span className="text-slate-200 break-all">{String(v)}</span>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <button onClick={() => onExpand(node)}
          className="w-full text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 font-medium transition flex items-center justify-center gap-2">
          ⊕ Expand neighbours
        </button>
      </div>
    </div>
  )
}

// ── Chat panel with streaming ────────────────────────────────────────────────
function ChatPanel({ onHighlight }) {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "👋 Hi! Ask me anything about the SAP Order-to-Cash data. I support natural language queries — try a suggestion below or ask your own question.",
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [openCypher, setOpenCypher] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const q = text || input.trim()
    if (!q || loading) return
    setInput('')

    // Reset highlights immediately when a new query starts
    onHighlight({ nodeIds: [], edgeIds: [] })

    const history = messages.slice(1).filter(m => m.role === 'user' || m.role === 'assistant')
    setMessages(p => [...p, { role: 'user', content: q }])
    setLoading(true)
    setStatusText('Thinking...')

    // Abort any previous stream
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Add a placeholder assistant message we'll fill via streaming
    const assistantIdx = messages.length + 1
    setMessages(p => [...p, {
      role: 'assistant', content: '', streaming: true,
      cypher: null, intent: null, recordCount: null, highlightedNodeIds: [],
    }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let metaReceived = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // Parse SSE events
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          let evt
          try { evt = JSON.parse(part.slice(6)) } catch { continue }

          if (evt.type === 'status') {
            setStatusText(evt.text)
          } else if (evt.type === 'meta') {
            metaReceived = true
            setMessages(p => p.map((m, i) =>
              i === p.length - 1
                ? { ...m, cypher: evt.cypher, intent: evt.intent, recordCount: evt.recordCount,
                    highlightedNodeIds: evt.highlightedNodeIds || [], highlightedEdgeIds: evt.highlightedEdgeIds || [] }
                : m
            ))
            onHighlight({
              nodeIds: evt.highlightedNodeIds || [],
              edgeIds: evt.highlightedEdgeIds || [],
            })
          } else if (evt.type === 'chunk') {
            setMessages(p => p.map((m, i) =>
              i === p.length - 1 ? { ...m, content: m.content + evt.text, streaming: true } : m
            ))
          } else if (evt.type === 'offtopic') {
            setMessages(p => p.map((m, i) =>
              i === p.length - 1 ? { ...m, content: evt.text, streaming: false, isOffTopic: true } : m
            ))
            onHighlight({ nodeIds: [], edgeIds: [] })
          } else if (evt.type === 'error') {
            setMessages(p => p.map((m, i) =>
              i === p.length - 1 ? { ...m, content: `⚠ ${evt.text}`, streaming: false } : m
            ))
            onHighlight({ nodeIds: [], edgeIds: [] })
          } else if (evt.type === 'done') {
            setMessages(p => p.map((m, i) =>
              i === p.length - 1 ? { ...m, streaming: false } : m
            ))
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(p => p.map((m, i) =>
          i === p.length - 1 ? { ...m, content: `Network error: ${err.message}`, streaming: false } : m
        ))
      }
    } finally {
      setLoading(false)
      setStatusText('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#111827]">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-base shrink-0">✦</div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Query Assistant</h2>
            <p className="text-xs text-slate-500">NL → Cypher → Streaming answer</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' ? (
              <div className="max-w-[95%] space-y-2">
                <div className={`bg-[#1e2a3d] border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap
                  ${m.isOffTopic ? 'border-amber-700/50 bg-amber-950/30' : 'border-slate-700/60'}`}>
                  {m.content}
                  {m.streaming && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-blue-400 animate-pulse rounded-sm align-middle" />
                  )}
                  {!m.content && m.streaming && (
                    <span className="text-slate-500 text-xs">Generating...</span>
                  )}
                </div>
                {m.cypher && !m.streaming && (
                  <div className="space-y-1">
                    <button onClick={() => setOpenCypher(openCypher === i ? null : i)}
                      className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition">
                      <span>{openCypher === i ? '▾' : '▸'}</span>
                      <span>{m.intent || 'View Cypher'}</span>
                      {m.recordCount != null && <span className="text-slate-600">({m.recordCount} rows)</span>}
                    </button>
                    {openCypher === i && (
                      <pre className="text-xs bg-[#0d1117] border border-slate-800 rounded-xl px-3 py-2.5 text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        {m.cypher}
                      </pre>
                    )}
                    {m.highlightedNodeIds?.length > 0 && (
                      <p className="text-xs text-amber-400">
                        ✦ {m.highlightedNodeIds.length} nodes + edges highlighted in graph
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[85%] bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white">
                {m.content}
              </div>
            )}
          </div>
        ))}

        {loading && statusText && (
          <div className="flex justify-start">
            <div className="bg-[#1e2a3d] border border-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
              <span className="text-xs text-slate-400">{statusText}</span>
            </div>
          </div>
        )}

        {messages.length <= 1 && !loading && (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Try asking</p>
            {SUGGESTED.map((s, i) => (
              <button key={i} onClick={() => send(s)}
                className="w-full text-left text-xs bg-[#1a2235] hover:bg-[#1e2a3d] border border-slate-700/60 hover:border-slate-600 rounded-xl px-3.5 py-2.5 text-slate-300 transition">
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-slate-800 shrink-0">
        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask about orders, invoices, payments..."
            disabled={loading}
            className="flex-1 bg-[#1a2235] border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none transition disabled:opacity-50"
          />
          {loading ? (
            <button onClick={() => { abortRef.current?.abort(); setLoading(false); setStatusText('') }}
              className="px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition shrink-0">
              Stop
            </button>
          ) : (
            <button onClick={() => send()} disabled={!input.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl text-sm font-medium transition shrink-0">
              Send
            </button>
          )}
        </div>
        <p className="text-xs text-slate-600 mt-2 text-center">SAP O2C dataset only · responses stream in real-time</p>
      </div>
    </div>
  )
}

// ── Graph controls bar ────────────────────────────────────────────────────────
function GraphControls({ onSearch, onCluster, clustering, onFitAll, filterLabel, onFilterLabel, labelCounts }) {
  const [searchVal, setSearchVal] = useState('')
  const allLabels = Object.keys(labelCounts || {}).sort()

  function handleSearch(e) {
    e.preventDefault()
    onSearch(searchVal)
  }

  return (
    <div className="absolute top-14 left-4 z-10 flex flex-col gap-2">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-1.5">
        <input
          type="text" value={searchVal} onChange={e => setSearchVal(e.target.value)}
          placeholder="Search node..."
          className="bg-[#1a2235]/90 backdrop-blur border border-slate-700 text-xs text-slate-200 placeholder-slate-500 rounded-lg px-3 py-1.5 w-44 outline-none focus:border-blue-500 transition"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg transition">Find</button>
      </form>

      {/* Filter by label */}
      <select
        value={filterLabel}
        onChange={e => onFilterLabel(e.target.value)}
        className="bg-[#1a2235]/90 backdrop-blur border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 w-full"
      >
        <option value="">All node types</option>
        {allLabels.map(l => (
          <option key={l} value={l}>{l} ({labelCounts[l]})</option>
        ))}
      </select>

      {/* Cluster toggle */}
      <button onClick={onCluster}
        className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
          clustering
            ? 'bg-violet-600 border-violet-500 text-white'
            : 'bg-[#1a2235]/90 backdrop-blur border-slate-700 text-slate-300 hover:border-slate-500'
        }`}>
        {clustering ? '⬡ Clustered by type' : '⬡ Cluster by type'}
      </button>

      {/* Fit all */}
      <button onClick={onFitAll}
        className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-[#1a2235]/90 backdrop-blur text-slate-300 hover:border-slate-500 transition">
        ⊙ Fit all
      </button>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  const entries = Object.entries(NODE_COLORS)
  return (
    <div className="absolute bottom-4 left-4 bg-[#0d1117]/90 backdrop-blur border border-slate-700/60 rounded-xl px-3 py-2.5 z-10">
      <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Node types</p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
        {entries.map(([label, c]) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.background }} />
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function AppClient() {
  const containerRef = useRef(null)
  const graphRef = useRef(null)
  const graphDataRef = useRef({ nodes: [], links: [] })

  const [selectedNode, setSelectedNode] = useState(null)
  const [status, setStatus] = useState('Loading 3D graph...')
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [labelCounts, setLabelCounts] = useState({})
  const [clustering, setClustering] = useState(false)
  const [filterLabel, setFilterLabel] = useState('')

  // Highlight state — persists until next query
  const highlightIdsRef = useRef(new Set())
  const highlightEdgeIdsRef = useRef(new Set())

  function toGraphNode(n) {
    const label = n.labels[0]
    const color = NODE_COLORS[label] || { background: '#475569' }
    return {
      id: n.elementId,
      label,
      displayLabel: getNodeLabel(label, n.properties),
      color: color.background,
      properties: n.properties,
      labels: n.labels,
      __raw: n,
      __highlighted: false,
      val: label === 'Customer' ? 8 : label === 'SalesOrder' ? 5 : label === 'Invoice' ? 4 : 3,
    }
  }

  function toGraphLink(e) {
    return {
      id: e.elementId,
      source: e.startNodeElementId,
      target: e.endNodeElementId,
      relType: e.type,
      __highlighted: false,
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    async function init() {
      const mod = await import('3d-force-graph')
      const ForceGraph3D = mod.default

      const res = await fetch('/api/graph')
      const { nodes: rawNodes, edges: rawEdges, error } = await res.json()
      if (error) { setStatus(`Error: ${error}`); return }

      const nodes = rawNodes.map(toGraphNode)
      const links = rawEdges.map(toGraphLink)
      graphDataRef.current = { nodes, links }

      setNodeCount(nodes.length)
      setEdgeCount(links.length)

      // Compute label counts
      const lc = {}
      for (const n of nodes) lc[n.label] = (lc[n.label] || 0) + 1
      setLabelCounts(lc)

      const Graph = ForceGraph3D()(containerRef.current)
        .backgroundColor('#0d1117')
        .width(containerRef.current.offsetWidth)
        .height(containerRef.current.offsetHeight)
        .graphData({ nodes, links })
        .nodeColor(node => node.__highlighted ? '#fbbf24' : node.color)
        .nodeLabel(node =>
          `<div style="background:#1e2a3d;border:1px solid #334155;padding:6px 10px;border-radius:8px;font-size:12px;color:#e2e8f0;">` +
          `<b style="color:${node.color}">${node.label}</b><br/>${node.displayLabel}</div>`
        )
        .nodeVal(node => node.__highlighted ? node.val * 2.5 : node.val)
        .linkColor(link => link.__highlighted ? '#fbbf24' : '#2d3a4f')
        .linkWidth(link => link.__highlighted ? 3 : 0.8)
        .linkOpacity(link => link.__highlighted ? 1 : 0.4)
        .linkDirectionalParticles(link => link.__highlighted ? 5 : 0)
        .linkDirectionalParticleWidth(2.5)
        .linkDirectionalParticleColor(() => '#fbbf24')
        .linkDirectionalArrowLength(link => link.__highlighted ? 8 : 5)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalArrowColor(link => link.__highlighted ? '#fbbf24' : '#3d4f6a')
        .linkLabel(link => link.relType?.replace(/_/g, ' ') || '')
        .onNodeClick(node => {
          setSelectedNode(node.__raw)
          const dist = 80
          const distRatio = 1 + dist / Math.hypot(node.x || 0.1, node.y || 0.1, node.z || 0.1)
          Graph.cameraPosition(
            { x: (node.x||0)*distRatio, y: (node.y||0)*distRatio, z: (node.z||0)*distRatio },
            node, 1000
          )
        })

      Graph.d3Force('charge')?.strength(-120)
      setTimeout(() => { Graph.cooldownTicks(0); setStatus(null) }, 5000)

      graphRef.current = Graph

      const onResize = () => {
        if (!containerRef.current) return
        Graph.width(containerRef.current.offsetWidth).height(containerRef.current.offsetHeight)
      }
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }
    init().catch(err => { console.error(err); setStatus('Failed to load graph') })
  }, [])

  // Apply label filter
  useEffect(() => {
    if (!graphRef.current || !graphDataRef.current.nodes.length) return
    const { nodes, links } = graphDataRef.current
    const filtered = filterLabel
      ? {
          nodes: nodes.filter(n => n.label === filterLabel),
          links: links.filter(l => {
            const srcId = typeof l.source === 'object' ? l.source.id : l.source
            const tgtId = typeof l.target === 'object' ? l.target.id : l.target
            const filteredIds = new Set(nodes.filter(n => n.label === filterLabel).map(n => n.id))
            return filteredIds.has(srcId) || filteredIds.has(tgtId)
          })
        }
      : { nodes, links }
    graphRef.current.graphData(filtered)
  }, [filterLabel])

  function applyHighlights(nodeIds, edgeIds) {
    if (!graphRef.current) return
    const { nodes, links } = graphDataRef.current
    highlightIdsRef.current = new Set(nodeIds)
    highlightEdgeIdsRef.current = new Set(edgeIds)

    nodes.forEach(n => { n.__highlighted = highlightIdsRef.current.has(n.id) })
    links.forEach(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target
      l.__highlighted = highlightEdgeIdsRef.current.has(l.id) ||
        (highlightIdsRef.current.has(srcId) && highlightIdsRef.current.has(tgtId))
    })

    graphRef.current.nodeColor(node => node.__highlighted ? '#fbbf24' : node.color)
    graphRef.current.nodeVal(node => node.__highlighted ? node.val * 2.5 : node.val)
    graphRef.current.linkColor(link => link.__highlighted ? '#fbbf24' : '#2d3a4f')
    graphRef.current.linkWidth(link => link.__highlighted ? 3 : 0.8)
    graphRef.current.linkDirectionalParticles(link => link.__highlighted ? 5 : 0)

    // Fly to first highlighted node
    const found = nodes.find(n => highlightIdsRef.current.has(n.id))
    if (found) {
      const dist = 160
      const distRatio = 1 + dist / Math.hypot(found.x||0.1, found.y||0.1, found.z||0.1)
      graphRef.current.cameraPosition(
        { x:(found.x||0)*distRatio, y:(found.y||0)*distRatio, z:(found.z||0)*distRatio },
        found, 1200
      )
    }
  }

  function clearHighlights() {
    if (!graphRef.current) return
    highlightIdsRef.current = new Set()
    highlightEdgeIdsRef.current = new Set()
    graphDataRef.current.nodes.forEach(n => { n.__highlighted = false })
    graphDataRef.current.links.forEach(l => { l.__highlighted = false })
    graphRef.current.nodeColor(node => node.color)
    graphRef.current.nodeVal(node => node.val)
    graphRef.current.linkColor(() => '#2d3a4f')
    graphRef.current.linkWidth(0.8)
    graphRef.current.linkDirectionalParticles(0)
  }

  const handleHighlight = useCallback(({ nodeIds = [], edgeIds = [] } = {}) => {
    if (!nodeIds.length && !edgeIds.length) {
      clearHighlights()
    } else {
      applyHighlights(nodeIds, edgeIds)
    }
  }, [])

  async function expandNode(rawNode) {
    if (!rawNode?.elementId) return
    setStatus('Expanding...')
    try {
      const res = await fetch('/api/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId: rawNode.elementId }),
      })
      const { nodes: rawNodes, edges: rawEdges } = await res.json()
      const existingNodeIds = new Set(graphDataRef.current.nodes.map(n => n.id))
      const existingLinkIds = new Set(graphDataRef.current.links.map(l => l.id))
      const newNodes = rawNodes.filter(n => !existingNodeIds.has(n.elementId)).map(toGraphNode)
      const newLinks = rawEdges.filter(e => !existingLinkIds.has(e.elementId)).map(toGraphLink)
      if (!newNodes.length && !newLinks.length) { setStatus(null); return }
      const updated = {
        nodes: [...graphDataRef.current.nodes, ...newNodes],
        links: [...graphDataRef.current.links, ...newLinks],
      }
      graphDataRef.current = updated
      const lc = {}
      for (const n of updated.nodes) lc[n.label] = (lc[n.label] || 0) + 1
      setLabelCounts(lc)
      graphRef.current?.graphData(filterLabel
        ? { nodes: updated.nodes.filter(n => n.label === filterLabel), links: updated.links }
        : updated
      )
      setNodeCount(updated.nodes.length)
      setEdgeCount(updated.links.length)
    } finally { setStatus(null) }
  }

  function handleSearch(q) {
    if (!q || !graphRef.current) return
    const lower = q.toLowerCase()
    const found = graphDataRef.current.nodes.find(n =>
      n.displayLabel.toLowerCase().includes(lower) ||
      Object.values(n.properties).some(v => String(v).toLowerCase().includes(lower))
    )
    if (found) {
      setSelectedNode(found.__raw)
      const dist = 80
      const distRatio = 1 + dist / Math.hypot(found.x||0.1, found.y||0.1, found.z||0.1)
      graphRef.current.cameraPosition(
        { x:(found.x||0)*distRatio, y:(found.y||0)*distRatio, z:(found.z||0)*distRatio },
        found, 1000
      )
      // Briefly highlight the found node
      applyHighlights([found.id], [])
    }
  }

  function toggleClustering() {
    const next = !clustering
    setClustering(next)
    if (!graphRef.current) return
    if (next) {
      // Group by label using custom forces
      const LABEL_LIST = Object.keys(NODE_COLORS)
      const centers = {}
      const radius = 300
      LABEL_LIST.forEach((l, i) => {
        const angle = (i / LABEL_LIST.length) * 2 * Math.PI
        centers[l] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 }
      })
      graphRef.current.d3Force('cluster', () => {
        graphDataRef.current.nodes.forEach(n => {
          const c = centers[n.label]
          if (!c) return
          n.vx = (n.vx || 0) + (c.x - (n.x || 0)) * 0.05
          n.vy = (n.vy || 0) + (c.y - (n.y || 0)) * 0.05
        })
      })
      graphRef.current.cooldownTicks(200)
    } else {
      graphRef.current.d3Force('cluster', null)
      graphRef.current.d3Force('charge')?.strength(-120)
      graphRef.current.cooldownTicks(200)
    }
  }

  function fitAll() {
    graphRef.current?.zoomToFit(800, 80)
  }

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      {/* Graph panel */}
      <div className="flex-1 relative min-w-0">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3 bg-[#0d1117]/80 backdrop-blur border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white">O2C</div>
            <div>
              <h1 className="text-sm font-bold text-slate-100">SAP O2C Graph Explorer</h1>
              <p className="text-xs text-slate-500">Order-to-Cash · Neo4j Aura · 3D Force Graph</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {status
              ? <span className="text-blue-400 animate-pulse">{status}</span>
              : <>
                  <span className="text-slate-400"><span className="text-blue-400 font-semibold">{nodeCount}</span> nodes</span>
                  <span className="text-slate-700">·</span>
                  <span className="text-slate-400"><span className="text-violet-400 font-semibold">{edgeCount}</span> edges</span>
                </>
            }
            <span className="hidden md:inline text-slate-600">Click = inspect · Drag = orbit · Scroll = zoom</span>
          </div>
        </div>

        <div ref={containerRef} className="w-full h-full" />

        {/* Graph controls */}
        <GraphControls
          onSearch={handleSearch}
          onCluster={toggleClustering}
          clustering={clustering}
          onFitAll={fitAll}
          filterLabel={filterLabel}
          onFilterLabel={setFilterLabel}
          labelCounts={labelCounts}
        />

        <Legend />

        {selectedNode && (
          <NodeInfoPanel
            node={selectedNode}
            onExpand={expandNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Chat panel */}
      <div className="w-96 shrink-0 border-l border-slate-800 overflow-hidden">
        <ChatPanel onHighlight={handleHighlight} />
      </div>
    </div>
  )
}
