-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('TEST', 'WORDPRESS', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Channel" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'CONNECTED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastError" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishJob" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'QUEUED',
    "runAt" TIMESTAMP(3) NOT NULL,
    "followsSchedule" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Channel_organizationId_status_idx" ON "Channel"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PublishJob_status_runAt_idx" ON "PublishJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "PublishJob_organizationId_createdAt_idx" ON "PublishJob"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublishJob_contentId_channelId_key" ON "PublishJob"("contentId", "channelId");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
