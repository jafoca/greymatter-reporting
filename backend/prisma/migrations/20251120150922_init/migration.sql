-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "escalated_at" DATETIME,
    "acknowledged_at" DATETIME,
    "closed_at" DATETIME,
    "rule_name" TEXT,
    "close_code" TEXT,
    "assignee_name" TEXT,
    "raw_data" JSONB NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IncidentActivity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "incident_id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "timestamp" DATETIME NOT NULL,
    CONSTRAINT "IncidentActivity_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "Incident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
