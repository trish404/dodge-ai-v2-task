# SAP O2C Graph Intelligence System

## Overview

This project implements an end-to-end graph-based system for analyzing Order-to-Cash (O2C) business processes. It transforms structured transactional data into a connected graph, enabling traceability across orders, deliveries, invoices, journals, and payments.

The system integrates Neo4j Aura for scalable graph storage, a query abstraction layer for structured retrieval, and an LLM-powered interface for natural language querying — all governed by strict guardrails to ensure safe and reliable outputs.

---

## Pipeline Overview

The system follows a complete pipeline:

1. Dataset ingestion from JSONL files  
2. Graph construction and modeling  
3. Data ingestion into Neo4j Aura  
4. Graph visualization (3D)  
5. Query processing via a structured query layer  
6. Natural language interface using an LLM  
7. Guardrails for controlled and safe execution
8. UI Development
9. Deployment

---

## Dataset 
The dataset is organized as a collection of structured .jsonl files distributed across multiple folders, each representing a distinct business entity within the Order-to-Cash (O2C) process.

Each folder corresponds to a specific domain, such as:

sales_order_headers, sales_order_items, sales_order_schedule_lines
outbound_delivery_headers, outbound_delivery_items
billing_document_headers, billing_document_items, billing_document_cancellations
journal_entry_items_accounts_receivable
payments_accounts_receivable
business_partners, business_partner_addresses
products, product_descriptions, product_plants, product_storage_locations
plants, customer_company_assignments, customer_sales_area_assignments

Each .jsonl file contains line-separated JSON records.

These records collectively capture different stages of the O2C lifecycle, with implicit relationships formed through shared identifiers (e.g., order IDs, document numbers, customer IDs). The dataset is highly normalized and distributed, requiring integration across multiple sources to reconstruct complete business flows.

---

## Graph Construction

The graph is constructed by transforming the distributed JSONL dataset into a unified structure of interconnected nodes and relationships in Neo4j.

Each dataset folder is mapped to a corresponding entity (e.g., Customer, SalesOrder, Delivery, Invoice, Payment, Product, Plant), with item-level granularity preserved through intermediate nodes such as SalesOrderItem, DeliveryItem, and InvoiceItem.

Relationships are created by resolving shared identifiers across datasets, reconstructing the full Order-to-Cash lifecycle — from customer orders to fulfillment, billing, accounting, and payment clearance.

Key design considerations:

Nodes are created using unique identifiers to prevent duplication
Relationships are only established when valid references exist
Item-level linking ensures traceability across products and transactions
Incomplete flows are preserved to enable anomaly detection

The resulting graph enables end-to-end traversal of business processes, supporting both analytical queries and real-time inspection of transactional flows.

<img width="996" height="805" alt="Screenshot 2026-03-25 at 9 24 07 AM" src="https://github.com/user-attachments/assets/ce20fe29-0a13-4363-bd9b-69cd44e311e1" />


---

## Graph Ingestion Neo4j Aura
The data ingestion pipeline follows a two-stage transformation process.

First, the raw JSONL files are converted into structured CSV files, separating nodes and relationships to align with Neo4j’s graph model.

Next, these CSV files are ingested into Neo4j using a Python-based import script connected to Neo4j Aura. The script executes batched Cypher queries to efficiently create nodes and relationships while enforcing uniqueness through schema constraints.

For large-scale loading, Neo4j’s bulk import tool (neo4j-admin) is also used to initialize the graph directly from CSV files.

This hybrid approach combines the efficiency of bulk import with the flexibility of Cypher-based ingestion, enabling scalable and reliable graph construction in Neo4j Aura.
<img width="1534" height="844" alt="Screenshot 2026-03-25 at 3 29 15 PM" src="https://github.com/user-attachments/assets/f3479686-0009-440f-8ee1-fb493a93ec8d" />

---

## 



