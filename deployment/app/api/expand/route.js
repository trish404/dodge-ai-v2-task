import { NextResponse } from 'next/server'
import { runQuery, serializeNode, serializeRel } from '../../../lib/neo4j'

export async function POST(req) {
  try {
    const { elementId } = await req.json()
    if (!elementId) return NextResponse.json({ error: 'elementId required' }, { status: 400 })

    const records = await runQuery(
      `MATCH (n) WHERE elementId(n) = $elementId
       MATCH (n)-[r]-(m)
       RETURN n, r, m LIMIT 50`,
      { elementId }
    )

    const nodesMap = new Map()
    const edgesMap = new Map()

    for (const rec of records) {
      const n = rec.get('n')
      const m = rec.get('m')
      const r = rec.get('r')
      if (n) nodesMap.set(n.elementId, serializeNode(n))
      if (m) nodesMap.set(m.elementId, serializeNode(m))
      if (r) edgesMap.set(r.elementId, serializeRel(r))
    }

    return NextResponse.json({
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    })
  } catch (err) {
    console.error('Expand error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
