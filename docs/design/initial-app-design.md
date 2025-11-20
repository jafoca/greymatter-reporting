Here is the complete design document formatted as a Markdown file. You can save this as `design_document.md`.

````markdown
# Software Design Document: ReliaQuest MDR Analytics Dashboard

## 1. Executive Summary
This application is a local analytics platform designed to interface with the ReliaQuest GreyMatter API. It acts as a "Store & Forward" engine, synchronizing incident data into a local PostgreSQL database to overcome API rate limits and enable complex historical trending (30/60/90-day analysis) that is not possible via the native portal.

The primary goals are to visualize team workload, identify burnout risks, analyze detection efficacy, and provide executive reporting capabilities via PDF export.

## 2. System Architecture

### 2.1. High-Level Diagram
The system follows a standard 3-tier architecture but includes a specialized background worker for API synchronization.

```mermaid
graph TD
    User[User/Browser] -->|HTTP/React| FE[Frontend (React/MUI)]
    FE -->|REST API| BE[Backend API (Node.js)]
    BE -->|SQL Read/Write| DB[(PostgreSQL)]
    
    subgraph "Background Services"
        Syncer[Sync Worker Service] -->|GraphQL| RQ[ReliaQuest API]
        Syncer -->|Upsert Data| DB
    end
````

### 2.2. Technology Stack

  * **Frontend:** React.js (Vite), Material UI (MUI) v5, Recharts (Visualization), `jspdf` & `html2canvas` (PDF Export).
  * **Backend:** Node.js (Express or NestJS).
  * **Database:** PostgreSQL (v14+).
  * **ORM:** Prisma (Recommended) or TypeORM for schema management and migrations.
  * **Scheduling:** `node-cron` or `BullMQ` for managing sync intervals.

-----

## 3\. Data Ingestion Strategy (The "Syncer")

### 3.1. Rate Limit Management

  * **Constraint:** ReliaQuest limits usage to **5000 tokens per hour**.
  * **Strategy:**
      * Implement a "Token Bucket" limiter locally.
      * Every GraphQL request subtracts its estimated cost from the bucket.
      * If bucket \< cost, the sync pauses until the hour resets.
      * The app must respect `x-rate-limit-remaining` headers if provided by the API.

### 3.2. Synchronization Logic

The sync process runs every 15 minutes (configurable via `.env`).

**Phase 1: Incremental List Fetch**

1.  Query the local DB for the `latest_updated_at` timestamp.
2.  Call GraphQL `incidents` query filtering by `updated: { earliest: [latest_updated_at] }`.
3.  **Optimization:** Only request high-level fields in this phase (`id`, `state`, `updatedAt`).

**Phase 2: Detail Hydration (The Expensive Part)**

1.  Identify incidents from Phase 1 that are **NEW** or have **CHANGED** status.
2.  Loop through these IDs and fetch the full `incident` details (including `acknowledgement`, `rule`, and `activity` logs).
3.  **Immutable Lock:** If an incident's state is `CLOSED` or `RESOLVED` in the local DB, **do not** re-fetch it unless explicitly forced by a user action.

### 3.3. Data Schema (PostgreSQL)

Schema designed to support required analytics and future-proofing.

**Table: `incidents`**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | VARCHAR | Primary Key (ReliaQuest ID) |
| `ticket_number` | VARCHAR | Human readable (e.g., RQ-1234) |
| `title` | TEXT | |
| `severity` | VARCHAR | Critical, High, Medium, Low |
| `state` | VARCHAR | NEW, PENDING\_CUSTOMER, RESOLVED, CLOSED, etc. |
| `created_at` | TIMESTAMP | Source of truth for "Volume" |
| `escalated_at` | TIMESTAMP | Critical for MTTA/MTTR calc |
| `acknowledged_at` | TIMESTAMP | Sourced from `incident.acknowledgement.createdAt` |
| `closed_at` | TIMESTAMP | Sourced from `closedAt` |
| `rule_name` | VARCHAR | For Detection Engineering analysis |
| `close_code` | VARCHAR | False Positive, True Positive, etc. |
| `assignee_name` | VARCHAR | Current owner |
| `raw_data` | JSONB | Full API response for future-proofing |

**Table: `incident_activity` (For "Parking Lot" metrics)**
*Note: Used to calculate time spent in specific intermediate states.*
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | SERIAL | |
| `incident_id` | VARCHAR | FK to `incidents` |
| `activity_type` | VARCHAR | e.g., "STATUS\_CHANGE" |
| `old_value` | VARCHAR | e.g., "PENDING\_CUSTOMER" |
| `new_value` | VARCHAR | e.g., "IN\_PROGRESS" |
| `timestamp` | TIMESTAMP | |

-----

## 4\. Backend API Design

The Node.js backend provides a REST API for the frontend to consume.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/incidents` | GET | Main data grid source. Supports filtering (date range, severity, assignee) and sorting. |
| `/api/incidents/export` | GET | Generates CSV/Excel of the current filter set. |
| `/api/stats/kpi` | GET | Returns aggregate numbers: Avg MTTR, Avg MTTA, Open Case Count. |
| `/api/stats/burnout` | GET | Returns dataset for "7-day avg vs 90-day avg" chart. |
| `/api/stats/rules` | GET | Returns "Noisiest Rules" (Count by Rule Name desc). |
| `/api/stats/heatmap` | GET | Returns 2D array [DayOfWeek][Hour] for incident volume. |
| `/api/system/sync-status`| GET | Returns last sync time and API token usage status. |

-----

## 5\. Frontend & Visualization

### 5.1. Dashboard View (The "SOC Wall")

Designed for high visibility and "At-a-Glance" status.

  * **KPI Cards (Top Row):**
      * **MTTA:** Big number display. Color code: Green (\<15m), Red (\>30m).
      * **MTTR:** Big number display. Breakdown for Escalated vs Non-Escalated.
      * **Active Caseload:** Total open tickets currently assigned.
  * **Main Chart: The "Burnout" Graph:**
      * Line chart showing 7-day rolling MTTR vs 90-day baseline.
  * **Secondary Chart: The "Triage Gap":**
      * Bar chart showing average time between `created_at` and `escalated_at` per day.
  * **Pie Charts:** Severity Breakdown, Close Code Analysis.

### 5.2. Data Explorer View

  * **Component:** MUI X Data Grid.
  * **Features:**
      * Server-side pagination (essential for performance).
      * Multi-column filtering (e.g., "Severity = Critical" AND "Status \!= Closed").
      * "Export to CSV" button (calls backend `/export` endpoint).
  * **Click-through:** Clicking a row opens a modal with the raw JSON details or a formatted summary.

### 5.3. Reporting

  * **Implementation:** A "Print / Export PDF" button on the Dashboard.
  * **Mechanism:** The app triggers a "Print Mode" CSS media query (hiding nav bars/buttons), uses `html2canvas` to take a screenshot of the dashboard area, and wraps it in a PDF container using `jspdf`.

-----

## 6\. Metric Logic Definitions

How the backend calculates specific requirements:

1.  **MTTA (Mean Time To Acknowledge):**

      * *Formula:* `AVG(acknowledged_at - escalated_at)`
      * *Constraint:* Only applies to incidents where `escalated_at` is not null.

2.  **MTTR (Mean Time To Resolve):**

      * *Escalated:* `AVG(closed_at - escalated_at)`
      * *Non-Escalated:* `AVG(closed_at - created_at)`

3.  **The "Hidden Backlog" (Age of Open Tickets):**

      * *Formula:* `AVG(NOW() - escalated_at)` where `state != CLOSED` and `state != RESOLVED`.

4.  **False Positive Rate (Detection Tuning):**

      * *Formula:* Count of incidents where `close_code` IN ('FALSE\_POSITIVE', 'BENIGN') divided by Total Incidents per Rule.

-----

## 7\. Implementation Plan & Milestones

1.  **Setup & Ingestion (Week 1):**
      * Init Node.js & Postgres.
      * Implement GraphQL Client.
      * Build the "Syncer" logic.
      * Verify data is flowing into DB.
2.  **API & Core Metrics (Week 2):**
      * Build REST endpoints.
      * Write SQL queries for MTTA, MTTR, and Triage Gap.
3.  **Frontend Skeleton (Week 2-3):**
      * Setup React + MUI.
      * Build Data Explorer (Grid View).
4.  **Dashboard & Polish (Week 4):**
      * Implement Recharts visualizations.
      * Add "Burnout" logic.
      * Add PDF Export.

## 8\. Configuration (.env)

The application will require the following local configuration:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/rq_analytics"

# ReliaQuest Credentials
RQ_API_URL="[https://greymatter.myreliaquest.com/graphql](https://greymatter.myreliaquest.com/graphql)"
RQ_API_KEY="your-api-key-here"

# App Config
SYNC_INTERVAL_MINUTES=15
PORT=3000
```

