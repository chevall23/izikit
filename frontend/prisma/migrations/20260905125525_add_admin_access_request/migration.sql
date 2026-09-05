-- CreateTable
CREATE TABLE "AdminAccessRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_EMAIL',
    "emailVerifiedAt" TIMESTAMP(3),
    "verificationCode" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAccessRequest_status_idx" ON "AdminAccessRequest"("status");

-- CreateIndex
CREATE INDEX "AdminAccessRequest_email_idx" ON "AdminAccessRequest"("email");
