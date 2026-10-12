-- AlterTable: fiabilité des demandes immobilières (voir lib/server/requests/trust.ts).
-- Les lignes existantes restent TRUSTED (score 100) : aucune demande déjà
-- enregistrée n'est masquée aux agents par cette migration.
ALTER TABLE "PropertyRequest"
  ADD COLUMN "trustStatus" TEXT NOT NULL DEFAULT 'TRUSTED',
  ADD COLUMN "trustScore" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "trustFlags" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "clientPhoneKey" TEXT;

-- 8 derniers chiffres du téléphone, pour détecter doublons et envois en rafale.
UPDATE "PropertyRequest"
SET "clientPhoneKey" = right(regexp_replace("clientPhone", '\D', '', 'g'), 8)
WHERE length(regexp_replace("clientPhone", '\D', '', 'g')) >= 8;

-- CreateIndex
CREATE INDEX "PropertyRequest_trustStatus_idx" ON "PropertyRequest"("trustStatus");
CREATE INDEX "PropertyRequest_clientPhoneKey_createdAt_idx" ON "PropertyRequest"("clientPhoneKey", "createdAt");
