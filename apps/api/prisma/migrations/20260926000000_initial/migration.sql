CREATE TYPE "EmailStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "googleId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Email" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "sendDelayMs" INTEGER NOT NULL DEFAULT 2000,
  "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
  "status" "EmailStatus" NOT NULL DEFAULT 'SCHEDULED',
  "processingStartedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "error" TEXT,
  "batchId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlackConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "teamName" TEXT,
  "accessToken" TEXT NOT NULL,
  "webhookUrl" TEXT,
  "channelId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlackConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Email_userId_idempotencyKey_key" ON "Email"("userId", "idempotencyKey");
CREATE INDEX "Email_userId_status_scheduledAt_idx" ON "Email"("userId", "status", "scheduledAt");
CREATE INDEX "Email_sender_scheduledAt_idx" ON "Email"("sender", "scheduledAt");
CREATE INDEX "Email_batchId_idx" ON "Email"("batchId");
CREATE UNIQUE INDEX "SlackConnection_userId_key" ON "SlackConnection"("userId");

ALTER TABLE "Email" ADD CONSTRAINT "Email_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlackConnection" ADD CONSTRAINT "SlackConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;