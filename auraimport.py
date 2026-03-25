import csv
import os
import sys
import time
from pathlib import Path

NEO4J_URI      = "neo4j+s://x.databases.neo4j.io"
NEO4J_USER     = "xxxx"
NEO4J_PASSWORD = "xxxx"

SCRIPT_DIR = Path(__file__).parent
NODES_DIR  = SCRIPT_DIR / "nodes"
RELS_DIR   = SCRIPT_DIR / "relationships"

if not NODES_DIR.exists():
    print(f"ERROR: Could not find nodes/ folder at {NODES_DIR}")
    print("Make sure you run this script from inside neo4j_import/")
    sys.exit(1)

def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def run_batch(session, query, rows, batch_size=500):
    total = len(rows)
    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        session.run(query, rows=batch)
    return total

def coerce(val):
    """Return None for empty strings so Neo4j stores null, not ''."""
    if val == "" or val is None:
        return None
    return val

def to_float(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None

# ── Connect ───────────────────────────────────────────────────────────────────
print("Connecting to Aura...")
try:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    driver.verify_connectivity()
    print("Connected.\n")
except Exception as e:
    print(f"ERROR: Could not connect — {e}")
    sys.exit(1)

# ── Schema ────────────────────────────────────────────────────────────────────
CONSTRAINTS = [
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Customer)       REQUIRE n.customerId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Address)        REQUIRE n.addressId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Product)        REQUIRE n.productId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Plant)          REQUIRE n.plantId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:SalesOrder)     REQUIRE n.salesOrderId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:SalesOrderItem) REQUIRE n.soItemId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Delivery)       REQUIRE n.deliveryId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:DeliveryItem)   REQUIRE n.delivItemId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Invoice)        REQUIRE n.invoiceId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:InvoiceItem)    REQUIRE n.invoiceItemId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Payment)        REQUIRE n.paymentId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:JournalEntry)   REQUIRE n.journalEntryId IS UNIQUE",
]

# ── Node queries ──────────────────────────────────────────────────────────────
NODE_QUERIES = {
    "Customer.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:Customer {customerId: r.`customerId:ID(Customer)`}) "
        "SET n.fullName=r.fullName, n.name=r.name, n.category=r.category, "
        "    n.isBlocked=(r.isBlocked='true'), n.creationDate=r.creationDate"
    ),
    "Address.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:Address {addressId: r.`addressId:ID(Address)`}) "
        "SET n.businessPartner=r.businessPartner, n.city=r.city, "
        "    n.country=r.country, n.postalCode=r.postalCode, "
        "    n.region=r.region, n.street=r.street"
    ),
    "Product.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:Product {productId: r.`productId:ID(Product)`}) "
        "SET n.description=r.description, n.productType=r.productType, "
        "    n.productGroup=r.productGroup, n.baseUnit=r.baseUnit, "
        "    n.division=r.division, n.creationDate=r.creationDate"
    ),
    "Plant.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:Plant {plantId: r.`plantId:ID(Plant)`}) "
        "SET n.name=r.name, n.salesOrganization=r.salesOrganization, "
        "    n.distributionChannel=r.distributionChannel"
    ),
    "SalesOrder.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:SalesOrder {salesOrderId: r.`salesOrderId:ID(SalesOrder)`}) "
        "SET n.salesOrderType=r.salesOrderType, "
        "    n.totalNetAmount=toFloat(r.totalNetAmount), n.currency=r.currency, "
        "    n.overallDeliveryStatus=r.overallDeliveryStatus, "
        "    n.overallBillingStatus=r.overallBillingStatus, "
        "    n.paymentTerms=r.paymentTerms, n.incoterms=r.incoterms, "
        "    n.creationDate=r.creationDate, "
        "    n.requestedDeliveryDate=r.requestedDeliveryDate"
    ),
    "SalesOrderItem.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:SalesOrderItem {soItemId: r.`soItemId:ID(SalesOrderItem)`}) "
        "SET n.salesOrder=r.salesOrder, n.salesOrderItem=r.salesOrderItem, "
        "    n.material=r.material, "
        "    n.requestedQuantity=toFloat(r.requestedQuantity), "
        "    n.netAmount=toFloat(r.netAmount), n.currency=r.currency, "
        "    n.itemCategory=r.itemCategory"
    ),
    "Delivery.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:Delivery {deliveryId: r.`deliveryId:ID(Delivery)`}) "
        "SET n.shippingPoint=r.shippingPoint, "
        "    n.overallGoodsMovementStatus=r.overallGoodsMovementStatus, "
        "    n.overallPickingStatus=r.overallPickingStatus, "
        "    n.creationDate=r.creationDate"
    ),
    "DeliveryItem.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:DeliveryItem {delivItemId: r.`delivItemId:ID(DeliveryItem)`}) "
        "SET n.deliveryDocument=r.deliveryDocument, "
        "    n.deliveryDocumentItem=r.deliveryDocumentItem, "
        "    n.actualDeliveryQuantity=toFloat(r.actualDeliveryQuantity), "
        "    n.plant=r.plant, n.storageLocation=r.storageLocation"
    ),
    "Invoice.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:Invoice {invoiceId: r.`invoiceId:ID(Invoice)`}) "
        "SET n.billingDocumentType=r.billingDocumentType, "
        "    n.totalNetAmount=toFloat(r.totalNetAmount), n.currency=r.currency, "
        "    n.fiscalYear=r.fiscalYear, "
        "    n.isCancelled=(r.isCancelled='true'), "
        "    n.billingDocumentDate=r.billingDocumentDate, "
        "    n.creationDate=r.creationDate"
    ),
    "InvoiceItem.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:InvoiceItem {invoiceItemId: r.`invoiceItemId:ID(InvoiceItem)`}) "
        "SET n.billingDocument=r.billingDocument, "
        "    n.billingDocumentItem=r.billingDocumentItem, "
        "    n.material=r.material, "
        "    n.billingQuantity=toFloat(r.billingQuantity), "
        "    n.netAmount=toFloat(r.netAmount), n.currency=r.currency"
    ),
    "Payment.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:Payment {paymentId: r.`paymentId:ID(Payment)`}) "
        "SET n.accountingDocument=r.accountingDocument, "
        "    n.amountInTransactionCurrency=toFloat(r.amountInTransactionCurrency), "
        "    n.currency=r.currency, n.clearingDate=r.clearingDate, "
        "    n.postingDate=r.postingDate, n.glAccount=r.glAccount"
    ),
    "JournalEntry.csv": (
        "UNWIND $rows AS r "
        "MERGE (n:JournalEntry {journalEntryId: r.`journalEntryId:ID(JournalEntry)`}) "
        "SET n.accountingDocument=r.accountingDocument, n.glAccount=r.glAccount, "
        "    n.amountInTransactionCurrency=toFloat(r.amountInTransactionCurrency), "
        "    n.currency=r.currency, n.documentType=r.documentType, "
        "    n.postingDate=r.postingDate"
    ),
}

# ── Relationship queries ──────────────────────────────────────────────────────
REL_QUERIES = {
    "Customer_HAS_ORDER_SalesOrder.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Customer {customerId: r.`:START_ID(Customer)`}) "
        "MATCH (b:SalesOrder {salesOrderId: r.`:END_ID(SalesOrder)`}) "
        "MERGE (a)-[:HAS_ORDER {creationDate: r.creationDate}]->(b)"
    ),
    "SalesOrder_HAS_ITEM_SalesOrderItem.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:SalesOrder {salesOrderId: r.`:START_ID(SalesOrder)`}) "
        "MATCH (b:SalesOrderItem {soItemId: r.`:END_ID(SalesOrderItem)`}) "
        "MERGE (a)-[:HAS_ITEM {lineNumber: r.lineNumber}]->(b)"
    ),
    "SalesOrderItem_FOR_PRODUCT_Product.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:SalesOrderItem {soItemId: r.`:START_ID(SalesOrderItem)`}) "
        "MATCH (b:Product {productId: r.`:END_ID(Product)`}) "
        "MERGE (a)-[:FOR_PRODUCT {quantity: toFloat(r.quantity), unit: r.unit}]->(b)"
    ),
    "SalesOrder_FULFILLED_BY_Delivery.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:SalesOrder {salesOrderId: r.`:START_ID(SalesOrder)`}) "
        "MATCH (b:Delivery {deliveryId: r.`:END_ID(Delivery)`}) "
        "MERGE (a)-[:FULFILLED_BY]->(b)"
    ),
    "Delivery_HAS_ITEM_DeliveryItem.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Delivery {deliveryId: r.`:START_ID(Delivery)`}) "
        "MATCH (b:DeliveryItem {delivItemId: r.`:END_ID(DeliveryItem)`}) "
        "MERGE (a)-[:HAS_ITEM {lineNumber: r.lineNumber}]->(b)"
    ),
    "DeliveryItem_SHIPS_SalesOrderItem.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:DeliveryItem {delivItemId: r.`:START_ID(DeliveryItem)`}) "
        "MATCH (b:SalesOrderItem {soItemId: r.`:END_ID(SalesOrderItem)`}) "
        "MERGE (a)-[:SHIPS {actualQty: toFloat(r.actualQty)}]->(b)"
    ),
    "DeliveryItem_DISPATCHED_FROM_Plant.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:DeliveryItem {delivItemId: r.`:START_ID(DeliveryItem)`}) "
        "MATCH (b:Plant {plantId: r.`:END_ID(Plant)`}) "
        "MERGE (a)-[:DISPATCHED_FROM {storageLocation: r.storageLocation}]->(b)"
    ),
    "Delivery_BILLED_AS_Invoice.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Delivery {deliveryId: r.`:START_ID(Delivery)`}) "
        "MATCH (b:Invoice {invoiceId: r.`:END_ID(Invoice)`}) "
        "MERGE (a)-[:BILLED_AS]->(b)"
    ),
    "Invoice_HAS_ITEM_InvoiceItem.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Invoice {invoiceId: r.`:START_ID(Invoice)`}) "
        "MATCH (b:InvoiceItem {invoiceItemId: r.`:END_ID(InvoiceItem)`}) "
        "MERGE (a)-[:HAS_ITEM {lineNumber: r.lineNumber}]->(b)"
    ),
    "InvoiceItem_FOR_PRODUCT_Product.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:InvoiceItem {invoiceItemId: r.`:START_ID(InvoiceItem)`}) "
        "MATCH (b:Product {productId: r.`:END_ID(Product)`}) "
        "MERGE (a)-[:FOR_PRODUCT {billedQty: toFloat(r.billedQty)}]->(b)"
    ),
    "Customer_ISSUED_INVOICE_Invoice.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Customer {customerId: r.`:START_ID(Customer)`}) "
        "MATCH (b:Invoice {invoiceId: r.`:END_ID(Invoice)`}) "
        "MERGE (a)-[:ISSUED_INVOICE {amount: toFloat(r.amount)}]->(b)"
    ),
    "Customer_MADE_PAYMENT_Payment.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Customer {customerId: r.`:START_ID(Customer)`}) "
        "MATCH (b:Payment {paymentId: r.`:END_ID(Payment)`}) "
        "MERGE (a)-[:MADE_PAYMENT {amount: toFloat(r.amount)}]->(b)"
    ),
    "Payment_CLEARS_Invoice.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Payment {paymentId: r.`:START_ID(Payment)`}) "
        "MATCH (b:Invoice {invoiceId: r.`:END_ID(Invoice)`}) "
        "MERGE (a)-[:CLEARS {clearingDate: r.clearingDate}]->(b)"
    ),
    "JournalEntry_RECORDS_Invoice.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:JournalEntry {journalEntryId: r.`:START_ID(JournalEntry)`}) "
        "MATCH (b:Invoice {invoiceId: r.`:END_ID(Invoice)`}) "
        "MERGE (a)-[:RECORDS {documentType: r.documentType}]->(b)"
    ),
    "Customer_HAS_ADDRESS_Address.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Customer {customerId: r.`:START_ID(Customer)`}) "
        "MATCH (b:Address {addressId: r.`:END_ID(Address)`}) "
        "MERGE (a)-[:HAS_ADDRESS {validFrom: r.validFrom}]->(b)"
    ),
    "Product_STORED_AT_Plant.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Product {productId: r.`:START_ID(Product)`}) "
        "MATCH (b:Plant {plantId: r.`:END_ID(Plant)`}) "
        "MERGE (a)-[:STORED_AT {profitCenter: r.profitCenter, mrpType: r.mrpType}]->(b)"
    ),
    "Invoice_CANCELS_Invoice.csv": (
        "UNWIND $rows AS r "
        "MATCH (a:Invoice {invoiceId: r.`:START_ID(Invoice)`}) "
        "MATCH (b:Invoice {invoiceId: r.`:END_ID(Invoice)`}) "
        "MERGE (a)-[:CANCELS {cancellationDate: r.cancellationDate}]->(b)"
    ),
}

# ── Run import ────────────────────────────────────────────────────────────────

with driver.session() as session:

    # 1. Constraints
    print("Step 1/3 — Creating constraints & indexes...")
    for q in CONSTRAINTS:
        session.run(q)
    print("  Done.\n")

    # 2. Nodes
    print("Step 2/3 — Loading nodes...")
    total_nodes = 0
    for fname, query in NODE_QUERIES.items():
        fpath = NODES_DIR / fname
        if not fpath.exists():
            print(f"  SKIP {fname} (file not found)")
            continue
        rows = load_csv(fpath)
        if not rows:
            print(f"  SKIP {fname} (empty)")
            continue
        n = run_batch(session, query, rows)
        total_nodes += n
        print(f"  ✓ {fname:<30s}  {n:>5,} rows")
    print(f"\n  Total nodes ingested: {total_nodes:,}\n")

    # 3. Relationships
    print("Step 3/3 — Loading relationships...")
    total_rels = 0
    for fname, query in REL_QUERIES.items():
        fpath = RELS_DIR / fname
        if not fpath.exists():
            print(f"  SKIP {fname} (file not found)")
            continue
        rows = load_csv(fpath)
        if not rows:
            print(f"  SKIP {fname} (empty)")
            continue
        n = run_batch(session, query, rows)
        total_rels += n
        print(f"  ✓ {fname:<55s}  {n:>5,} rows")
    print(f"\n  Total relationships ingested: {total_rels:,}\n")

driver.close()

print("=" * 60)
print("  Import complete!")
print("  Open Neo4j Browser and run:")
print("  MATCH (n) RETURN count(n) AS totalNodes")
print("=" * 60)
