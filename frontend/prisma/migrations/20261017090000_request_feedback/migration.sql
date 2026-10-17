-- AlterTable
ALTER TABLE "AgentReview" ADD COLUMN     "authorLabel" TEXT,
ADD COLUMN     "requestFeedbackId" TEXT,
ALTER COLUMN "authorId" DROP NOT NULL,
ALTER COLUMN "comment" SET DEFAULT '';

-- CreateTable
CREATE TABLE "RequestFeedback" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "contacted" BOOLEAN,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequestFeedback_requestId_key" ON "RequestFeedback"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestFeedback_token_key" ON "RequestFeedback"("token");

-- CreateIndex
CREATE INDEX "RequestFeedback_submittedAt_lastSentAt_idx" ON "RequestFeedback"("submittedAt", "lastSentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentReview_agentId_requestFeedbackId_key" ON "AgentReview"("agentId", "requestFeedbackId");

-- AddForeignKey
ALTER TABLE "AgentReview" ADD CONSTRAINT "AgentReview_requestFeedbackId_fkey" FOREIGN KEY ("requestFeedbackId") REFERENCES "RequestFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestFeedback" ADD CONSTRAINT "RequestFeedback_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PropertyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

