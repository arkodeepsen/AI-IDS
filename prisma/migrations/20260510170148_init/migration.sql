-- CreateTable
CREATE TABLE "NetworkPacket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceIP" TEXT NOT NULL,
    "destIP" TEXT NOT NULL,
    "sourcePort" INTEGER NOT NULL,
    "destPort" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "packetSize" INTEGER NOT NULL,
    "flags" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DetectionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAnomaly" BOOLEAN NOT NULL,
    "threatLevel" TEXT NOT NULL,
    "attackType" TEXT,
    "confidence" REAL NOT NULL,
    "detectionMethod" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL DEFAULT '[]',
    "modelScores" TEXT NOT NULL DEFAULT '{}',
    "autoResponse" TEXT,
    "packetId" TEXT NOT NULL,
    "humanLabel" TEXT,
    "humanLabelType" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectionResult_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "NetworkPacket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sourceIP" TEXT NOT NULL,
    "destIP" TEXT NOT NULL,
    "attackType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "handledBy" TEXT,
    "handledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BlockedIP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ipAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attackType" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "blockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "autoBlocked" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ModelMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "method" TEXT NOT NULL,
    "accuracy" REAL NOT NULL,
    "precision" REAL NOT NULL,
    "recall" REAL NOT NULL,
    "f1Score" REAL NOT NULL,
    "falsePositiveRate" REAL NOT NULL,
    "detectionTime" REAL NOT NULL,
    "trainingSamples" INTEGER,
    "testingSamples" INTEGER,
    "datasetUsed" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPacketsAnalyzed" INTEGER NOT NULL,
    "anomaliesDetected" INTEGER NOT NULL,
    "falsePositives" INTEGER NOT NULL,
    "truePositives" INTEGER NOT NULL,
    "packetsPerSecond" REAL NOT NULL,
    "cpuUsage" REAL NOT NULL,
    "memoryUsage" REAL NOT NULL,
    "uptime" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "performedBy" TEXT,
    "ipAddress" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "NetworkPacket_sourceIP_idx" ON "NetworkPacket"("sourceIP");

-- CreateIndex
CREATE INDEX "NetworkPacket_destIP_idx" ON "NetworkPacket"("destIP");

-- CreateIndex
CREATE INDEX "NetworkPacket_timestamp_idx" ON "NetworkPacket"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "DetectionResult_packetId_key" ON "DetectionResult"("packetId");

-- CreateIndex
CREATE INDEX "DetectionResult_isAnomaly_idx" ON "DetectionResult"("isAnomaly");

-- CreateIndex
CREATE INDEX "DetectionResult_threatLevel_idx" ON "DetectionResult"("threatLevel");

-- CreateIndex
CREATE INDEX "DetectionResult_timestamp_idx" ON "DetectionResult"("timestamp");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");

-- CreateIndex
CREATE INDEX "Alert_timestamp_idx" ON "Alert"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedIP_ipAddress_key" ON "BlockedIP"("ipAddress");

-- CreateIndex
CREATE INDEX "BlockedIP_blockedAt_idx" ON "BlockedIP"("blockedAt");

-- CreateIndex
CREATE INDEX "ModelMetrics_method_idx" ON "ModelMetrics"("method");

-- CreateIndex
CREATE INDEX "ModelMetrics_recordedAt_idx" ON "ModelMetrics"("recordedAt");

-- CreateIndex
CREATE INDEX "SystemStats_timestamp_idx" ON "SystemStats"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
