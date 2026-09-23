CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockLocation_warehouseId_code_key" ON "StockLocation"("warehouseId", "code");
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockBalance_productId_locationId_key" ON "StockBalance"("productId", "locationId");
CREATE INDEX "StockBalance_locationId_quantity_idx" ON "StockBalance"("locationId", "quantity");
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "destinationLocationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "operatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockTransfer_reference_key" ON "StockTransfer"("reference");
CREATE INDEX "StockTransfer_createdAt_idx" ON "StockTransfer"("createdAt");
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StockTransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StockTransferLine_transferId_idx" ON "StockTransferLine"("transferId");
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT NOT NULL,
    "operatorId" TEXT,
    "countedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryCount_reference_key" ON "InventoryCount"("reference");
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "inventoryCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "countedQuantity" INTEGER NOT NULL,
    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryCountLine_inventoryCountId_productId_key" ON "InventoryCountLine"("inventoryCountId", "productId");
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SupplierProductPrice" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    CONSTRAINT "SupplierProductPrice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierProductPrice_supplierId_productId_validFrom_idx" ON "SupplierProductPrice"("supplierId", "productId", "validFrom");
ALTER TABLE "SupplierProductPrice" ADD CONSTRAINT "SupplierProductPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierProductPrice" ADD CONSTRAINT "SupplierProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT,
    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseReceipt_reference_key" ON "PurchaseReceipt"("reference");
CREATE INDEX "PurchaseReceipt_purchaseId_receivedAt_idx" ON "PurchaseReceipt"("purchaseId", "receivedAt");
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PurchaseReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommercialDocument" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "series" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "locationId" TEXT,
    "sourceId" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommercialDocument_type_series_number_key" ON "CommercialDocument"("type", "series", "number");
CREATE INDEX "CommercialDocument_type_createdAt_idx" ON "CommercialDocument"("type", "createdAt");
ALTER TABLE "CommercialDocument" ADD CONSTRAINT "CommercialDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialDocument" ADD CONSTRAINT "CommercialDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialDocument" ADD CONSTRAINT "CommercialDocument_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CommercialDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "totalCents" INTEGER NOT NULL,
    CONSTRAINT "CommercialDocumentLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CommercialDocumentLine" ADD CONSTRAINT "CommercialDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CommercialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialDocumentLine" ADD CONSTRAINT "CommercialDocumentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "minStock" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "maxStock" INTEGER;
ALTER TABLE "Product" ADD COLUMN "reorderQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "trackingMode" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "StockBalance" ADD COLUMN "averageCostCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockBalance" ADD COLUMN "totalCostCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommercialDocument" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "lotId" TEXT;

CREATE TABLE "StockLot" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "lotNumber" TEXT,
  "serialNumber" TEXT,
  "expiresAt" TIMESTAMP(3),
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "unitCostCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockLot_productId_locationId_lotNumber_serialNumber_key" ON "StockLot"("productId","locationId","lotNumber","serialNumber");
CREATE INDEX "StockLot_productId_expiresAt_idx" ON "StockLot"("productId","expiresAt");
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DocumentSeries" (
  "id" TEXT NOT NULL,
  "companyKey" TEXT NOT NULL,
  "establishmentKey" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSeries_companyKey_establishmentKey_documentType_prefix_key" ON "DocumentSeries"("companyKey","establishmentKey","documentType","prefix");
ALTER TABLE "CommercialDocument" ADD CONSTRAINT "CommercialDocument_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "DocumentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProcurementRequest" (
  "id" TEXT NOT NULL, "number" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProcurementRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProcurementRequest_number_key" ON "ProcurementRequest"("number");
CREATE TABLE "ProcurementRequestLine" (
  "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "productId" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  CONSTRAINT "ProcurementRequestLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProcurementRequestLine" ADD CONSTRAINT "ProcurementRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementRequestLine" ADD CONSTRAINT "ProcurementRequestLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SupplierQuotation" (
  "id" TEXT NOT NULL, "number" TEXT NOT NULL, "requestId" TEXT, "supplierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierQuotation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierQuotation_number_key" ON "SupplierQuotation"("number");
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SupplierQuotationLine" (
  "id" TEXT NOT NULL, "quotationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "unitCostCents" INTEGER NOT NULL,
  CONSTRAINT "SupplierQuotationLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SupplierQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ProcurementOrder" (
  "id" TEXT NOT NULL, "number" TEXT NOT NULL, "quotationId" TEXT, "supplierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProcurementOrder_number_key" ON "ProcurementOrder"("number");
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SupplierQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ProcurementOrderLine" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "productId" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "unitCostCents" INTEGER NOT NULL,
  CONSTRAINT "ProcurementOrderLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrderLine" ADD CONSTRAINT "ProcurementOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD COLUMN "procurementOrderId" TEXT;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
