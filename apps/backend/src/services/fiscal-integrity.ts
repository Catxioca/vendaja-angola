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

function changedFields(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data as Record<string, unknown>);
}

export function assertImmutableFiscalMutation(model: string | undefined, action: string, data: unknown, where?: unknown) {
  if (model === "Sale") {
    if (action === "delete" || action === "deleteMany") throw new Error("immutable_fiscal_sale");
    if (action === "update" || action === "updateMany") {
      const fields = changedFields(data);
      const invalid = fields.filter((field) => protectedSaleFields.has(field) || !allowedSaleOperationalFields.has(field));
      if (invalid.length > 0) throw new Error(`immutable_fiscal_sale_fields:${invalid.join(",")}`);
    }
    if (action === "upsert") {
      const fields = changedFields((data as { update?: unknown } | undefined)?.update);
      const invalid = fields.filter((field) => protectedSaleFields.has(field) || !allowedSaleOperationalFields.has(field));
      if (invalid.length > 0) throw new Error(`immutable_fiscal_sale_fields:${invalid.join(",")}`);
    }
  }
  if (model === "SaleLine" && ["update", "updateMany", "upsert", "delete", "deleteMany"].includes(action)) {
    const update = action === "upsert" ? (data as { update?: unknown } | undefined)?.update : data;
    const fields = changedFields(update);
    const invalid = fields.filter((field) => protectedSaleLineFields.has(field) || field === "saleId" || field === "id");
    if (action.startsWith("delete") || fields.length > 0) throw new Error(action.startsWith("delete") ? "immutable_fiscal_sale_line" : `immutable_fiscal_sale_line_fields:${invalid.length > 0 ? invalid.join(",") : fields.join(",")}`);
  }
  void where;
}
