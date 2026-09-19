-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "originalPrice" INTEGER NOT NULL,
    "currentAmount" INTEGER NOT NULL,
    "agreedPrice" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextActorId" TEXT,
    "closeReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Offer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfferHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfferHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Offer_buyerId_updatedAt_idx" ON "Offer"("buyerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Offer_sellerId_updatedAt_idx" ON "Offer"("sellerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Offer_listingId_status_idx" ON "Offer"("listingId", "status");

-- CreateIndex
CREATE INDEX "OfferHistory_offerId_id_idx" ON "OfferHistory"("offerId", "id");

-- Prevent duplicate negotiations and competing agreements, even under concurrent requests.
CREATE UNIQUE INDEX "Offer_one_open_per_buyer"
ON "Offer"("listingId", "buyerId")
WHERE "status" IN ('PENDING', 'COUNTERED');

CREATE UNIQUE INDEX "Offer_one_agreement_per_listing"
ON "Offer"("listingId")
WHERE "status" IN ('ACCEPTED', 'COMPLETED');
