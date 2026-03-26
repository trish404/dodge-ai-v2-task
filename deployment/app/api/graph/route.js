export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { runQuery, serializeNode, serializeRel } from '../../../lib/neo4j'

// Load ALL 12 node types and ALL 17 relationship types in parallel batches
const QUERIES = [
  // Core O2C chain
  `MATCH (c:Customer)-[r:HAS_ORDER]->(so:SalesOrder) RETURN c,r,so`,
  `MATCH (so:SalesOrder)-[r:FULFILLED_BY]->(d:Delivery) RETURN so,r,d`,
  `MATCH (d:Delivery)-[r:BILLED_AS]->(inv:Invoice) RETURN d,r,inv`,
  `MATCH (inv:Invoice)<-[r:CLEARS]-(pay:Payment) RETURN inv,r,pay`,
  // Journal entries
  `MATCH (je:JournalEntry)-[r:RECORDS]->(inv:Invoice) RETURN je,r,inv`,
  // Products
  `MATCH (soi:SalesOrderItem)-[r:FOR_PRODUCT]->(p:Product) RETURN soi,r,p LIMIT 200`,
  `MATCH (so:SalesOrder)-[r:HAS_ITEM]->(soi:SalesOrderItem) RETURN so,r,soi LIMIT 200`,
  // Delivery items & plants
  `MATCH (d:Delivery)-[r:HAS_ITEM]->(di:DeliveryItem) RETURN d,r,di LIMIT 200`,
  `MATCH (di:DeliveryItem)-[r:DISPATCHED_FROM]->(pl:Plant) RETURN di,r,pl LIMIT 200`,
  // Invoice items
  `MATCH (inv:Invoice)-[r:HAS_ITEM]->(ii:InvoiceItem) RETURN inv,r,ii LIMIT 200`,
  // Addresses
  `MATCH (c:Customer)-[r:HAS_ADDRESS]->(a:Address) RETURN c,r,a`,
  // Customer invoices & payments
  `MATCH (c:Customer)-[r:ISSUED_INVOICE]->(inv:Invoice) RETURN c,r,inv`,
  `MATCH (c:Customer)-[r:MADE_PAYMENT]->(pay:Payment) RETURN c,r,pay`,
  // Product → Plant
  `MATCH (p:Product)-[r:STORED_AT]->(pl:Plant) RETURN p,r,pl LIMIT 200`,
]

function addNode(map, node) {
  if (!node) return
  if (!map.has(node.elementId)) map.set(node.elementId, serializeNode(node))
}
function addRel(map, rel) {
  if (!rel) return
  if (!map.has(rel.elementId)) map.set(rel.elementId, serializeRel(rel))
}
function extractFromRecord(rec, nodesMap, edgesMap) {
  for (const key of rec.keys) {
    const val = rec.get(key)
    if (!val) continue
    if (val.labels) addNode(nodesMap, val)
    else if (val.type && val.startNodeElementId) addRel(edgesMap, val)
  }
}

export async function GET() {
  try {
    const nodesMap = new Map()
    const edgesMap = new Map()

    // Run all queries in parallel
    const results = await Promise.allSettled(QUERIES.map(q => runQuery(q)))

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const rec of result.value) {
          extractFromRecord(rec, nodesMap, edgesMap)
        }
      }
    }

    const nodes = Array.from(nodesMap.values())
    const edges = Array.from(edgesMap.values())

    // Summary by label for debugging
    const labelCounts = {}
    for (const n of nodes) {
      const l = n.labels[0]
      labelCounts[l] = (labelCounts[l] || 0) + 1
    }
    console.log('Graph loaded:', labelCounts, `| ${edges.length} edges`)

    return NextResponse.json({ nodes, edges })
  } catch (err) {
    console.error('Graph fetch error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
