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
├── .gitignore
├── audit.py                    # Auditing the entire dataset
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
This audit was done using the audit.py

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

<img width="839" height="790" alt="Screenshot 2026-03-26 at 10 44 30 AM" src="https://github.com/user-attachments/assets/818ac6cb-5025-41df-a601-4709c2e916e4" />

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

* Python-based Cypher import (`auraimport.py`):*

```bash
python auraimport.py
```

Connects to Neo4j Aura and executes batched Cypher queries to create nodes and relationships while enforcing uniqueness through schema constraints.

<img width="1534" height="844" alt="Screenshot 2026-03-25 at 3 29 15 PM" src="https://github.com/user-attachments/assets/f3479686-0009-440f-8ee1-fb493a93ec8d" />

---

## Query Processing

A structured query layer is implemented to translate user intent into predefined graph operations. Commands given by the user are converted into Cypher queries and executed against the Neo4j graph.

This abstraction ensures:
- Consistent query execution
- Clear separation between user input and database logic
- Controlled access to the graph structure

<img width="386" height="440" alt="Screenshot 2026-03-26 at 10 52 23 AM" src="https://github.com/user-attachments/assets/b1195a1a-3dd9-4fba-b52a-83a71bd0fc6e" />

---

## LLM Interface & Query Control

A Large Language Model (LLM) is integrated via Groq to enable natural language interaction with the system, allowing users to query the graph intuitively without needing to understand its underlying structure. User inputs are processed through the Groq API and translated into structured commands that are passed to the query layer, which then executes corresponding Cypher queries on the Neo4j graph.

This design creates a seamless bridge between natural language input and graph-based retrieval, ensuring consistent and efficient interpretation of user queries.

---

## Graph Visualization (3D)

The constructed graph is visualized in an interactive 3D environment to support exploration and analysis.

The visualization enables:
- Clear understanding of entity relationships
- Visual tracing of end-to-end O2C flows
- Identification of missing or incomplete links

Node types are visually distinguished, and relationships are represented as connections/edges, allowing users to intuitively navigate complex transactional structures.

<img width="1339" height="926" alt="Screenshot 2026-03-26 at 1 32 39 PM" src="https://github.com/user-attachments/assets/30b49df1-bc50-4e10-8268-34fdf921e749" />

---

## UI Development

A lightweight Next.js web application (located in `deployment/`) integrates all components of the system into a single interaction flow.

The UI allows users to:
- Input natural language queries
- Trigger graph-based analysis
- View structured outputs and graph insights

The interface acts as a bridge between the user, the LLM layer, and the graph database.
<img width="1727" height="922" alt="Screenshot 2026-03-26 at 1 36 36 PM" src="https://github.com/user-attachments/assets/796c05fd-66df-4ee4-9203-17a94471a2a4" />


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
