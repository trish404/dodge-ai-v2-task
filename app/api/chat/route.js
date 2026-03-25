import Groq from "groq-sdk"
import { runQuery, serializeNode, serializeRel } from '../../../lib/neo4j'
import { SYSTEM_PROMPT, SUMMARIZE_PROMPT, ID_TO_LABEL_MAP } from '../../../lib/schema'

const client = new Groq({ apiKey: process.env.GROQ_KEY })

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
  if (isNeo4jPath(val)) return { type: 'path', nodeCount: val.segments?.length + 1 }
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

function encodeSSE(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export async function POST(req) {
  const { message, history = [] } = await req.json()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) =>
        controller.enqueue(encoder.encode(encodeSSE(obj)))

      try {
        const messages = [
          ...history
            .filter(h => h.role === 'user' || h.role === 'assistant')
            .map(h => ({ role: h.role, content: h.content })),
          { role: 'user', content: message },
        ]

        send({ type: 'status', text: 'Generating query...' })

        const cypherResp = await client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages
          ],
          temperature: 0
        })

        let parsed
        try {
          const clean = cypherResp.choices[0].message.content.trim()
          parsed = JSON.parse(clean)
        } catch {
          send({ type: 'error', text: 'Could not parse query.' })
          controller.close()
          return
        }

        if (!parsed.isOnTopic) {
          send({
            type: 'offtopic',
            text: parsed.offTopicResponse || 'Out of scope.',
          })
          controller.close()
          return
        }

        if (!isSafeCypher(parsed.cypher)) {
          send({ type: 'error', text: 'Only read queries allowed.' })
          controller.close()
          return
        }

        send({ type: 'status', text: 'Running query...' })

        let records = []
        try {
          records = await runQuery(parsed.cypher)
        } catch (err) {
          send({ type: 'error', text: err.message })
          controller.close()
          return
        }

        const serialized = deduplicateRows(serializeResults(records))

        send({
          type: 'meta',
          cypher: parsed.cypher,
          intent: parsed.intent,
          recordCount: serialized.length
        })

        send({ type: 'status', text: 'Writing answer...' })

        const summaryResp = await client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: SUMMARIZE_PROMPT },
            {
              role: "user",
              content: `Question: ${message}\nResults:\n${JSON.stringify(serialized.slice(0, 50))}`
            }
          ],
          temperature: 0.3
        })

        const answer = summaryResp.choices[0].message.content

        send({ type: 'chunk', text: answer })
        send({ type: 'done' })

      } catch (err) {
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
