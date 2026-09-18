ALTER TABLE "Product" ADD COLUMN "qrCode" TEXT;
CREATE UNIQUE INDEX "Product_qrCode_key" ON "Product"("qrCode");
