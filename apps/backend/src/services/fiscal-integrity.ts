const protectedSaleFields = new Set([
  "number",
  "fiscalType",
  "series",
  "subtotalCents",
  "taxCents",
  "totalCents",
  "currency",
  "fiscalHash",
  "fiscalSignature",
  "signatureAlgorithm",
  "qrCode",
  "customerNif",
  "customerId",
]);

const protectedSaleLineFields = new Set(["productId", "quantity", "unitPriceCents", "taxRate"]);
const allowedSaleOperationalFields = new Set(["status", "cancelledAt", "cancelledBy"]);

const protectedCommercialDocFields = new Set([
  "number",
  "series",
  "type",
  "subtotalCents",
  "taxCents",
  "totalCents",
  "discountCents",
  "fiscalHash",
  "fiscalSignature",
  "customerId",
  "supplierId",
  "locationId",
]);

const allowedCommercialDocOperationalFields = new Set(["status", "cancellationReason", "updatedAt"]);

function changedFields(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data as Record<string, unknown>);
}

export function assertImmutableFiscalMutation(model: string | undefined, action: string, data: unknown, where?: unknown) {
  if (model === "Sale") {
    if (action === "delete" || action === "deleteMany") throw new Error("immutable_fiscal_sale");
    if (action === "update" || action === "updateMany") {
      const record = (data as Record<string, unknown>) || {};
      if (record.status === "CANCELLED" || record.cancelledAt !== undefined) {
        throw new Error("immutable_fiscal_cancellation_prohibited: cannot cancel issued fiscal document directly; cancellation requires credit note (NC)");
      }
      const fields = changedFields(data);
      const invalid = fields.filter((field) => protectedSaleFields.has(field) || field === "status" || !allowedSaleOperationalFields.has(field));
      if (invalid.length > 0) throw new Error(`immutable_fiscal_sale_fields:${invalid.join(",")}`);
    }
    if (action === "upsert") {
      const update = ((data as { update?: Record<string, unknown> } | undefined)?.update) || {};
      if (update.status === "CANCELLED" || update.cancelledAt !== undefined) {
        throw new Error("immutable_fiscal_cancellation_prohibited: cannot cancel issued fiscal document directly; cancellation requires credit note (NC)");
      }
      const fields = changedFields(update);
      const invalid = fields.filter((field) => protectedSaleFields.has(field) || field === "status" || !allowedSaleOperationalFields.has(field));
      if (invalid.length > 0) throw new Error(`immutable_fiscal_sale_fields:${invalid.join(",")}`);
    }
  }
  if (model === "SaleLine" && ["update", "updateMany", "upsert", "delete", "deleteMany"].includes(action)) {
    const update = action === "upsert" ? (data as { update?: unknown } | undefined)?.update : data;
    const fields = changedFields(update);
    const invalid = fields.filter((field) => protectedSaleLineFields.has(field) || field === "saleId" || field === "id");
    if (action.startsWith("delete") || fields.length > 0) throw new Error(action.startsWith("delete") ? "immutable_fiscal_sale_line" : `immutable_fiscal_sale_line_fields:${invalid.length > 0 ? invalid.join(",") : fields.join(",")}`);
  }
  if (model === "CommercialDocument") {
    if (action === "delete" || action === "deleteMany") throw new Error("immutable_fiscal_commercial_document");
    if (action === "update" || action === "updateMany") {
      const record = (data as Record<string, unknown>) || {};
      if (record.status === "CANCELLED") {
        throw new Error("immutable_fiscal_commercial_document_cancellation_prohibited: cannot cancel issued commercial document directly; cancellation requires credit note (NC)");
      }
      const fields = changedFields(data);
      const invalid = fields.filter((field) => protectedCommercialDocFields.has(field) || field === "status" || !allowedCommercialDocOperationalFields.has(field));
      if (invalid.length > 0) throw new Error(`immutable_fiscal_commercial_document_fields:${invalid.join(",")}`);
    }
    if (action === "upsert") {
      const update = ((data as { update?: Record<string, unknown> } | undefined)?.update) || {};
      if (update.status === "CANCELLED") {
        throw new Error("immutable_fiscal_commercial_document_cancellation_prohibited: cannot cancel issued commercial document directly; cancellation requires credit note (NC)");
      }
      const fields = changedFields(update);
      const invalid = fields.filter((field) => protectedCommercialDocFields.has(field) || field === "status" || !allowedCommercialDocOperationalFields.has(field));
      if (invalid.length > 0) throw new Error(`immutable_fiscal_commercial_document_fields:${invalid.join(",")}`);
    }
  }
  if (model === "CommercialDocumentLine" && ["update", "updateMany", "upsert", "delete", "deleteMany"].includes(action)) {
    if (action.startsWith("delete")) throw new Error("immutable_fiscal_commercial_document_line");
    throw new Error("immutable_fiscal_commercial_document_line_fields");
  }
  void where;
}
