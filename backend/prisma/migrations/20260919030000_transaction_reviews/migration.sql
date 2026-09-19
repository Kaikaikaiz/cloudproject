ALTER TABLE "User" ADD COLUMN "totalReviews" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "originalPrice" INTEGER NOT NULL,
  "finalPrice" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Transaction_purchaseId_key" ON "Transaction"("purchaseId");
CREATE UNIQUE INDEX "Transaction_listingId_key" ON "Transaction"("listingId");
CREATE INDEX "Transaction_buyerId_createdAt_idx" ON "Transaction"("buyerId", "createdAt");
CREATE INDEX "Transaction_sellerId_createdAt_idx" ON "Transaction"("sellerId", "createdAt");

CREATE TABLE "Review" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "transactionId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "reviewedUserId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("reviewerId" <> "reviewedUserId"),
  FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("reviewedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Review_transactionId_reviewerId_key" ON "Review"("transactionId", "reviewerId");
CREATE INDEX "Review_reviewedUserId_createdAt_idx" ON "Review"("reviewedUserId", "createdAt");

-- Preserve completed purchases and their original agreement prices.
INSERT INTO "Transaction" ("id", "purchaseId", "listingId", "buyerId", "sellerId", "originalPrice", "finalPrice", "createdAt")
SELECT p."id", p."id", p."listingId", p."buyerId", p."sellerId",
  COALESCE(o."originalPrice", l."price"), p."amount", p."createdAt"
FROM "Purchase" p
JOIN "Listing" l ON l."id" = p."listingId"
LEFT JOIN "Offer" o ON o."id" = p."offerId"
WHERE p."status" = 'SUCCESS';

-- Reputation is based on completed trades and reviews, never listing moderation.
UPDATE "User" SET "averageRating" = 0, "completedTransactions" = (
  SELECT COUNT(*) FROM "Transaction" t
  WHERE t."status" = 'COMPLETED' AND (t."buyerId" = "User"."id" OR t."sellerId" = "User"."id")
);
