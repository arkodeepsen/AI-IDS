-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DetectionResult" (
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
    "ipEntropy" TEXT NOT NULL DEFAULT '{}',
    "autoResponse" TEXT,
    "packetId" TEXT NOT NULL,
    "humanLabel" TEXT,
    "humanLabelType" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectionResult_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "NetworkPacket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DetectionResult" ("attackType", "autoResponse", "confidence", "createdAt", "description", "detectionMethod", "humanLabel", "humanLabelType", "id", "isAnomaly", "modelScores", "packetId", "recommendations", "reviewedAt", "threatLevel", "timestamp") SELECT "attackType", "autoResponse", "confidence", "createdAt", "description", "detectionMethod", "humanLabel", "humanLabelType", "id", "isAnomaly", "modelScores", "packetId", "recommendations", "reviewedAt", "threatLevel", "timestamp" FROM "DetectionResult";
DROP TABLE "DetectionResult";
ALTER TABLE "new_DetectionResult" RENAME TO "DetectionResult";
CREATE UNIQUE INDEX "DetectionResult_packetId_key" ON "DetectionResult"("packetId");
CREATE INDEX "DetectionResult_isAnomaly_idx" ON "DetectionResult"("isAnomaly");
CREATE INDEX "DetectionResult_threatLevel_idx" ON "DetectionResult"("threatLevel");
CREATE INDEX "DetectionResult_timestamp_idx" ON "DetectionResult"("timestamp");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
