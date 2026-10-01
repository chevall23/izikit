-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "legacyId" TEXT;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "legacyId" TEXT;

-- AlterTable
ALTER TABLE "ListingPhoto" ADD COLUMN     "legacyId" TEXT;

-- AlterTable
ALTER TABLE "PropertyRequest" ADD COLUMN     "legacyId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legacyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Alert_legacyId_key" ON "Alert"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_legacyId_key" ON "Listing"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingPhoto_legacyId_key" ON "ListingPhoto"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyRequest_legacyId_key" ON "PropertyRequest"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyId_key" ON "User"("legacyId");

