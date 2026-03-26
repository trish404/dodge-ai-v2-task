import neo4j from 'neo4j-driver'

let _driver = null

export function getDriver() {
  if (!_driver) {
    _driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
      { maxConnectionPoolSize: 10 }
    )
  }
  return _driver
}

export async function runQuery(cypher, params = {}) {
  const session = getDriver().session()
  try {
    const result = await session.run(cypher, params)
    return result.records
  } finally {
    await session.close()
  }
}

// Convert Neo4j Integer to JS number safely
export function toNum(val) {
  if (val == null) return null
  if (typeof val === 'number') return val
  if (neo4j.isInt(val)) return val.toNumber()
  return val
}

// Serialize a Neo4j node into a plain object
export function serializeNode(node) {
  if (!node) return null
  const props = {}
  for (const [k, v] of Object.entries(node.properties)) {
    if (neo4j.isInt(v)) props[k] = v.toNumber()
    else if (v && typeof v === 'object' && v.low !== undefined) props[k] = v.toNumber?.() ?? v
    else props[k] = v
  }
  return {
    elementId: node.elementId,
    labels: node.labels,
    properties: props,
  }
}

// Serialize a Neo4j relationship into a plain object
export function serializeRel(rel) {
  if (!rel) return null
  const props = {}
  for (const [k, v] of Object.entries(rel.properties)) {
    if (neo4j.isInt(v)) props[k] = v.toNumber()
    else props[k] = v
  }
  return {
    elementId: rel.elementId,
    type: rel.type,
    startNodeElementId: rel.startNodeElementId,
    endNodeElementId: rel.endNodeElementId,
    properties: props,
  }
}
