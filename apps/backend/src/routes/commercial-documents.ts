import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { applyStockChange } from "../services/stock-ledger.js";

export const commercialDocumentRouter = Router();
commercialDocumentRouter.use(requireAuth, requireModuleAccess("STOCK"));

const lineInput = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative().default(0),
  taxRate: z.number().min(0).max(1).default(0),
  lotNumber: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  expiresAt: z.coerce.date().optional(),
});
const documentInput = z.object({
  type: z.enum(["QUOTE", "CUSTOMER_ORDER", "DELIVERY_NOTE", "CUSTOMER_RETURN", "SUPPLIER_RETURN", "CREDIT_NOTE", "DEBIT_NOTE"]),
  series: z.string().trim().min(1).max(20).default("A"),
  number: z.string().trim().min(1).max(80).optional(),
  seriesId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  lines: z.array(lineInput).min(1),
}).superRefine((value, context) => {
  if ((value.type === "DELIVERY_NOTE" || value.type === "CUSTOMER_RETURN" || value.type === "SUPPLIER_RETURN") && !value.locationId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["locationId"], message: "location_required_for_return" });
  }
  if (value.type === "SUPPLIER_RETURN" && !value.supplierId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["supplierId"], message: "supplier_required_for_return" });
  }
});

commercialDocumentRouter.get("/", async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  res.json(await prisma.commercialDocument.findMany({ where: type ? { type } : undefined, include: { lines: { include: { product: true } }, customer: true, supplier: true, location: true }, orderBy: { createdAt: "desc" }, take: 200 }));
});

commercialDocumentRouter.post("/series", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ companyKey: z.string().trim().min(1).max(80), establishmentKey: z.string().trim().min(1).max(80), documentType: z.string().trim().min(1).max(40), prefix: z.string().trim().min(1).max(20), nextNumber: z.number().int().positive().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_document_series" }); return; }
  try { const series = await prisma.documentSeries.create({ data: parsed.data }); await audit("DOCUMENT_SERIES_CREATED", (req as AuthRequest).user?.id, "DOCUMENT_SERIES", series.id); res.status(201).json(series); }
  catch { res.status(409).json({ error: "document_series_exists" }); }
});
commercialDocumentRouter.get("/series", async (_req, res) => res.json(await prisma.documentSeries.findMany({ where: { active: true }, orderBy: [{ documentType: "asc" }, { prefix: "asc" }] })));

commercialDocumentRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = documentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_commercial_document", details: parsed.error.flatten() }); return; }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: parsed.data.lines.map((line) => line.productId) }, active: true } });
      const byId = new Map(products.map((product) => [product.id, product]));
      const lines = parsed.data.lines.map((line) => {
        if (!byId.has(line.productId)) throw new Error("product_not_found");
        const net = line.quantity * line.unitPriceCents - line.discountCents;
        if (net < 0) throw new Error("line_discount_exceeds_value");
        return { ...line, totalCents: net + Math.round(net * line.taxRate) };
      });
      const subtotalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
      const discountCents = lines.reduce((sum, line) => sum + line.discountCents, 0);
      const taxCents = lines.reduce((sum, line) => sum + Math.round((line.quantity * line.unitPriceCents - line.discountCents) * line.taxRate), 0);
      let seriesId = parsed.data.seriesId ?? null;
      let series = parsed.data.series;
      let number = parsed.data.number;
      if (seriesId) {
        const configuredSeries = await tx.documentSeries.findUnique({ where: { id: seriesId } });
        if (!configuredSeries || !configuredSeries.active || configuredSeries.documentType !== parsed.data.type) throw new Error("invalid_document_series");
        const allocated = await tx.documentSeries.update({ where: { id: seriesId }, data: { nextNumber: { increment: 1 } } });
        series = allocated.prefix;
        number = `${allocated.prefix}${String(allocated.nextNumber).padStart(6, "0")}`;
      }
      if (!number) throw new Error("document_number_required");
      const document = await tx.commercialDocument.create({
        data: {
          type: parsed.data.type,
          series,
          number,
          seriesId,
          customerId: parsed.data.customerId ?? null,
          supplierId: parsed.data.supplierId ?? null,
          sourceId: parsed.data.sourceId ?? null,
          locationId: parsed.data.locationId ?? null,
          subtotalCents,
          discountCents,
          taxCents,
          totalCents: subtotalCents - discountCents + taxCents,
          lines: { create: lines },
        },
        include: { lines: true },
      });
      if (parsed.data.type === "DELIVERY_NOTE" || parsed.data.type === "CUSTOMER_RETURN" || parsed.data.type === "SUPPLIER_RETURN") {
        const quantitySign = parsed.data.type === "CUSTOMER_RETURN" ? 1 : -1;
        for (const line of parsed.data.lines) {
          await applyStockChange(tx, {
            productId: line.productId,
            locationId: parsed.data.locationId!,
            quantity: quantitySign * line.quantity,
            type: parsed.data.type,
            reference: `COMMERCIAL_DOCUMENT:${document.id}`,
            operatorId: (req as AuthRequest).user?.id,
            supplierId: parsed.data.supplierId ?? undefined,
            lotNumber: line.lotNumber,
            serialNumber: line.serialNumber,
            expiresAt: line.expiresAt,
          });
        }
      }
      return document;
    });
    await audit("COMMERCIAL_DOCUMENT_CREATED", (req as AuthRequest).user?.id, "COMMERCIAL_DOCUMENT", result.id, { type: result.type });
    res.status(201).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "commercial_document_failed";
    res.status(code === "product_not_found" || code === "insufficient_stock" ? 409 : 400).json({ error: code });
  }
});
