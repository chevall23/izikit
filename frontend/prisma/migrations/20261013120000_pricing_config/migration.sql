-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);
