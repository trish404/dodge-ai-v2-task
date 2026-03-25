import json, glob, csv, os
from pathlib import Path
from collections import defaultdict

# ── Helpers ──────────────────────────────────────────────────────────────────

BASE  = Path("/Users/triahavijayekkumaran/Downloads/taskdodge")

DATA  = BASE / "sap-o2c-data"
OUT   = BASE / "neo4j_import_data_processed_csv"
NODES = OUT / "nodes"
RELS  = OUT / "relationships"

NODES.mkdir(parents=True, exist_ok=True)
RELS.mkdir(parents=True, exist_ok=True)

def load(name):
    rows = []
    for f in sorted((DATA / name).glob("*.jsonl")):
        with open(f) as fh:
            for line in fh:
                l = line.strip()
                if l:
                    rows.append(json.loads(l))
    return rows

def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"  ✓ {path.name:50s}  {len(rows):>7,} rows")

def dt(val):
    """Trim datetime to date string."""
    if val and isinstance(val, str) and "T" in val:
        return val.split("T")[0]
    return val or ""

# ── Load raw data ─────────────────────────────────────────────────────────────

print("Loading source data...")
so_hdrs    = load("sales_order_headers")
so_items   = load("sales_order_items")
so_scheds  = load("sales_order_schedule_lines")
del_hdrs   = load("outbound_delivery_headers")
del_items  = load("outbound_delivery_items")
bd_hdrs    = load("billing_document_headers")
bd_items   = load("billing_document_items")
bd_cancels = load("billing_document_cancellations")
payments   = load("payments_accounts_receivable")
jentries   = load("journal_entry_items_accounts_receivable")
bps        = load("business_partners")
bp_addrs   = load("business_partner_addresses")
cust_co    = load("customer_company_assignments")
cust_sales = load("customer_sales_area_assignments")
products   = load("products")
prod_descs = load("product_descriptions")
prod_plts  = load("product_plants")
plants     = load("plants")

print()

# ── Build lookup maps ─────────────────────────────────────────────────────────

prod_desc_map = {r["product"]: r["productDescription"] for r in prod_descs}
plant_name_map = {r["plant"]: r.get("plantName","") for r in plants}

# ── NODE: Customer ────────────────────────────────────────────────────────────

print("Writing nodes...")
cust_nodes = []
seen_cust = set()
for r in bps:
    cid = r["customer"] or r["businessPartner"]
    if cid and cid not in seen_cust:
        seen_cust.add(cid)
        cust_nodes.append({
            "customerId:ID(Customer)": cid,
            "businessPartner":         r["businessPartner"],
            "fullName":                r.get("businessPartnerFullName",""),
            "name":                    r.get("businessPartnerName",""),
            "category":                r.get("businessPartnerCategory",""),
            "grouping":                r.get("businessPartnerGrouping",""),
            "isBlocked":               str(r.get("businessPartnerIsBlocked",False)).lower(),
            "creationDate":            dt(r.get("creationDate","")),
        })

write_csv(NODES/"Customer.csv",
    ["customerId:ID(Customer)","businessPartner","fullName","name",
     "category","grouping","isBlocked","creationDate"],
    cust_nodes)

# ── NODE: Address ─────────────────────────────────────────────────────────────

addr_nodes = []
for r in bp_addrs:
    addr_nodes.append({
        "addressId:ID(Address)":  f"{r['businessPartner']}:{r['addressId']}",
        "businessPartner":        r["businessPartner"],
        "rawAddressId":           r["addressId"],
        "city":                   r.get("cityName",""),
        "country":                r.get("country",""),
        "postalCode":             r.get("postalCode",""),
        "region":                 r.get("region",""),
        "street":                 r.get("streetName",""),
        "timeZone":               r.get("addressTimeZone",""),
        "validFrom":              dt(r.get("validityStartDate","")),
    })

write_csv(NODES/"Address.csv",
    ["addressId:ID(Address)","businessPartner","rawAddressId","city",
     "country","postalCode","region","street","timeZone","validFrom"],
    addr_nodes)

# ── NODE: Product ─────────────────────────────────────────────────────────────

prod_nodes = []
seen_prod = set()
for r in products:
    pid = r["product"]
    if pid not in seen_prod:
        seen_prod.add(pid)
        prod_nodes.append({
            "productId:ID(Product)": pid,
            "productType":           r.get("productType",""),
            "description":           prod_desc_map.get(pid,""),
            "oldId":                 r.get("productOldId",""),
            "productGroup":          r.get("productGroup",""),
            "baseUnit":              r.get("baseUnit",""),
            "grossWeight":           r.get("grossWeight",""),
            "weightUnit":            r.get("weightUnit",""),
            "division":              r.get("division",""),
            "creationDate":          dt(r.get("creationDate","")),
            "isDeleted":             str(r.get("isMarkedForDeletion",False)).lower(),
        })

write_csv(NODES/"Product.csv",
    ["productId:ID(Product)","productType","description","oldId",
     "productGroup","baseUnit","grossWeight","weightUnit","division",
     "creationDate","isDeleted"],
    prod_nodes)

# ── NODE: Plant ───────────────────────────────────────────────────────────────

plant_nodes = []
for r in plants:
    plant_nodes.append({
        "plantId:ID(Plant)":  r["plant"],
        "name":               r.get("plantName",""),
        "salesOrganization":  r.get("salesOrganization",""),
        "companyCode":        r.get("valuationArea",""),
        "distributionChannel":r.get("distributionChannel",""),
        "division":           r.get("division",""),
        "addressId":          r.get("addressId",""),
        "factoryCalendar":    r.get("factoryCalendar",""),
    })

write_csv(NODES/"Plant.csv",
    ["plantId:ID(Plant)","name","salesOrganization","companyCode",
     "distributionChannel","division","addressId","factoryCalendar"],
    plant_nodes)

# ── NODE: SalesOrder ─────────────────────────────────────────────────────────

so_nodes = []
for r in so_hdrs:
    so_nodes.append({
        "salesOrderId:ID(SalesOrder)":   r["salesOrder"],
        "salesOrderType":                r.get("salesOrderType",""),
        "soldToParty":                   r.get("soldToParty",""),
        "salesOrganization":             r.get("salesOrganization",""),
        "distributionChannel":           r.get("distributionChannel",""),
        "totalNetAmount":                r.get("totalNetAmount",""),
        "currency":                      r.get("transactionCurrency",""),
        "creationDate":                  dt(r.get("creationDate","")),
        "requestedDeliveryDate":         dt(r.get("requestedDeliveryDate","")),
        "overallDeliveryStatus":         r.get("overallDeliveryStatus",""),
        "overallBillingStatus":          r.get("overallOrdReltdBillgStatus",""),
        "paymentTerms":                  r.get("customerPaymentTerms",""),
        "incoterms":                     r.get("incotermsClassification",""),
        "deliveryBlock":                 r.get("deliveryBlockReason",""),
        "billingBlock":                  r.get("headerBillingBlockReason",""),
    })

write_csv(NODES/"SalesOrder.csv",
    ["salesOrderId:ID(SalesOrder)","salesOrderType","soldToParty",
     "salesOrganization","distributionChannel","totalNetAmount","currency",
     "creationDate","requestedDeliveryDate","overallDeliveryStatus",
     "overallBillingStatus","paymentTerms","incoterms","deliveryBlock","billingBlock"],
    so_nodes)

# ── NODE: SalesOrderItem ──────────────────────────────────────────────────────

soi_nodes = []
for r in so_items:
    soi_nodes.append({
        "soItemId:ID(SalesOrderItem)": f"{r['salesOrder']}:{r['salesOrderItem']}",
        "salesOrder":                  r["salesOrder"],
        "salesOrderItem":              r["salesOrderItem"],
        "material":                    r.get("material",""),
        "requestedQuantity":           r.get("requestedQuantity",""),
        "quantityUnit":                r.get("requestedQuantityUnit",""),
        "netAmount":                   r.get("netAmount",""),
        "currency":                    r.get("transactionCurrency",""),
        "materialGroup":               r.get("materialGroup",""),
        "productionPlant":             r.get("productionPlant",""),
        "storageLocation":             r.get("storageLocation",""),
        "itemCategory":                r.get("salesOrderItemCategory",""),
        "rejectionReason":             r.get("salesDocumentRjcnReason",""),
    })

write_csv(NODES/"SalesOrderItem.csv",
    ["soItemId:ID(SalesOrderItem)","salesOrder","salesOrderItem","material",
     "requestedQuantity","quantityUnit","netAmount","currency","materialGroup",
     "productionPlant","storageLocation","itemCategory","rejectionReason"],
    soi_nodes)

# ── NODE: Delivery ────────────────────────────────────────────────────────────

del_nodes = []
for r in del_hdrs:
    del_nodes.append({
        "deliveryId:ID(Delivery)":   r["deliveryDocument"],
        "shippingPoint":             r.get("shippingPoint",""),
        "overallGoodsMovementStatus":r.get("overallGoodsMovementStatus",""),
        "overallPickingStatus":      r.get("overallPickingStatus",""),
        "deliveryBlock":             r.get("deliveryBlockReason",""),
        "billingBlock":              r.get("headerBillingBlockReason",""),
        "creationDate":              dt(r.get("creationDate","")),
        "actualGoodsMovementDate":   dt(r.get("actualGoodsMovementDate","")),
    })

write_csv(NODES/"Delivery.csv",
    ["deliveryId:ID(Delivery)","shippingPoint","overallGoodsMovementStatus",
     "overallPickingStatus","deliveryBlock","billingBlock",
     "creationDate","actualGoodsMovementDate"],
    del_nodes)

# ── NODE: DeliveryItem ────────────────────────────────────────────────────────

deli_nodes = []
for r in del_items:
    deli_nodes.append({
        "delivItemId:ID(DeliveryItem)": f"{r['deliveryDocument']}:{r['deliveryDocumentItem']}",
        "deliveryDocument":             r["deliveryDocument"],
        "deliveryDocumentItem":         r["deliveryDocumentItem"],
        "actualDeliveryQuantity":       r.get("actualDeliveryQuantity",""),
        "quantityUnit":                 r.get("deliveryQuantityUnit",""),
        "plant":                        r.get("plant",""),
        "storageLocation":              r.get("storageLocation",""),
        "referenceSdDocument":          r.get("referenceSdDocument",""),
        "referenceSdDocumentItem":      r.get("referenceSdDocumentItem",""),
        "batch":                        r.get("batch",""),
    })

write_csv(NODES/"DeliveryItem.csv",
    ["delivItemId:ID(DeliveryItem)","deliveryDocument","deliveryDocumentItem",
     "actualDeliveryQuantity","quantityUnit","plant","storageLocation",
     "referenceSdDocument","referenceSdDocumentItem","batch"],
    deli_nodes)

# ── NODE: Invoice (BillingDocument) ──────────────────────────────────────────

inv_nodes = []
seen_inv = set()
all_bd = bd_hdrs + bd_cancels
for r in all_bd:
    bid = r["billingDocument"]
    if bid not in seen_inv:
        seen_inv.add(bid)
        inv_nodes.append({
            "invoiceId:ID(Invoice)":    bid,
            "billingDocumentType":      r.get("billingDocumentType",""),
            "soldToParty":              r.get("soldToParty",""),
            "totalNetAmount":           r.get("totalNetAmount",""),
            "currency":                 r.get("transactionCurrency",""),
            "companyCode":              r.get("companyCode",""),
            "fiscalYear":               r.get("fiscalYear",""),
            "accountingDocument":       r.get("accountingDocument",""),
            "billingDocumentDate":      dt(r.get("billingDocumentDate","")),
            "creationDate":             dt(r.get("creationDate","")),
            "isCancelled":              str(r.get("billingDocumentIsCancelled",False)).lower(),
            "cancelledBillingDocument": r.get("cancelledBillingDocument",""),
        })

write_csv(NODES/"Invoice.csv",
    ["invoiceId:ID(Invoice)","billingDocumentType","soldToParty",
     "totalNetAmount","currency","companyCode","fiscalYear","accountingDocument",
     "billingDocumentDate","creationDate","isCancelled","cancelledBillingDocument"],
    inv_nodes)

# ── NODE: InvoiceItem ─────────────────────────────────────────────────────────

invitem_nodes = []
for r in bd_items:
    invitem_nodes.append({
        "invoiceItemId:ID(InvoiceItem)": f"{r['billingDocument']}:{r['billingDocumentItem']}",
        "billingDocument":               r["billingDocument"],
        "billingDocumentItem":           r["billingDocumentItem"],
        "material":                      r.get("material",""),
        "billingQuantity":               r.get("billingQuantity",""),
        "quantityUnit":                  r.get("billingQuantityUnit",""),
        "netAmount":                     r.get("netAmount",""),
        "currency":                      r.get("transactionCurrency",""),
        "referenceSdDocument":           r.get("referenceSdDocument",""),
        "referenceSdDocumentItem":       r.get("referenceSdDocumentItem",""),
    })

write_csv(NODES/"InvoiceItem.csv",
    ["invoiceItemId:ID(InvoiceItem)","billingDocument","billingDocumentItem",
     "material","billingQuantity","quantityUnit","netAmount","currency",
     "referenceSdDocument","referenceSdDocumentItem"],
    invitem_nodes)

# ── NODE: Payment ─────────────────────────────────────────────────────────────

pay_nodes = []
for r in payments:
    pay_nodes.append({
        "paymentId:ID(Payment)": f"{r['companyCode']}:{r['fiscalYear']}:{r['accountingDocument']}:{r['accountingDocumentItem']}",
        "companyCode":           r.get("companyCode",""),
        "fiscalYear":            r.get("fiscalYear",""),
        "accountingDocument":    r.get("accountingDocument",""),
        "accountingDocumentItem":r.get("accountingDocumentItem",""),
        "customer":              r.get("customer",""),
        "amountInTransactionCurrency": r.get("amountInTransactionCurrency",""),
        "currency":              r.get("transactionCurrency",""),
        "amountInCompanyCurrency":     r.get("amountInCompanyCodeCurrency",""),
        "companyCurrency":       r.get("companyCodeCurrency",""),
        "clearingDate":          dt(r.get("clearingDate","")),
        "clearingAccountingDocument":  r.get("clearingAccountingDocument",""),
        "postingDate":           dt(r.get("postingDate","")),
        "glAccount":             r.get("glAccount",""),
    })

write_csv(NODES/"Payment.csv",
    ["paymentId:ID(Payment)","companyCode","fiscalYear","accountingDocument",
     "accountingDocumentItem","customer","amountInTransactionCurrency","currency",
     "amountInCompanyCurrency","companyCurrency","clearingDate",
     "clearingAccountingDocument","postingDate","glAccount"],
    pay_nodes)

# ── NODE: JournalEntry ────────────────────────────────────────────────────────

je_nodes = []
seen_je = set()
for r in jentries:
    jid = f"{r['companyCode']}:{r['fiscalYear']}:{r['accountingDocument']}:{r['accountingDocumentItem']}"
    if jid not in seen_je:
        seen_je.add(jid)
        je_nodes.append({
            "journalEntryId:ID(JournalEntry)": jid,
            "companyCode":           r.get("companyCode",""),
            "fiscalYear":            r.get("fiscalYear",""),
            "accountingDocument":    r.get("accountingDocument",""),
            "accountingDocumentItem":r.get("accountingDocumentItem",""),
            "glAccount":             r.get("glAccount",""),
            "customer":              r.get("customer",""),
            "referenceDocument":     r.get("referenceDocument",""),
            "amountInTransactionCurrency": r.get("amountInTransactionCurrency",""),
            "currency":              r.get("transactionCurrency",""),
            "postingDate":           dt(r.get("postingDate","")),
            "documentType":          r.get("accountingDocumentType",""),
            "profitCenter":          r.get("profitCenter",""),
            "clearingDate":          dt(r.get("clearingDate","")),
            "clearingDocument":      r.get("clearingAccountingDocument",""),
            "financialAccountType":  r.get("financialAccountType",""),
        })

write_csv(NODES/"JournalEntry.csv",
    ["journalEntryId:ID(JournalEntry)","companyCode","fiscalYear",
     "accountingDocument","accountingDocumentItem","glAccount","customer",
     "referenceDocument","amountInTransactionCurrency","currency",
     "postingDate","documentType","profitCenter","clearingDate",
     "clearingDocument","financialAccountType"],
    je_nodes)

# =============================================================================
# RELATIONSHIPS
# =============================================================================

print("\nWriting relationships...")

# Build fast lookups
so_lookup  = {r["salesOrder"]: r for r in so_hdrs}
del_lookup = {r["deliveryDocument"]: r for r in del_hdrs}
bd_lookup  = {r["billingDocument"]: r for r in bd_hdrs}

# ── R1: Customer → HAS_ORDER → SalesOrder ────────────────────────────────────
r1 = []
for r in so_hdrs:
    if r.get("soldToParty") and r.get("salesOrder"):
        r1.append({
            ":START_ID(Customer)": r["soldToParty"],
            ":END_ID(SalesOrder)": r["salesOrder"],
            "creationDate":        dt(r.get("creationDate","")),
        })
write_csv(RELS/"Customer_HAS_ORDER_SalesOrder.csv",
    [":START_ID(Customer)",":END_ID(SalesOrder)","creationDate"], r1)

# ── R2: SalesOrder → HAS_ITEM → SalesOrderItem ───────────────────────────────
r2 = []
for r in so_items:
    r2.append({
        ":START_ID(SalesOrder)":    r["salesOrder"],
        ":END_ID(SalesOrderItem)":  f"{r['salesOrder']}:{r['salesOrderItem']}",
        "lineNumber":               r["salesOrderItem"],
    })
write_csv(RELS/"SalesOrder_HAS_ITEM_SalesOrderItem.csv",
    [":START_ID(SalesOrder)",":END_ID(SalesOrderItem)","lineNumber"], r2)

# ── R3: SalesOrderItem → FOR_PRODUCT → Product ───────────────────────────────
r3 = []
seen_prod_ids = {r["productId:ID(Product)"] for r in prod_nodes}
for r in so_items:
    mat = r.get("material","")
    if mat and mat in seen_prod_ids:
        r3.append({
            ":START_ID(SalesOrderItem)": f"{r['salesOrder']}:{r['salesOrderItem']}",
            ":END_ID(Product)":          mat,
            "quantity":                  r.get("requestedQuantity",""),
            "unit":                      r.get("requestedQuantityUnit",""),
        })
write_csv(RELS/"SalesOrderItem_FOR_PRODUCT_Product.csv",
    [":START_ID(SalesOrderItem)",":END_ID(Product)","quantity","unit"], r3)

# ── R4: SalesOrder → FULFILLED_BY → Delivery  (via delivery items) ───────────
r4 = []
seen_r4 = set()
# delivery items carry referenceSdDocument = salesOrder
for r in del_items:
    so_ref = r.get("referenceSdDocument","")
    deld   = r.get("deliveryDocument","")
    if so_ref and deld:
        key = (so_ref, deld)
        if key not in seen_r4:
            seen_r4.add(key)
            r4.append({
                ":START_ID(SalesOrder)": so_ref,
                ":END_ID(Delivery)":     deld,
            })
write_csv(RELS/"SalesOrder_FULFILLED_BY_Delivery.csv",
    [":START_ID(SalesOrder)",":END_ID(Delivery)"], r4)

# ── R5: Delivery → HAS_ITEM → DeliveryItem ───────────────────────────────────
r5 = []
for r in del_items:
    r5.append({
        ":START_ID(Delivery)":    r["deliveryDocument"],
        ":END_ID(DeliveryItem)":  f"{r['deliveryDocument']}:{r['deliveryDocumentItem']}",
        "lineNumber":             r["deliveryDocumentItem"],
    })
write_csv(RELS/"Delivery_HAS_ITEM_DeliveryItem.csv",
    [":START_ID(Delivery)",":END_ID(DeliveryItem)","lineNumber"], r5)

# ── R6: DeliveryItem → SHIPS → SalesOrderItem ────────────────────────────────
r6 = []
for r in del_items:
    so_ref   = r.get("referenceSdDocument","")
    soi_ref  = r.get("referenceSdDocumentItem","")
    if so_ref and soi_ref:
        # normalise item number (leading zeros in delivery items e.g. "000010" vs "10")
        soi_ref_norm = str(int(soi_ref)) if soi_ref.isdigit() else soi_ref
        r6.append({
            ":START_ID(DeliveryItem)":   f"{r['deliveryDocument']}:{r['deliveryDocumentItem']}",
            ":END_ID(SalesOrderItem)":   f"{so_ref}:{soi_ref_norm}",
            "actualQty":                 r.get("actualDeliveryQuantity",""),
        })
write_csv(RELS/"DeliveryItem_SHIPS_SalesOrderItem.csv",
    [":START_ID(DeliveryItem)",":END_ID(SalesOrderItem)","actualQty"], r6)

# ── R7: DeliveryItem → DISPATCHED_FROM → Plant ───────────────────────────────
r7 = []
plant_ids = {r["plantId:ID(Plant)"] for r in plant_nodes}
for r in del_items:
    plant = r.get("plant","")
    if plant and plant in plant_ids:
        r7.append({
            ":START_ID(DeliveryItem)": f"{r['deliveryDocument']}:{r['deliveryDocumentItem']}",
            ":END_ID(Plant)":          plant,
            "storageLocation":         r.get("storageLocation",""),
        })
write_csv(RELS/"DeliveryItem_DISPATCHED_FROM_Plant.csv",
    [":START_ID(DeliveryItem)",":END_ID(Plant)","storageLocation"], r7)

# ── R8: Delivery → BILLED_AS → Invoice  (via billing items referencing delivery) ─
r8 = []
seen_r8 = set()
for r in bd_items:
    ref_doc = r.get("referenceSdDocument","")   # this is delivery doc
    bid     = r.get("billingDocument","")
    if ref_doc and bid:
        key = (ref_doc, bid)
        if key not in seen_r8 and ref_doc in del_lookup:
            seen_r8.add(key)
            r8.append({
                ":START_ID(Delivery)": ref_doc,
                ":END_ID(Invoice)":    bid,
            })
write_csv(RELS/"Delivery_BILLED_AS_Invoice.csv",
    [":START_ID(Delivery)",":END_ID(Invoice)"], r8)

# ── R9: Invoice → HAS_ITEM → InvoiceItem ─────────────────────────────────────
r9 = []
for r in bd_items:
    r9.append({
        ":START_ID(Invoice)":    r["billingDocument"],
        ":END_ID(InvoiceItem)":  f"{r['billingDocument']}:{r['billingDocumentItem']}",
        "lineNumber":            r["billingDocumentItem"],
    })
write_csv(RELS/"Invoice_HAS_ITEM_InvoiceItem.csv",
    [":START_ID(Invoice)",":END_ID(InvoiceItem)","lineNumber"], r9)

# ── R10: InvoiceItem → FOR_PRODUCT → Product ─────────────────────────────────
r10 = []
for r in bd_items:
    mat = r.get("material","")
    if mat and mat in seen_prod_ids:
        r10.append({
            ":START_ID(InvoiceItem)": f"{r['billingDocument']}:{r['billingDocumentItem']}",
            ":END_ID(Product)":       mat,
            "billedQty":              r.get("billingQuantity",""),
        })
write_csv(RELS/"InvoiceItem_FOR_PRODUCT_Product.csv",
    [":START_ID(InvoiceItem)",":END_ID(Product)","billedQty"], r10)

# ── R11: Customer → ISSUED_INVOICE → Invoice ─────────────────────────────────
r11 = []
for r in bd_hdrs + bd_cancels:
    cid = r.get("soldToParty","")
    bid = r.get("billingDocument","")
    if cid and bid:
        r11.append({
            ":START_ID(Customer)": cid,
            ":END_ID(Invoice)":    bid,
            "billingDate":         dt(r.get("billingDocumentDate","")),
            "amount":              r.get("totalNetAmount",""),
        })
write_csv(RELS/"Customer_ISSUED_INVOICE_Invoice.csv",
    [":START_ID(Customer)",":END_ID(Invoice)","billingDate","amount"], r11)

# ── R12: Customer → MADE_PAYMENT → Payment ───────────────────────────────────
r12 = []
for r in payments:
    cid = r.get("customer","")
    pid = f"{r['companyCode']}:{r['fiscalYear']}:{r['accountingDocument']}:{r['accountingDocumentItem']}"
    if cid:
        r12.append({
            ":START_ID(Customer)": cid,
            ":END_ID(Payment)":    pid,
            "postingDate":         dt(r.get("postingDate","")),
            "amount":              r.get("amountInTransactionCurrency",""),
        })
write_csv(RELS/"Customer_MADE_PAYMENT_Payment.csv",
    [":START_ID(Customer)",":END_ID(Payment)","postingDate","amount"], r12)

# ── R13: Payment → CLEARS → Invoice ──────────────────────────────────────────
# Link via accountingDocument on invoice
r13 = []
acc_doc_to_inv = {r["accountingDocument"]: r["billingDocument"]
                  for r in bd_hdrs + bd_cancels if r.get("accountingDocument")}
for r in payments:
    acc = r.get("accountingDocument","")
    if acc and acc in acc_doc_to_inv:
        pid = f"{r['companyCode']}:{r['fiscalYear']}:{r['accountingDocument']}:{r['accountingDocumentItem']}"
        r13.append({
            ":START_ID(Payment)": pid,
            ":END_ID(Invoice)":   acc_doc_to_inv[acc],
            "clearingDate":       dt(r.get("clearingDate","")),
        })
write_csv(RELS/"Payment_CLEARS_Invoice.csv",
    [":START_ID(Payment)",":END_ID(Invoice)","clearingDate"], r13)

# ── R14: JournalEntry → RECORDS → Invoice ────────────────────────────────────
r14 = []
for r in jentries:
    ref = r.get("referenceDocument","")  # referenceDocument = billingDocument
    jid = f"{r['companyCode']}:{r['fiscalYear']}:{r['accountingDocument']}:{r['accountingDocumentItem']}"
    if ref and ref in {n["invoiceId:ID(Invoice)"] for n in inv_nodes}:
        r14.append({
            ":START_ID(JournalEntry)": jid,
            ":END_ID(Invoice)":        ref,
            "documentType":            r.get("accountingDocumentType",""),
        })
write_csv(RELS/"JournalEntry_RECORDS_Invoice.csv",
    [":START_ID(JournalEntry)",":END_ID(Invoice)","documentType"], r14)

# ── R15: Customer → HAS_ADDRESS → Address ────────────────────────────────────
r15 = []
for r in bp_addrs:
    bp = r["businessPartner"]
    r15.append({
        ":START_ID(Customer)": bp,
        ":END_ID(Address)":    f"{bp}:{r['addressId']}",
        "validFrom":           dt(r.get("validityStartDate","")),
    })
write_csv(RELS/"Customer_HAS_ADDRESS_Address.csv",
    [":START_ID(Customer)",":END_ID(Address)","validFrom"], r15)

# ── R16: Product → STORED_AT → Plant ─────────────────────────────────────────
r16 = []
seen_r16 = set()
for r in prod_plts:
    prod = r["product"]
    pln  = r["plant"]
    key  = (prod, pln)
    if key not in seen_r16 and prod in seen_prod_ids and pln in plant_ids:
        seen_r16.add(key)
        r16.append({
            ":START_ID(Product)": prod,
            ":END_ID(Plant)":     pln,
            "profitCenter":       r.get("profitCenter",""),
            "mrpType":            r.get("mrpType",""),
        })
write_csv(RELS/"Product_STORED_AT_Plant.csv",
    [":START_ID(Product)",":END_ID(Plant)","profitCenter","mrpType"], r16)

# ── R17: Invoice → CANCELS → Invoice (cancellation link) ─────────────────────
r17 = []
for r in bd_cancels:
    if r.get("billingDocumentIsCancelled") and r.get("cancelledBillingDocument"):
        r17.append({
            ":START_ID(Invoice)": r["billingDocument"],
            ":END_ID(Invoice)":   r["cancelledBillingDocument"],
            "cancellationDate":   dt(r.get("creationDate","")),
        })
write_csv(RELS/"Invoice_CANCELS_Invoice.csv",
    [":START_ID(Invoice)",":END_ID(Invoice)","cancellationDate"], r17)

# =============================================================================
# SUMMARY
# =============================================================================

print("\n" + "="*60)
print("GRAPH SUMMARY")
print("="*60)
node_counts = {}
for f in sorted(NODES.glob("*.csv")):
    with open(f) as fh:
        cnt = sum(1 for _ in fh) - 1  # minus header
    label = f.stem
    node_counts[label] = cnt
    print(f"  Node  {label:<25s}: {cnt:>7,}")

print()
rel_counts = {}
for f in sorted(RELS.glob("*.csv")):
    with open(f) as fh:
        cnt = sum(1 for _ in fh) - 1
    label = f.stem
    rel_counts[label] = cnt
    print(f"  Rel   {label:<50s}: {cnt:>7,}")

total_nodes = sum(node_counts.values())
total_rels  = sum(rel_counts.values())
print(f"\n  TOTAL NODES : {total_nodes:,}")
print(f"  TOTAL RELS  : {total_rels:,}")

print("\nDone.")
