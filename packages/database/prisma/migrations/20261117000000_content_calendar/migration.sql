-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "scheduledById" UUID;

-- CreateIndex
CREATE INDEX "ContentPiece_organizationId_scheduledFor_idx" ON "ContentPiece"("organizationId", "scheduledFor");
