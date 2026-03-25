CREATE CONSTRAINT IF NOT EXISTS FOR (n:Customer)       REQUIRE n.customerId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Address)        REQUIRE n.addressId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Product)        REQUIRE n.productId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Plant)          REQUIRE n.plantId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:SalesOrder)     REQUIRE n.salesOrderId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:SalesOrderItem) REQUIRE n.soItemId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Delivery)       REQUIRE n.deliveryId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:DeliveryItem)   REQUIRE n.delivItemId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Invoice)        REQUIRE n.invoiceId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:InvoiceItem)    REQUIRE n.invoiceItemId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Payment)        REQUIRE n.paymentId IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:JournalEntry)   REQUIRE n.journalEntryId IS UNIQUE;

LOAD CSV WITH HEADERS FROM "file:///nodes/Customer.csv" AS row
MERGE (n:Customer {customerId: row.`customerId:ID(Customer)`})
SET n.businessPartner = row.businessPartner,
    n.fullName        = row.fullName,
    n.name            = row.name,
    n.category        = row.category,
    n.isBlocked       = row.isBlocked = "true",
    n.creationDate    = date(row.creationDate);

LOAD CSV WITH HEADERS FROM "file:///nodes/Address.csv" AS row
MERGE (n:Address {addressId: row.`addressId:ID(Address)`})
SET n.businessPartner = row.businessPartner,
    n.city            = row.city,
    n.country         = row.country,
    n.postalCode      = row.postalCode,
    n.region          = row.region,
    n.street          = row.street;

LOAD CSV WITH HEADERS FROM "file:///nodes/Product.csv" AS row
MERGE (n:Product {productId: row.`productId:ID(Product)`})
SET n.description  = row.description,
    n.productType  = row.productType,
    n.productGroup = row.productGroup,
    n.baseUnit     = row.baseUnit,
    n.division     = row.division,
    n.isDeleted    = row.isDeleted = "true";

LOAD CSV WITH HEADERS FROM "file:///nodes/Plant.csv" AS row
MERGE (n:Plant {plantId: row.`plantId:ID(Plant)`})
SET n.name = row.name,
    n.salesOrganization  = row.salesOrganization,
    n.distributionChannel = row.distributionChannel;

LOAD CSV WITH HEADERS FROM "file:///nodes/SalesOrder.csv" AS row
MERGE (n:SalesOrder {salesOrderId: row.`salesOrderId:ID(SalesOrder)`})
SET n.salesOrderType         = row.salesOrderType,
    n.totalNetAmount         = toFloat(row.totalNetAmount),
    n.currency               = row.currency,
    n.overallDeliveryStatus  = row.overallDeliveryStatus,
    n.overallBillingStatus   = row.overallBillingStatus,
    n.paymentTerms           = row.paymentTerms,
    n.incoterms              = row.incoterms,
    n.creationDate           = date(row.creationDate);

LOAD CSV WITH HEADERS FROM "file:///nodes/SalesOrderItem.csv" AS row
MERGE (n:SalesOrderItem {soItemId: row.`soItemId:ID(SalesOrderItem)`})
SET n.salesOrder        = row.salesOrder,
    n.salesOrderItem    = row.salesOrderItem,
    n.material          = row.material,
    n.requestedQuantity = toFloat(row.requestedQuantity),
    n.netAmount         = toFloat(row.netAmount),
    n.currency          = row.currency,
    n.itemCategory      = row.itemCategory;

LOAD CSV WITH HEADERS FROM "file:///nodes/Delivery.csv" AS row
MERGE (n:Delivery {deliveryId: row.`deliveryId:ID(Delivery)`})
SET n.shippingPoint = row.shippingPoint,
    n.overallGoodsMovementStatus = row.overallGoodsMovementStatus,
    n.overallPickingStatus       = row.overallPickingStatus,
    n.creationDate               = date(row.creationDate);

LOAD CSV WITH HEADERS FROM "file:///nodes/DeliveryItem.csv" AS row
MERGE (n:DeliveryItem {delivItemId: row.`delivItemId:ID(DeliveryItem)`})
SET n.deliveryDocument      = row.deliveryDocument,
    n.deliveryDocumentItem  = row.deliveryDocumentItem,
    n.actualDeliveryQuantity = toFloat(row.actualDeliveryQuantity),
    n.plant                  = row.plant,
    n.storageLocation        = row.storageLocation;

LOAD CSV WITH HEADERS FROM "file:///nodes/Invoice.csv" AS row
MERGE (n:Invoice {invoiceId: row.`invoiceId:ID(Invoice)`})
SET n.billingDocumentType = row.billingDocumentType,
    n.totalNetAmount      = toFloat(row.totalNetAmount),
    n.currency            = row.currency,
    n.fiscalYear          = row.fiscalYear,
    n.isCancelled         = row.isCancelled = "true",
    n.billingDocumentDate = date(row.billingDocumentDate),
    n.creationDate        = date(row.creationDate);

LOAD CSV WITH HEADERS FROM "file:///nodes/InvoiceItem.csv" AS row
MERGE (n:InvoiceItem {invoiceItemId: row.`invoiceItemId:ID(InvoiceItem)`})
SET n.billingDocument     = row.billingDocument,
    n.billingDocumentItem = row.billingDocumentItem,
    n.material            = row.material,
    n.billingQuantity     = toFloat(row.billingQuantity),
    n.netAmount           = toFloat(row.netAmount),
    n.currency            = row.currency;

LOAD CSV WITH HEADERS FROM "file:///nodes/Payment.csv" AS row
MERGE (n:Payment {paymentId: row.`paymentId:ID(Payment)`})
SET n.accountingDocument    = row.accountingDocument,
    n.amountInTransactionCurrency = toFloat(row.amountInTransactionCurrency),
    n.currency              = row.currency,
    n.clearingDate          = date(row.clearingDate),
    n.postingDate           = date(row.postingDate),
    n.glAccount             = row.glAccount;

LOAD CSV WITH HEADERS FROM "file:///nodes/JournalEntry.csv" AS row
MERGE (n:JournalEntry {journalEntryId: row.`journalEntryId:ID(JournalEntry)`})
SET n.accountingDocument = row.accountingDocument,
    n.glAccount          = row.glAccount,
    n.amountInTransactionCurrency = toFloat(row.amountInTransactionCurrency),
    n.currency           = row.currency,
    n.documentType       = row.documentType,
    n.postingDate        = date(row.postingDate);

LOAD CSV WITH HEADERS FROM "file:///relationships/Customer_HAS_ORDER_SalesOrder.csv" AS row
MATCH (a:Customer {customerId: row.`:START_ID(Customer)`})
MATCH (b:SalesOrder {salesOrderId: row.`:END_ID(SalesOrder)`})
MERGE (a)-[:HAS_ORDER]->(b);

LOAD CSV WITH HEADERS FROM "file:///relationships/SalesOrder_HAS_ITEM_SalesOrderItem.csv" AS row
MATCH (a:SalesOrder {salesOrderId: row.`:START_ID(SalesOrder)`})
MATCH (b:SalesOrderItem {soItemId: row.`:END_ID(SalesOrderItem)`})
MERGE (a)-[:HAS_ITEM]->(b);

LOAD CSV WITH HEADERS FROM "file:///relationships/SalesOrderItem_FOR_PRODUCT_Product.csv" AS row
MATCH (a:SalesOrderItem {soItemId: row.`:START_ID(SalesOrderItem)`})
MATCH (b:Product {productId: row.`:END_ID(Product)`})
MERGE (a)-[:FOR_PRODUCT]->(b);

LOAD CSV WITH HEADERS FROM "file:///relationships/SalesOrder_FULFILLED_BY_Delivery.csv" AS row
MATCH (a:SalesOrder {salesOrderId: row.`:START_ID(SalesOrder)`})
MATCH (b:Delivery {deliveryId: row.`:END_ID(Delivery)`})
MERGE (a)-[:FULFILLED_BY]->(b);

LOAD CSV WITH HEADERS FROM "file:///relationships/Delivery_HAS_ITEM_DeliveryItem.csv" AS row
MATCH (a:Delivery {deliveryId: row.`:START_ID(Delivery)`})
MATCH (b:DeliveryItem {delivItemId: row.`:END_ID(DeliveryItem)`})
MERGE (a)-[:HAS_ITEM]->(b);

LOAD CSV WITH HEADERS FROM "file:///relationships/Delivery_BILLED_AS_Invoice.csv" AS row
MATCH (a:Delivery {deliveryId: row.`:START_ID(Delivery)`})
MATCH (b:Invoice {invoiceId: row.`:END_ID(Invoice)`})
MERGE (a)-[:BILLED_AS]->(b);

LOAD CSV WITH HEADERS FROM "file:///relationships/Payment_CLEARS_Invoice.csv" AS row
MATCH (a:Payment {paymentId: row.`:START_ID(Payment)`})
MATCH (b:Invoice {invoiceId: row.`:END_ID(Invoice)`})
MERGE (a)-[:CLEARS]->(b);
