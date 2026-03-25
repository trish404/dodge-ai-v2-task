#!/bin/bash

NEO4J_HOME="/Users/triahavijayekkumaran/Downloads/neo4j-community-5.20.0"
DB_NAME="6b6ad488"
IMPORT_DIR="/Users/triahavijayekkumaran/Downloads/neo4jimport"

"$NEO4J_HOME/bin/neo4j-admin" database import full "$DB_NAME" \
  --overwrite-destination=true \
  --nodes="Address=$IMPORT_DIR/nodes/Address.csv" \
  --nodes="Customer=$IMPORT_DIR/nodes/Customer.csv" \
  --nodes="Delivery=$IMPORT_DIR/nodes/Delivery.csv" \
  --nodes="DeliveryItem=$IMPORT_DIR/nodes/DeliveryItem.csv" \
  --nodes="Invoice=$IMPORT_DIR/nodes/Invoice.csv" \
  --nodes="InvoiceItem=$IMPORT_DIR/nodes/InvoiceItem.csv" \
  --nodes="JournalEntry=$IMPORT_DIR/nodes/JournalEntry.csv" \
  --nodes="Payment=$IMPORT_DIR/nodes/Payment.csv" \
  --nodes="Plant=$IMPORT_DIR/nodes/Plant.csv" \
  --nodes="Product=$IMPORT_DIR/nodes/Product.csv" \
  --nodes="SalesOrder=$IMPORT_DIR/nodes/SalesOrder.csv" \
  --nodes="SalesOrderItem=$IMPORT_DIR/nodes/SalesOrderItem.csv" \
  --relationships="$IMPORT_DIR/relationships/Customer_HAS_ADDRESS_Address.csv" \
  --relationships="$IMPORT_DIR/relationships/Customer_HAS_ORDER_SalesOrder.csv" \
  --relationships="$IMPORT_DIR/relationships/Customer_ISSUED_INVOICE_Invoice.csv" \
  --relationships="$IMPORT_DIR/relationships/Customer_MADE_PAYMENT_Payment.csv" \
  --relationships="$IMPORT_DIR/relationships/DeliveryItem_DISPATCHED_FROM_Plant.csv" \
  --relationships="$IMPORT_DIR/relationships/DeliveryItem_SHIPS_SalesOrderItem.csv" \
  --relationships="$IMPORT_DIR/relationships/Delivery_BILLED_AS_Invoice.csv" \
  --relationships="$IMPORT_DIR/relationships/Delivery_HAS_ITEM_DeliveryItem.csv" \
  --relationships="$IMPORT_DIR/relationships/InvoiceItem_FOR_PRODUCT_Product.csv" \
  --relationships="$IMPORT_DIR/relationships/Invoice_CANCELS_Invoice.csv" \
  --relationships="$IMPORT_DIR/relationships/Invoice_HAS_ITEM_InvoiceItem.csv" \
  --relationships="$IMPORT_DIR/relationships/JournalEntry_RECORDS_Invoice.csv" \
  --relationships="$IMPORT_DIR/relationships/Payment_CLEARS_Invoice.csv" \
  --relationships="$IMPORT_DIR/relationships/Product_STORED_AT_Plant.csv" \
  --relationships="$IMPORT_DIR/relationships/SalesOrderItem_FOR_PRODUCT_Product.csv" \
  --relationships="$IMPORT_DIR/relationships/SalesOrder_FULFILLED_BY_Delivery.csv" \
  --relationships="$IMPORT_DIR/relationships/SalesOrder_HAS_ITEM_SalesOrderItem.csv"

echo "Import complete. Start Neo4j and connect to database: $DB_NAME"
