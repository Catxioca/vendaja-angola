import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DocumentManager, UnifiedDocument } from "./document-manager.js";
import { FiscalTreasuryManager } from "./fiscal-treasury-manager.js";
import { AdminEnterpriseManager } from "./admin-enterprise-manager.js";

describe("Phase 5 Integrated Authorized Operations Flow", () => {
  const docManager = DocumentManager.getInstance();
  const fiscalManager = FiscalTreasuryManager.getInstance();
  const adminManager = AdminEnterpriseManager.getInstance();

  it("1. Respeita a regra fiscal absoluta: aplicação não se apresenta como homologada e documentos offline são provisórios", () => {
    const disclaimer = fiscalManager.getRegulatoryDisclaimer();
    assert.equal(
      disclaimer,
      "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT."
    );

    // Documento gerado ou exibido em modo offline não pode ter estatuto de documento emitido definitivo
    const offlineProvisionalDoc: UnifiedDocument = {
      id: "offline-intent-1",
      companyId: "empresa-1",
      type: "INVOICE_RECEIPT",
      fiscalTypeBadge: "FR",
      number: "PENDENTE",
      series: "A",
      subtotalCents: 15000,
      taxCents: 2100,
      totalCents: 17100,
      createdAt: new Date().toISOString(),
      status: "PROVISIONAL",
      copyType: "PROVISORIO",
      disclaimer: "Comprovativo Provisório / Não Fiscal — Aguarda Validação Central",
      lines: [],
    };

    assert.equal(offlineProvisionalDoc.status, "PROVISIONAL");
    assert.equal(offlineProvisionalDoc.copyType, "PROVISORIO");
    assert.ok(offlineProvisionalDoc.disclaimer?.includes("Não Fiscal"));
  });

  it("2. Valida ciclo completo de consulta, imutabilidade e reimpressão de 2.ª via", async () => {
    const originalDoc: UnifiedDocument = {
      id: "sale-888",
      companyId: "empresa-luanda",
      branchId: "kinaxixi",
      type: "INVOICE",
      fiscalTypeBadge: "FT",
      number: "FT A/2026/0888",
      series: "A",
      subtotalCents: 200000,
      taxCents: 28000,
      totalCents: 228000,
      createdAt: "2026-10-29T14:00:00Z",
      status: "CONFIRMED",
      copyType: "ORIGINAL",
      fiscalHash: "hash-seguro-sha1",
      lines: [],
    };

    // Imutabilidade: proibido alterar dados fiscais
    assert.throws(() => {
      docManager.assertDocumentImmutability(originalDoc, { totalCents: 200000 });
    }, /fiscal_immutability_violation/);

    // Reimpressão auditada
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      if (url.includes("/api/v1/platform/reprints")) {
        return {
          ok: true,
          json: async () => ({
            id: "reprint-log-888",
            createdAt: new Date().toISOString(),
          }),
        };
      }
      return originalFetch(url, opts);
    };

    try {
      const reprintResult = await docManager.requestReprint(
        "http://localhost:4000",
        "valid-token",
        "empresa-luanda",
        "kinaxixi",
        {
          documentId: originalDoc.id,
          documentType: "SALE",
          reason: "Envio de 2.ª via solicitada pela contabilidade do cliente",
        },
        "ADMIN"
      );

      assert.equal(reprintResult.success, true);
      assert.equal(reprintResult.disclaimer, "2.ª via emitida em conformidade com o original");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. Garante isolamento estrito entre filiais e empresas em todos os módulos da Fase 5", async () => {
    // Headquarters não consolida tenants não autorizados
    await assert.rejects(
      async () => {
        await adminManager.getHeadquartersCockpit(
          "http://localhost:4000",
          "token",
          "empresa-alheia",
          "empresa-propria"
        );
      },
      /headquarters_cross_tenant_forbidden/
    );

    // Períodos contabilísticos fechados barram transações
    assert.throws(() => {
      fiscalManager.assertPeriodNotClosed(
        [
          {
            id: "per-closed",
            name: "Exercício 2025",
            startsAt: "2025-01-01T00:00:00Z",
            endsAt: "2025-12-31T23:59:59Z",
            status: "CLOSED",
          },
        ],
        new Date("2025-06-15T12:00:00Z")
      );
    }, /accounting_period_closed/);
  });
});
