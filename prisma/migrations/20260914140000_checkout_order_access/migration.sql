-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "accessTokenHash" TEXT,
ADD COLUMN     "checkoutSession" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessTokenHash_key" ON "Order"("accessTokenHash");

-- CreateIndex
CREATE INDEX "Order_checkoutSession_status_idx" ON "Order"("checkoutSession", "status");
