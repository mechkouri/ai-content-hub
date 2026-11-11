-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'APPROVED', 'CHANGES_REQUESTED', 'INVALIDATED');

-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "submittedById" UUID;

-- CreateTable
CREATE TABLE "ContentReview" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentReview_contentId_createdAt_idx" ON "ContentReview"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentPiece_organizationId_approvalStatus_idx" ON "ContentPiece"("organizationId", "approvalStatus");

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
