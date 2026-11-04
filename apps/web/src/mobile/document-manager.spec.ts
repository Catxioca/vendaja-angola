import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DocumentManager, UnifiedDocument } from "./document-manager.js";

// Mock localStorage for node test runner
const storage = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  };
}

describe("DocumentManager (Fase 5 - Mobile ERP)", () => {
  let docManager: DocumentManager;

  beforeEach(() => {
    storage.clear();
    docManager = DocumentManager.getInstance();
  });

  it("1. Consulta e filtra documentos por tenant com isolamento rigoroso", async () => {
    const mockDocs: UnifiedDocument[] = [
      {
        id: "doc-1",
        companyId: "empresa-1",
        branchId: "sede",
        type: "INVOICE",
        fiscalTypeBadge: "FT",
        number: "FT A/2026/001",
        series: "A",
        subtotalCents: 100000,
        taxCents: 14000,
        totalCents: 114000,
        createdAt: "2026-10-29T10:00:00Z",
        status: "CONFIRMED",
        copyType: "ORIGINAL",
        customerName: "Empresa Alpha Lda",
        customerNif: "5412345678",
        fiscalHash: "abcd1234efgh5678",
        lines: [],
      },
      {
        id: "doc-2",
        companyId: "empresa-2", // Tenant diferente!
        branchId: "sede",
        type: "INVOICE_RECEIPT",
        fiscalTypeBadge: "FR",
        number: "FR A/2026/002",
        series: "A",
        subtotalCents: 50000,
        taxCents: 7000,
        totalCents: 57000,
        createdAt: "2026-10-29T11:00:00Z",
        status: "CONFIRMED",
        copyType: "ORIGINAL",
        customerName: "Cliente Beta",
        customerNif: "5499999999",
        fiscalHash: "wxyz9876vuts5432",
        lines: [],
      },
    ];

    // Guarda na storage isolada para empresa-1
    localStorage.setItem("vendaja_mobile_docs_empresa-1_sede", JSON.stringify([mockDocs[0]]));
    localStorage.setItem("vendaja_mobile_docs_empresa-2_sede", JSON.stringify([mockDocs[1]]));

    const docsEmpresa1 = docManager.loadCachedDocuments("empresa-1", "sede");
    assert.equal(docsEmpresa1.length, 1);
    assert.equal(docsEmpresa1[0]!.id, "doc-1");
    assert.equal(docsEmpresa1[0]!.companyId, "empresa-1");

    const docsEmpresa2 = docManager.loadCachedDocuments("empresa-2", "sede");
    assert.equal(docsEmpresa2.length, 1);
    assert.equal(docsEmpresa2[0]!.id, "doc-2");
    assert.equal(docsEmpresa2[0]!.companyId, "empresa-2");

    // Pesquisa e filtro por tipo
    const filtered = docManager.filterDocuments(docsEmpresa1, "Alpha", "FT");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.number, "FT A/2026/001");
  });

  it("2. Reimpressão com permissão e justificação válida emite 2.ª via", async () => {
    // Mock do fetch para o endpoint de reimpressão
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      if (url.includes("/api/v1/platform/reprints")) {
        const body = JSON.parse(opts.body);
        assert.equal(body.reason, "Falha na impressão do rolo térmico");
        assert.equal(body.documentId, "doc-1");
        return {
          ok: true,
          json: async () => ({
            id: "reprint-log-1",
            createdAt: "2026-10-29T12:00:00Z",
            ...body,
          }),
        };
      }
      return originalFetch(url, opts);
    };

    try {
      const result = await docManager.requestReprint(
        "http://localhost:4000",
        "mock-token",
        "empresa-1",
        "sede",
        {
          documentId: "doc-1",
          documentType: "SALE",
          reason: "Falha na impressão do rolo térmico",
        },
        "ADMIN" // Papel autorizado
      );

      assert.equal(result.success, true);
      assert.equal(result.disclaimer, "2.ª via emitida em conformidade com o original");
      assert.equal(result.reprintCount, 1);
      assert.equal(result.logId, "reprint-log-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. Bloqueia reimpressão sem permissão ou sem justificação válida", async () => {
    // 3.1 Sem permissão (OPERATOR não pode autorizar 2ª via)
    await assert.rejects(
      async () => {
        await docManager.requestReprint(
          "http://localhost:4000",
          "mock-token",
          "empresa-1",
          "sede",
          {
            documentId: "doc-1",
            documentType: "SALE",
            reason: "Cliente solicitou cópia",
          },
          "OPERATOR"
        );
      },
      /reprint_permission_denied/
    );

    // 3.2 Sem justificação válida (vazia ou menor que 3 carateres)
    await assert.rejects(
      async () => {
        await docManager.requestReprint(
          "http://localhost:4000",
          "mock-token",
          "empresa-1",
          "sede",
          {
            documentId: "doc-1",
            documentType: "SALE",
            reason: "  ",
          },
          "ADMIN"
        );
      },
      /reprint_reason_required/
    );
  });

  it("4. Guarda de imutabilidade bloqueia qualquer tentativa de edição em documento emitido", () => {
    const doc: UnifiedDocument = {
      id: "doc-1",
      companyId: "empresa-1",
      type: "INVOICE",
      fiscalTypeBadge: "FT",
      number: "FT A/2026/001",
      series: "A",
      subtotalCents: 100000,
      taxCents: 14000,
      totalCents: 114000,
      createdAt: "2026-10-29T10:00:00Z",
      status: "CONFIRMED",
      copyType: "ORIGINAL",
      fiscalHash: "hash-original",
      lines: [],
    };

    // Tentativa de alterar total
    assert.throws(() => {
      docManager.assertDocumentImmutability(doc, { totalCents: 90000 });
    }, /fiscal_immutability_violation/);

    // Tentativa de alterar número
    assert.throws(() => {
      docManager.assertDocumentImmutability(doc, { number: "FT A/2026/999" });
    }, /fiscal_immutability_violation/);

    // Tentativa de alterar hash fiscal
    assert.throws(() => {
      docManager.assertDocumentImmutability(doc, { fiscalHash: "hash-alterado" });
    }, /fiscal_immutability_violation/);

    // Tentativa de alterar data fiscal
    assert.throws(() => {
      docManager.assertDocumentImmutability(doc, { createdAt: "2026-10-30T00:00:00Z" });
    }, /fiscal_immutability_violation/);
  });
});
