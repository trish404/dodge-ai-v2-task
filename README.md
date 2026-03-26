# SAP O2C Graph Intelligence System

## Overview

This project implements an end-to-end graph-based system for analyzing Order-to-Cash (O2C) business processes. It transforms structured transactional data into a connected graph, enabling traceability across orders, deliveries, invoices, journals, and payments.

The system integrates Neo4j Aura for scalable graph storage, a query abstraction layer for structured retrieval, and an LLM-powered interface for natural language querying — all governed by strict guardrails to ensure safe and reliable outputs.

---

## Repository Structure

```
├── csv/                        # Generated CSV files (nodes + relationships)
│   ├── nodes/
│   ├── relationships/
├── deployment/                 # Next.js web application
│   ├── app/                    # Next.js app directory (pages & API routes)
│   ├── components/             # React UI components
│   ├── lib/                    # Utility functions and graph query logic
│   ├── public/                 # Static assets (schema diagram)
│   ├── next.config.mjs
│   ├── package.json
│   ├── postcss.config.js
│   └── tailwind.config.js
├── auraimport.py               # Python script for Neo4j Aura ingestion
├── bulk.sh                     # Shell script for bulk CSV import
├── jsonl2csv.py                # JSONL → CSV transformation script
├── load.cypher                 # Cypher queries for schema constraints & loading
├── audit.py                    # Auditing the entire dataset
├── .gitignore
└── README.md
```

---

## Pipeline Overview

The system follows a complete end-to-end pipeline:

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

The dataset is organized as a collection of structured `.jsonl` files distributed across multiple folders, each representing a distinct business entity within the Order-to-Cash (O2C) process.

Each folder corresponds to a specific domain:

- `sales_order_headers`, `sales_order_items`, `sales_order_schedule_lines`
- `outbound_delivery_headers`, `outbound_delivery_items`
- `billing_document_headers`, `billing_document_items`, `billing_document_cancellations`
- `journal_entry_items_accounts_receivable`
- `payments_accounts_receivable`
- `business_partners`, `business_partner_addresses`
- `products`, `product_descriptions`, `product_plants`, `product_storage_locations`
- `plants`, `customer_company_assignments`, `customer_sales_area_assignments`

Each `.jsonl` file contains line-separated JSON records that collectively capture different stages of the O2C lifecycle, with implicit relationships formed through shared identifiers (e.g., order IDs, document numbers, customer IDs). The dataset is highly normalized and distributed, requiring integration across multiple sources to reconstruct complete business flows.

A structural audit of all dataset files was performed using `audit.py` to validate schema consistency, identify missing fields, and surface anomalies before ingestion.

---

## Architecture Decisions

The system is designed around three core principles: **traceability**, **separation of concerns**, and **controlled LLM access**.

### Graph-First Data Model

Rather than loading O2C data into a relational or document store, the system models the entire business process as a property graph. Each business entity (Customer, SalesOrder, Delivery, Invoice, Payment, etc.) becomes a node, and the transitions between them (e.g., `FULFILLED_BY`, `BILLED_AS`, `CLEARS`) become relationships.

This decision was driven by the nature of the O2C process itself — it is inherently a chain of connected events. A graph model makes traversal across that chain a first-class operation rather than a series of expensive joins. It also preserves incomplete flows (e.g., orders with no delivery, invoices with no payment) as natural gaps in the graph, which are immediately surfaced during querying rather than hidden by null handling.

### Layered Query Architecture

The system separates user intent from database execution through a structured query layer. Raw natural language input is never passed directly to the database. Instead, the LLM resolves intent into a predefined command, which the query layer maps to a validated Cypher template. This ensures that:

- The database is never exposed to free-form or adversarial input
- Query logic is version-controlled and auditable
- The LLM's role is constrained to intent classification, not query generation

### Item-Level Granularity

The graph preserves line-item nodes (`SalesOrderItem`, `DeliveryItem`, `InvoiceItem`) as distinct entities rather than flattening them into their parent documents. This enables product-level traceability across the full O2C chain — for example, tracing a specific material from a sales order through delivery dispatch, billing, and journal posting — which would not be possible with a document-centric model.

### Stateless Next.js Frontend

The UI is intentionally stateless on the client side. All graph queries are executed server-side via Next.js API routes, which act as a secure proxy between the browser and Neo4j Aura. This prevents Neo4j credentials and query logic from being exposed to the client and keeps the deployment portable.

---

## Database Choice — Why Neo4j Aura

Neo4j was selected as the primary database for this system for the following reasons:

**Native graph storage.** Neo4j stores nodes and relationships as first-class citizens with O(1) relationship traversal, regardless of dataset size. For O2C analysis — which requires multi-hop traversal across customers, orders, deliveries, invoices, and payments — this provides a fundamental performance advantage over relational joins or document lookups.

**Cypher query language.** Cypher's pattern-matching syntax maps directly onto the mental model of the O2C process. Queries like "find all customers with open invoices and no corresponding payment" are expressed naturally as graph patterns, making the query layer easier to maintain and extend.

**Neo4j Aura (managed cloud).** Aura eliminates infrastructure management overhead. It provides a persistent, cloud-hosted graph instance with TLS-secured connections, automatic backups, and a web-based browser console — suitable for a project where the focus is on data modeling and application logic rather than database operations.

**Schema flexibility.** Neo4j's schema-optional model allows the graph to evolve as new entity types or relationship patterns are discovered in the dataset, without requiring migrations. Uniqueness constraints and indexes are applied selectively via `load.cypher` to enforce integrity on key identifiers.

**Alternatives considered.** A relational database (e.g., PostgreSQL) would require complex multi-table joins to reconstruct O2C flows and would not naturally surface incomplete chains. A document store (e.g., MongoDB) would make cross-entity traversal expensive. A vector database was not appropriate here as the primary access pattern is structured traversal, not semantic similarity.

---

## Graph Construction

The graph is constructed by transforming the distributed JSONL dataset into a unified structure of interconnected nodes and relationships in Neo4j.

Each dataset folder is mapped to a corresponding entity (e.g., `Customer`, `SalesOrder`, `Delivery`, `Invoice`, `Payment`, `Product`, `Plant`), with item-level granularity preserved through intermediate nodes such as `SalesOrderItem`, `DeliveryItem`, and `InvoiceItem`.

Relationships are created by resolving shared identifiers across datasets, reconstructing the full Order-to-Cash lifecycle — from customer orders to fulfillment, billing, accounting, and payment clearance.

**Key design considerations:**

- Nodes are created using unique identifiers to prevent duplication
- Relationships are only established when valid references exist
- Item-level linking ensures traceability across products and transactions
- Incomplete flows are preserved to enable anomaly detection

The resulting graph enables end-to-end traversal of business processes, supporting both analytical queries and real-time inspection of transactional flows.

**Graph Schema:**

<img width="839" height="790" alt="Screenshot 2026-03-26 at 10 44 30 AM" src="https://github.com/user-attachments/assets/818ac6cb-5025-41df-a601-4709c2e916e4" />

---

## Graph Ingestion into Neo4j Aura

The data ingestion pipeline follows a two-stage transformation process.

**Stage 1 — JSONL to CSV (`jsonl2csv.py`)**

Raw JSONL files are converted into structured CSV files, separating nodes and relationships to align with Neo4j's graph model.

```bash
python jsonl2csv.py
```

This produces CSV files inside the `csv/` directory, organized by entity type.

**Stage 2 — Ingestion into Neo4j Aura**

Python-based Cypher import (`auraimport.py`):

```bash
python auraimport.py
```

Connects to Neo4j Aura and executes batched Cypher queries to create nodes and relationships while enforcing uniqueness through schema constraints.

<img width="1534" height="844" alt="Screenshot 2026-03-25 at 3 29 15 PM" src="https://github.com/user-attachments/assets/f3479686-0009-440f-8ee1-fb493a93ec8d" />
<img width="1533" height="789" alt="Screenshot 2026-03-26 at 1 56 42 PM" src="https://github.com/user-attachments/assets/f9f35185-c41f-4a45-afa6-ceb5dbc37ce3" />

---

## Query Processing

A structured query layer is implemented to translate user intent into predefined graph operations. Commands given by the user are converted into Cypher queries and executed against the Neo4j graph.

This abstraction ensures:
- Consistent query execution
- Clear separation between user input and database logic
- Controlled access to the graph structure

<img width="386" height="440" alt="Screenshot 2026-03-26 at 10 52 23 AM" src="https://github.com/user-attachments/assets/b1195a1a-3dd9-4fba-b52a-83a71bd0fc6e" />

---

## LLM Interface & Prompting Strategy


A Large Language Model (LLM) is integrated via Groq to enable natural language interaction with the system, allowing users to query the graph intuitively without needing to understand its underlying structure.

### Integration Architecture

User inputs are processed through the Groq API and translated into structured commands that are passed to the query layer, which then executes corresponding Cypher queries on the Neo4j graph. The LLM is never given direct access to the database — it operates solely as an intent resolver.

### Prompting Strategy

The LLM is prompted with a **system prompt** that establishes a strict operational context. Key elements of the prompting strategy are:

**Role framing.** The model is instructed to act as a query interpreter for an SAP Order-to-Cash graph database. It is given a precise description of the graph schema — node labels, relationship types, and key properties — so that it can ground its outputs in the actual data model rather than hallucinating entity names or fields.

**Intent-to-command mapping.** Rather than asking the LLM to generate free-form Cypher, the system prompt enumerates a fixed set of supported query intents (e.g., `GET_ORDER_STATUS`, `TRACE_DELIVERY`, `CHECK_PAYMENT_CLEARANCE`). The model is instructed to classify the user's input into one of these intents and return a structured JSON response containing the matched intent and any extracted parameters (e.g., order ID, customer name).

**Few-shot examples.** The system prompt includes a small set of input/output examples that demonstrate correct intent classification and parameter extraction. This significantly reduces misclassification on ambiguous or abbreviated inputs common in enterprise contexts.

**Schema-anchored output.** The model is explicitly told which node properties are valid filter keys (e.g., `salesOrderId`, `customerId`, `invoiceId`). This prevents it from extracting parameters that don't exist in the graph, which would cause the downstream Cypher query to silently return no results.

**Fallback instruction.** If the user's input does not match any supported intent, the model is instructed to return a structured `UNKNOWN` intent rather than attempting to answer directly. This routes the request to a graceful fallback response in the UI rather than producing an uncontrolled output.

---

## Guardrails


Given that the system connects a public-facing UI to a live graph database via an LLM, guardrails are applied at multiple layers to prevent unsafe, incorrect, or unpredictable behaviour.

### Input Guardrails

**Intent allowlisting.** The query layer only accepts a predefined set of intent strings. Any input that the LLM classifies outside this set is rejected before reaching the database. This prevents prompt injection attempts from being translated into arbitrary database operations.

**Parameter validation.** Extracted parameters (e.g., order IDs, customer IDs) are validated against expected formats before being interpolated into Cypher templates. Inputs that fail validation are rejected with a structured error response rather than passed to the database.

**Query templating over generation.** Cypher queries are never dynamically generated by the LLM. All queries are pre-written templates stored in the query layer, with only validated parameter values substituted at runtime. This eliminates the risk of malformed or malicious Cypher reaching Neo4j.

### Output Guardrails

**Result bounding.** All Cypher queries include explicit `LIMIT` clauses to prevent unbounded result sets from being returned to the UI. This protects both database performance and the user from being presented with unmanageable volumes of data.

**Structured response schema.** The LLM is instructed to always return responses in a defined JSON schema. Responses that do not conform to this schema are caught and replaced with a fallback error message before being displayed to the user.

**No raw Cypher exposure.** The UI never displays the underlying Cypher query to the user. Query logic is encapsulated server-side, preventing users from inferring the graph schema or crafting targeted bypass attempts.

### Operational Guardrails

**Read-only database access.** The Neo4j credentials used by the application are scoped to read-only operations. Write operations (node creation, relationship modification) are only possible via the separate ingestion scripts (`auraimport.py`, `bulk.sh`), which are run outside the application context.

**Environment variable isolation.** All credentials (Neo4j URI, password, Groq API key) are stored in `.env.local` and are never committed to version control or exposed to the client-side bundle. Server-side API routes in Next.js act as the sole access point to these credentials.

---

## Graph Visualization (3D)

The constructed graph is visualized in an interactive 3D environment to support exploration and analysis.

The visualization enables:
- Clear understanding of entity relationships
- Visual tracing of end-to-end O2C flows
- Identification of missing or incomplete links

Node types are visually distinguished, and relationships are represented as connections/edges, allowing users to intuitively navigate complex transactional structures.

<img width="1339" height="926" alt="Screenshot 2026-03-26 at 1 32 39 PM" src="https://github.com/user-attachments/assets/30b49df1-bc50-4e10-8268-34fdf921e749" />

---

## UI Development

A lightweight Next.js web application (located in `deployment/`) integrates all components of the system into a single interaction flow.

The UI allows users to:
- Input natural language queries
- Trigger graph-based analysis
- View structured outputs and graph insights

The interface acts as a bridge between the user, the LLM layer, and the graph database.

<img width="1727" height="922" alt="Screenshot 2026-03-26 at 1 36 36 PM" src="https://github.com/user-attachments/assets/796c05fd-66df-4ee4-9203-17a94471a2a4" />

---

## Deployment

The web application is a **Next.js** app located in the `deployment/` directory.

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm v9 or higher
- A running Neo4j Aura instance with the graph already ingested (see [Graph Ingestion](#graph-ingestion-into-neo4j-aura))
- A Groq API key

### Environment Variables

Create a `.env.local` file inside the `deployment/` directory:

```bash
cd deployment
cp .env.example .env.local   # if an example file exists, otherwise create it manually
```

Add the following variables to `.env.local`:

```env
NEO4J_URI=neo4j+s://<your-aura-instance-id>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<your-neo4j-aura-password>
GROQ_API_KEY=<your-groq-api-key>
```

### Install Dependencies

```bash
cd deployment
npm install
```

### Run in Development Mode

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Build and Run in Production Mode

```bash
npm run build
npm start
```

The production server will start on port `3000` by default.

### Deploy to Vercel (Recommended)

The app can be deployed to [Vercel](https://vercel.com/) directly from the `deployment/` folder:

1. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. From the `deployment/` directory, run:
   ```bash
   vercel
   ```

3. When prompted, set the **root directory** to `deployment/`.

4. Add the environment variables (`NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `GROQ_API_KEY`) in the Vercel project settings under **Settings → Environment Variables**.

5. Redeploy after adding environment variables:
   ```bash
   vercel --prod
   ```

> **Note:** Ensure your Neo4j Aura instance allows external connections from Vercel's IP range, or use connection pooling if needed.

---

## End-to-End Setup Summary

For a clean setup from scratch, follow this sequence:

```bash
# 1. Convert raw JSONL data to CSV
python jsonl2csv.py

# 2. Ingest data into Neo4j Aura
python auraimport.py       # or: bash bulk.sh for bulk loading

# 3. Navigate to the deployment folder
cd deployment

# 4. Install dependencies
npm install

# 5. Configure environment variables
# (create .env.local with Neo4j and Groq credentials)

# 6. Run the app
npm run dev                # development
# or
npm run build && npm start # production
```

---

## Conclusion

This project demonstrates how large-scale transactional data can be transformed into a graph-based intelligence system. By combining graph databases, structured query abstraction, and LLM-based interaction with strict guardrails, the system enables intuitive yet controlled exploration of complex business processes.

It highlights the potential of graph-driven architectures in improving traceability, analysis, and decision-making within enterprise workflows.
