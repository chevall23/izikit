-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "boostedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "boostCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Boost" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "tokensSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Boost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Boost_listingId_endsAt_idx" ON "Boost"("listingId", "endsAt");

-- CreateIndex
CREATE INDEX "Boost_userId_createdAt_idx" ON "Boost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_boostedUntil_idx" ON "Listing"("status", "boostedUntil");

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
