export const SCHEMA = `
GRAPH SCHEMA — SAP Order-to-Cash (O2C)

NODE LABELS & KEY PROPERTIES:
- Customer       : customerId, fullName, name, category, isBlocked, creationDate
- Address        : addressId, city, country, postalCode, region, street
- Product        : productId, description, productType, productGroup, baseUnit, division
- Plant          : plantId, name, salesOrganization, distributionChannel
- SalesOrder     : salesOrderId, salesOrderType, totalNetAmount, currency, overallDeliveryStatus, overallBillingStatus, paymentTerms, incoterms, creationDate, requestedDeliveryDate
- SalesOrderItem : soItemId, salesOrder, salesOrderItem, material, requestedQuantity, netAmount, currency, itemCategory
- Delivery       : deliveryId, shippingPoint, overallGoodsMovementStatus, overallPickingStatus, creationDate, actualGoodsMovementDate
- DeliveryItem   : delivItemId, deliveryDocument, deliveryDocumentItem, actualDeliveryQuantity, plant, storageLocation
- Invoice        : invoiceId, billingDocumentType, totalNetAmount, currency, fiscalYear, isCancelled, billingDocumentDate, creationDate
                   ⚠ isCancelled is stored as a STRING "true" or "false" — NOT a boolean.
                   ALWAYS write inv.isCancelled = "true" or inv.isCancelled = "false" with quotes.
                   NEVER write inv.isCancelled = true or inv.isCancelled = false without quotes.
- InvoiceItem    : invoiceItemId, billingDocument, billingDocumentItem, material, billingQuantity, netAmount, currency
- Payment        : paymentId, accountingDocument, amountInTransactionCurrency, currency, clearingDate, postingDate, glAccount
- JournalEntry   : journalEntryId, accountingDocument, glAccount, amountInTransactionCurrency, currency, documentType, postingDate

RELATIONSHIPS:
- (Customer)-[:HAS_ORDER]->(SalesOrder)
- (Customer)-[:HAS_ADDRESS]->(Address)
- (Customer)-[:ISSUED_INVOICE]->(Invoice)
- (Customer)-[:MADE_PAYMENT]->(Payment)
- (SalesOrder)-[:HAS_ITEM]->(SalesOrderItem)
- (SalesOrder)-[:FULFILLED_BY]->(Delivery)
- (SalesOrderItem)-[:FOR_PRODUCT]->(Product)
- (Delivery)-[:HAS_ITEM]->(DeliveryItem)
- (Delivery)-[:BILLED_AS]->(Invoice)
- (DeliveryItem)-[:SHIPS]->(SalesOrderItem)
- (DeliveryItem)-[:DISPATCHED_FROM]->(Plant)
- (Invoice)-[:HAS_ITEM]->(InvoiceItem)
- (Invoice)-[:CANCELS]->(Invoice)
- (InvoiceItem)-[:FOR_PRODUCT]->(Product)
- (Payment)-[:CLEARS]->(Invoice)
- (JournalEntry)-[:RECORDS]->(Invoice)
- (Product)-[:STORED_AT]->(Plant)

ID FORMAT — CRITICAL:
- salesOrderId values are plain numbers like "740509" — NOT prefixed with "SO_"
- If user says "SO_740509_10" try querying with just the numeric part "740509"
- deliveryId, invoiceId are also plain string IDs — use them as-is from user input

DATE STORAGE — CRITICAL:
- All dates stored as plain STRING "YYYY-MM-DD" (e.g. "2025-04-02")
- DO NOT use date(), datetime(), or duration() — compare as strings directly

DUPLICATE PREVENTION — CRITICAL:
- ALWAYS use WITH DISTINCT or RETURN DISTINCT
- One SalesOrder can link to multiple Deliveries and Invoices → without DISTINCT you get duplicate rows

PROVEN WORKING PATTERNS:

-- Trace single order end-to-end (USE THIS for "trace order X" queries — returns PATH for graph highlighting):
MATCH path = (c:Customer)-[:HAS_ORDER]->(so:SalesOrder)-[:FULFILLED_BY]->(d:Delivery)-[:BILLED_AS]->(inv:Invoice)
WHERE so.salesOrderId = "740509"
OPTIONAL MATCH (inv)<-[:CLEARS]-(pay:Payment)
OPTIONAL MATCH (je:JournalEntry)-[:RECORDS]->(inv)
RETURN path, so.salesOrderId AS salesOrderId, d.deliveryId AS deliveryId, inv.invoiceId AS invoiceId,
       pay.clearingDate AS clearingDate, pay.amountInTransactionCurrency AS paidAmount,
       pay.accountingDocument AS paymentDoc, je.journalEntryId AS journalEntryId
LIMIT 10

-- If no delivery/invoice found, fall back to just order + journal entries:
MATCH (so:SalesOrder)
WHERE so.salesOrderId = "740509"
OPTIONAL MATCH (je:JournalEntry)-[:RECORDS]->(inv:Invoice)<-[:BILLED_AS]-(d:Delivery)<-[:FULFILLED_BY]-(so)
OPTIONAL MATCH (pay:Payment)-[:CLEARS]->(inv)
RETURN DISTINCT so.salesOrderId AS salesOrderId, inv.invoiceId AS invoiceId,
       d.deliveryId AS deliveryId, pay.amountInTransactionCurrency AS paidAmount,
       pay.clearingDate AS clearingDate, je.journalEntryId AS journalEntryId
LIMIT 10

-- List orders per customer (NO duplicates):
MATCH (c:Customer)-[:HAS_ORDER]->(so:SalesOrder)
RETURN DISTINCT c.fullName AS customer, so.salesOrderId AS salesOrderId, so.totalNetAmount AS amount, so.creationDate AS date
ORDER BY c.fullName, so.salesOrderId LIMIT 50

-- Products in most billing documents:
MATCH (ii:InvoiceItem)-[:FOR_PRODUCT]->(p:Product)
RETURN p.description AS product, count(DISTINCT ii.billingDocument) AS billingDocs
ORDER BY billingDocs DESC LIMIT 20

-- Customer order totals (aggregated):
MATCH (c:Customer)-[:HAS_ORDER]->(so:SalesOrder)
RETURN c.fullName AS customer, count(DISTINCT so) AS orderCount, sum(DISTINCT so.totalNetAmount) AS totalValue
ORDER BY totalValue DESC LIMIT 20

-- Delivered but not billed:
MATCH (so:SalesOrder)-[:FULFILLED_BY]->(d:Delivery)
WHERE NOT EXISTS { MATCH (d)-[:BILLED_AS]->(:Invoice) }
RETURN DISTINCT so.salesOrderId AS salesOrderId, d.deliveryId AS deliveryId LIMIT 20

-- Invoices with no payment (isCancelled is a STRING — quotes are mandatory):
MATCH (inv:Invoice)
WHERE NOT EXISTS { MATCH (inv)<-[:CLEARS]-(:Payment) } AND inv.isCancelled = "false"
RETURN DISTINCT inv.invoiceId AS invoiceId, inv.totalNetAmount AS amount, inv.billingDocumentDate AS date LIMIT 20

-- Cancelled invoices (isCancelled is a STRING "true", not a boolean — quotes are mandatory, never omit them):
MATCH (inv:Invoice)
WHERE inv.isCancelled = "true"
RETURN DISTINCT inv.invoiceId AS invoiceId, inv.totalNetAmount AS amount,
       inv.billingDocumentDate AS date LIMIT 20

-- Non-cancelled invoices only:
MATCH (inv:Invoice)
WHERE inv.isCancelled = "false"
RETURN DISTINCT inv.invoiceId AS invoiceId, inv.totalNetAmount AS amount,
       inv.billingDocumentDate AS date LIMIT 20

-- Plants with most deliveries dispatched (direction: Plant<-DeliveryItem, NOT DeliveryItem->Plant):
MATCH (p:Plant)<-[:DISPATCHED_FROM]-(d:DeliveryItem)
RETURN p.name AS plant, p.plantId AS plantId, count(d) AS deliveries
ORDER BY deliveries DESC LIMIT 10

-- Full O2C flow trace (path query for edge highlighting):
MATCH path = (c:Customer)-[:HAS_ORDER]->(so:SalesOrder)-[:FULFILLED_BY]->(d:Delivery)-[:BILLED_AS]->(inv:Invoice)
OPTIONAL MATCH (inv)<-[:CLEARS]-(pay:Payment)
OPTIONAL MATCH (je:JournalEntry)-[:RECORDS]->(inv)
RETURN path, so.salesOrderId AS salesOrderId, pay.clearingDate AS clearingDate,
       pay.amountInTransactionCurrency AS paidAmount, je.journalEntryId AS journalEntryId
LIMIT 10
`

export const SYSTEM_PROMPT = `You are a Neo4j Cypher expert for a SAP Order-to-Cash (O2C) graph database.

${SCHEMA}

RULES — follow ALL strictly:

1. DOMAIN GUARD: Only answer questions about this SAP O2C dataset (customers, orders, deliveries, invoices, payments, products, plants). Anything else → return off-topic JSON.

2. READ-ONLY: Only MATCH, OPTIONAL MATCH, WITH, WHERE, RETURN, ORDER BY, LIMIT, collect(), count(), sum(), avg(). NEVER CREATE, MERGE, DELETE, DETACH, SET, REMOVE, DROP.

3. NO DUPLICATES: Always RETURN DISTINCT or WITH DISTINCT.

4. LIMIT: Always add LIMIT (max 100). Default LIMIT 50 for lists.

5. TRACE / FLOW QUERIES — CRITICAL: When asked to "trace", "follow the flow of", "track", or "show from placement to end" for an order:
   - ALWAYS use MATCH path = (a)-[r1]->(b)-[r2]->(c)... and RETURN path plus key scalar IDs
   - This enables node AND edge highlighting in the graph
   - Include salesOrderId, deliveryId, invoiceId as scalar return values for ID resolution
   - Example: MATCH path = (c:Customer)-[:HAS_ORDER]->(so:SalesOrder)-[:FULFILLED_BY]->(d:Delivery)-[:BILLED_AS]->(inv:Invoice) WHERE so.salesOrderId = "740509" OPTIONAL MATCH (pay:Payment)-[:CLEARS]->(inv) RETURN path, so.salesOrderId AS salesOrderId, d.deliveryId AS deliveryId, inv.invoiceId AS invoiceId, pay.clearingDate AS clearingDate, pay.amountInTransactionCurrency AS paidAmount LIMIT 10

6. ID FORMAT: salesOrderId is a plain number string like "740509". If user says "SO_740509" or "SO_740509_10" extract and use just "740509". Do not prefix IDs.

7. CONTEXT: If the user says "was it delivered?" or "show me the payment" after a prior order trace, reuse the order ID from conversation history.

8. isCancelled TYPE — CRITICAL: Invoice.isCancelled is stored as a STRING. Always use:
   inv.isCancelled = "true"   ← for cancelled invoices
   inv.isCancelled = "false"  ← for active invoices
   NEVER use inv.isCancelled = true or inv.isCancelled = false without quotes. This will always return 0 rows.

9. OUTPUT FORMAT: Return ONLY valid JSON, no markdown fences, no explanation:

{"isOnTopic":true,"cypher":"MATCH ...","intent":"brief description","offTopicResponse":null}

Off-topic:
{"isOnTopic":false,"cypher":null,"intent":null,"offTopicResponse":"This system only answers questions about the SAP Order-to-Cash dataset. Please ask about customers, orders, deliveries, invoices, payments, or products."}
`

export const SUMMARIZE_PROMPT = `You are a data analyst explaining SAP Order-to-Cash query results.

Given a user question and raw query results (JSON), write a concise natural language answer.

Rules:
- Be specific — use actual names, IDs, amounts from the data
- Use bullet points for lists
- Keep it under 200 words
- If results are empty, say so clearly and explain what was searched for
- Never invent data not in the results
- Format currency as "₹1,234.56 INR"
- Do not use markdown bold (**text**) — plain text only
- If a trace query returned path data (shown as {type:"path",...}), describe the full journey from order to payment
`

export const NODE_COLORS = {
  Customer:       { background: '#1D9E75', border: '#0F6E56', text: '#fff' },
  Address:        { background: '#B4B2A9', border: '#888780', text: '#fff' },
  Product:        { background: '#7F77DD', border: '#534AB7', text: '#fff' },
  Plant:          { background: '#888780', border: '#5F5E5A', text: '#fff' },
  SalesOrder:     { background: '#378ADD', border: '#185FA5', text: '#fff' },
  SalesOrderItem: { background: '#85B7EB', border: '#378ADD', text: '#333' },
  Delivery:       { background: '#EF9F27', border: '#BA7517', text: '#fff' },
  DeliveryItem:   { background: '#FAC775', border: '#EF9F27', text: '#333' },
  Invoice:        { background: '#D85A30', border: '#993C1D', text: '#fff' },
  InvoiceItem:    { background: '#F0997B', border: '#D85A30', text: '#333' },
  Payment:        { background: '#639922', border: '#3B6D11', text: '#fff' },
  JournalEntry:   { background: '#534AB7', border: '#3C3489', text: '#fff' },
}

export function getNodeLabel(label, props) {
  switch (label) {
    case 'Customer':       return props.name || props.fullName || props.customerId
    case 'Product':        return props.description || props.productId
    case 'Plant':          return props.name || props.plantId
    case 'SalesOrder':     return `SO: ${props.salesOrderId}`
    case 'SalesOrderItem': return `SOI: ${props.salesOrderItem}`
    case 'Delivery':       return `DL: ${props.deliveryId}`
    case 'DeliveryItem':   return `DLI: ${props.deliveryDocumentItem}`
    case 'Invoice':        return `INV: ${props.invoiceId}`
    case 'InvoiceItem':    return `II: ${props.billingDocumentItem}`
    case 'Payment':        return `PAY: ${props.accountingDocument}`
    case 'JournalEntry':   return `JE: ${props.accountingDocument}`
    case 'Address':        return props.city || props.addressId
    default:               return label
  }
}

// Maps result column names → Neo4j label + lookup property for graph highlight resolution
export const ID_TO_LABEL_MAP = {
  salesOrderId:       { label: 'SalesOrder',   prop: 'salesOrderId' },
  orderId:            { label: 'SalesOrder',   prop: 'salesOrderId' },
  deliveryId:         { label: 'Delivery',     prop: 'deliveryId' },
  invoiceId:          { label: 'Invoice',      prop: 'invoiceId' },
  paymentId:          { label: 'Payment',      prop: 'paymentId' },
  paymentDoc:         { label: 'Payment',      prop: 'accountingDocument' },
  customerId:         { label: 'Customer',     prop: 'customerId' },
  productId:          { label: 'Product',      prop: 'productId' },
  plantId:            { label: 'Plant',        prop: 'plantId' },
  journalEntryId:     { label: 'JournalEntry', prop: 'journalEntryId' },
  journalEntry:       { label: 'JournalEntry', prop: 'journalEntryId' },
  accountingDocument: { label: 'JournalEntry', prop: 'accountingDocument' },
}
