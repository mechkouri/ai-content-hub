-- CreateTable
CREATE TABLE "ContentImage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentImage_contentId_position_idx" ON "ContentImage"("contentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ContentImage_contentId_assetId_key" ON "ContentImage"("contentId", "assetId");

-- AddForeignKey
ALTER TABLE "ContentImage" ADD CONSTRAINT "ContentImage_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentImage" ADD CONSTRAINT "ContentImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
