-- AlterTable
ALTER TABLE "TokenTransaction" ADD COLUMN "grantKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransaction_grantKey_key" ON "TokenTransaction"("grantKey");
