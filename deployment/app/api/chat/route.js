import Groq from 'groq-sdk'
import { runQuery, serializeNode, serializeRel } from '../../../lib/neo4j'
import { SYSTEM_PROMPT, SUMMARIZE_PROMPT, ID_TO_LABEL_MAP } from '../../../lib/schema'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const CYPHER_MODEL  = 'llama-3.3-70b-versatile'
const SUMMARY_MODEL = 'llama-3.3-70b-versatile'

function isSafeCypher(cypher) {
  if (!cypher) return false
  const upper = cypher.toUpperCase()
  return !['CREATE ', 'MERGE ', 'DELETE ', 'DETACH ', 'REMOVE ', 'SET ', 'DROP ']
    .some(kw => upper.includes(kw))
}

function isNeo4jNode(v)  { return v && typeof v === 'object' && Array.isArray(v.labels) && v.elementId }
function isNeo4jRel(v)   { return v && typeof v === 'object' && v.type && v.startNodeElementId }
function isNeo4jPath(v)  { return v && typeof v === 'object' && v.segments !== undefined }

function serializeValue(val) {
  if (val == null) return null
  if (isNeo4jNode(val)) return serializeNode(val)
  if (isNeo4jRel(val))  return serializeRel(val)
  if (isNeo4jPath(val)) return { type: 'path', nodeCount: (val.segments?.length || 0) + 1 }
  if (typeof val === 'object' && val.low !== undefined) return val.toNumber?.() ?? val
  if (Array.isArray(val)) return val.map(serializeValue)
  return val
}

function serializeResults(records) {
  return records.map(rec => {
    const obj = {}
    for (const key of rec.keys) obj[key] = serializeValue(rec.get(key))
    return obj
  })
}

function deduplicateRows(rows) {
  const seen = new Set()
  return rows.filter(row => {
    const k = JSON.stringify(row)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function resolveHighlightGraphElements(records, serialized) {
  const nodeIds = new Set()
  const edgeIds = new Set()

  // Pass 1: full node / rel / path objects in raw records
  for (const rec of records) {
    for (const key of rec.keys) {
      const val = rec.get(key)
      if (isNeo4jNode(val)) {
        nodeIds.add(val.elementId)
      } else if (isNeo4jRel(val)) {
        edgeIds.add(val.elementId)
        nodeIds.add(val.startNodeElementId)
        nodeIds.add(val.endNodeElementId)
      } else if (isNeo4jPath(val)) {
        if (val.start?.elementId) nodeIds.add(val.start.elementId)
        if (val.end?.elementId)   nodeIds.add(val.end.elementId)
        for (const seg of val.segments || []) {
          if (seg.start?.elementId)        nodeIds.add(seg.start.elementId)
          if (seg.end?.elementId)          nodeIds.add(seg.end.elementId)
          if (seg.relationship?.elementId) edgeIds.add(seg.relationship.elementId)
        }
      }
    }
  }

  // Pass 2: scalar ID columns → look up elementIds
  const colMap = {}
  for (const row of serialized) {
    for (const col of Object.keys(row)) {
      const matchKey = Object.keys(ID_TO_LABEL_MAP).find(k =>
        col.toLowerCase() === k.toLowerCase() || col.toLowerCase().endsWith(k.toLowerCase())
      )
      if (matchKey && row[col] && typeof row[col] === 'string') {
        if (!colMap[col]) colMap[col] = { ...ID_TO_LABEL_MAP[matchKey], values: new Set() }
        colMap[col].values.add(row[col])
      }
    }
  }

  await Promise.all(Object.values(colMap).map(async ({ label, prop, values }) => {
    if (!values.size) return
    try {
      const recs = await runQuery(
        `MATCH (n:${label}) WHERE n.${prop} IN $vals RETURN elementId(n) AS eid`,
        { vals: Array.from(values) }
      )
      for (const r of recs) nodeIds.add(r.get('eid'))
    } catch {}
  }))

  // Pass 3: infer edges between resolved nodes when none came back from the query
  if (nodeIds.size >= 2 && edgeIds.size === 0) {
    try {
      const recs = await runQuery(
        `MATCH (a)-[r]->(b) WHERE elementId(a) IN $ids AND elementId(b) IN $ids RETURN elementId(r) AS eid`,
        { ids: Array.from(nodeIds) }
      )
      for (const r of recs) edgeIds.add(r.get('eid'))
    } catch {}
  }

  // Pass 4: fill in edges that connect nodes already in the highlighted set
  if (nodeIds.size >= 2 && edgeIds.size > 0) {
    try {
      const recs = await runQuery(
        `MATCH (a)-[r]->(b) WHERE elementId(a) IN $ids AND elementId(b) IN $ids RETURN elementId(r) AS eid`,
        { ids: Array.from(nodeIds) }
      )
      for (const r of recs) edgeIds.add(r.get('eid'))
    } catch {}
  }

  return {
    highlightedNodeIds: Array.from(nodeIds),
    highlightedEdgeIds: Array.from(edgeIds),
  }
}

function encodeSSE(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export async function POST(req) {
  const { message, history = [] } = await req.json()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj) {
        controller.enqueue(encoder.encode(encodeSSE(obj)))
      }

      try {
        const messages = [
          ...history.filter(h => h.role === 'user' || h.role === 'assistant')
            .map(h => ({ role: h.role, content: h.content })),
          { role: 'user', content: message },
        ]

        // Step 1: Generate Cypher
        send({ type: 'status', text: 'Generating query...' })

        const cypherResp = await groq.chat.completions.create({
          model: CYPHER_MODEL,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages,
          ],
        })

        let parsed
        try {
          const raw = cypherResp.choices[0].message.content.trim()
          const clean = raw
            .replace(/^```json\s*/m, '').replace(/^```\s*/m, '')
            .replace(/\s*```$/m, '').trim()
          parsed = JSON.parse(clean)
        } catch {
          send({ type: 'error', text: 'Could not parse query. Please rephrase.' })
          controller.close()
          return
        }

        if (!parsed.isOnTopic) {
          send({
            type: 'offtopic',
            text: parsed.offTopicResponse || 'This system only answers questions about the SAP Order-to-Cash dataset. Please ask about customers, orders, deliveries, invoices, payments, or products.',
          })
          controller.close()
          return
        }

        if (!isSafeCypher(parsed.cypher)) {
          send({ type: 'error', text: 'Only read-only queries are permitted.' })
          controller.close()
          return
        }

        send({ type: 'status', text: 'Running query...' })

        // Step 2: Execute Cypher
        let records = []
        let queryError = null
        try {
          records = await runQuery(parsed.cypher)
        } catch (err) {
          queryError = err.message
        }

        // Auto-fix retry
        if (queryError) {
          send({ type: 'status', text: 'Fixing query...' })
          try {
            const fixResp = await groq.chat.completions.create({
              model: CYPHER_MODEL,
              max_tokens: 512,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages,
                { role: 'assistant', content: cypherResp.choices[0].message.content },
                { role: 'user', content: `Query failed: ${queryError}\nFix and return corrected JSON only.` },
              ],
            })
            const fixedRaw = fixResp.choices[0].message.content.trim()
              .replace(/^```json\s*/m, '').replace(/^```\s*/m, '')
              .replace(/\s*```$/m, '').trim()
            const fixedParsed = JSON.parse(fixedRaw)
            if (fixedParsed.cypher && isSafeCypher(fixedParsed.cypher)) {
              records = await runQuery(fixedParsed.cypher)
              parsed = fixedParsed
              queryError = null
            }
          } catch {}
        }

        const serialized = deduplicateRows(serializeResults(records))

        // Step 3: Resolve highlights
        send({ type: 'status', text: 'Resolving graph elements...' })
        const { highlightedNodeIds, highlightedEdgeIds } =
          await resolveHighlightGraphElements(records, serialized)

        send({
          type: 'meta',
          cypher: parsed.cypher,
          intent: parsed.intent,
          recordCount: serialized.length,
          highlightedNodeIds,
          highlightedEdgeIds,
        })

        // Step 4: Stream summary
        send({ type: 'status', text: 'Writing answer...' })

        const summaryStream = await groq.chat.completions.create({
          model: SUMMARY_MODEL,
          max_tokens: 512,
          stream: true,
          messages: [
            { role: 'system', content: SUMMARIZE_PROMPT },
            {
              role: 'user',
              content: `Question: "${message}"\nIntent: ${parsed.intent}\nResults (${serialized.length} rows):\n${JSON.stringify(serialized.slice(0, 50), null, 2)}`,
            },
          ],
        })

        for await (const chunk of summaryStream) {
          const text = chunk.choices[0]?.delta?.content
          if (text) send({ type: 'chunk', text })
        }

        send({ type: 'done' })
      } catch (err) {
        console.error('Chat stream error:', err)
        send({ type: 'error', text: err.message })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
