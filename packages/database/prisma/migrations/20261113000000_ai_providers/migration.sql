-- CreateEnum
CREATE TYPE "AiKind" AS ENUM ('TEXT', 'IMAGE');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" "AiKind" NOT NULL,
    "status" "AiStatus" NOT NULL,
    "errorKind" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSetting" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "textModel" TEXT,
    "dailyTextLimit" INTEGER,
    "monthlyTextLimit" INTEGER,
    "dailyImageLimit" INTEGER,
    "monthlyImageLimit" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_kind_createdAt_idx" ON "AiUsage"("organizationId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSetting_organizationId_key" ON "AiSetting"("organizationId");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSetting" ADD CONSTRAINT "AiSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

