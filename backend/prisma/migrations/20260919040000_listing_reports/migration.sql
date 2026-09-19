ALTER TABLE "Listing" ADD COLUMN "moderationReason" TEXT;
ALTER TABLE "Listing" ADD COLUMN "moderationPreviousStatus" TEXT;

CREATE TABLE "Report" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "listingId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "adminReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "Report_listingId_idx" ON "Report"("listingId");
CREATE UNIQUE INDEX "Report_one_active_per_user_listing"
ON "Report"("reporterId", "listingId")
WHERE "status" IN ('PENDING', 'REVIEWING');
