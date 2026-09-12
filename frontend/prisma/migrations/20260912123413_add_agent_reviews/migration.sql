-- CreateTable
CREATE TABLE "AgentReview" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentReview_agentId_idx" ON "AgentReview"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentReview_agentId_authorId_key" ON "AgentReview"("agentId", "authorId");

-- AddForeignKey
ALTER TABLE "AgentReview" ADD CONSTRAINT "AgentReview_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReview" ADD CONSTRAINT "AgentReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
