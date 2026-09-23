-- Backfill migration: these two tables (AgentContactUnlock, PaymentMethodPreference)
-- were added to schema.prisma and pushed to the dev DB via `prisma db push` at some
-- point without a corresponding migration file ever being committed, so `prisma migrate
-- status` reported "up to date" while the actual schema had drifted. This migration
-- file backfills the missing history; it is a no-op on any DB that already has these
-- tables (local dev — apply via `prisma migrate resolve --applied`) and creates them
-- on any DB that doesn't (production, at the time this was discovered).

-- CreateTable
CREATE TABLE "AgentContactUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentContactUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentContactUnlock_agentId_idx" ON "AgentContactUnlock"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentContactUnlock_userId_agentId_key" ON "AgentContactUnlock"("userId", "agentId");

-- CreateIndex
CREATE INDEX "PaymentMethodPreference_userId_idx" ON "PaymentMethodPreference"("userId");

-- AddForeignKey
ALTER TABLE "AgentContactUnlock" ADD CONSTRAINT "AgentContactUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentContactUnlock" ADD CONSTRAINT "AgentContactUnlock_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodPreference" ADD CONSTRAINT "PaymentMethodPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
