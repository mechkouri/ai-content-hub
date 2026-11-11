-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('TEXT', 'PDF', 'DOCX', 'URL');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('TEXT_READY', 'EXTRACTED', 'FAILED');

-- CreateTable
CREATE TABLE "Source" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "SourceType" NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'TEXT_READY',
    "title" TEXT NOT NULL,
    "language" TEXT,
    "classification" TEXT,
    "summary" TEXT,
    "originalText" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT,
    "extractionError" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFact" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "quote" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Source_organizationId_createdAt_idx" ON "Source"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceFact_sourceId_idx" ON "SourceFact"("sourceId");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFact" ADD CONSTRAINT "SourceFact_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

