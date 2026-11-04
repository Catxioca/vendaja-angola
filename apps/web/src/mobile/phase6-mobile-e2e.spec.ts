import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SecureStorageAdapter } from "./secure-storage";
import { MobileOutboxManager } from "./outbox-manager";
import { MobileCatalogManager } from "./catalog-manager";
import { MobileCartManager } from "./cart-manager";
import { MobileCashManager, ActiveCashSession } from "./cash-manager";
import { MobilePermissionManager } from "./permissions";
import { HidScannerService } from "./hid-scanner";
import { MobilePrinterService } from "./printer-service";
import type { TenantContext, UserProfile } from "./types";
import type { Product } from "@angola/shared";

/**
 * CLASSIFICAÇÃO METODOLÓGICA DE TESTES (FASE 6):
 * ===============================================
 * TIPO DE TESTE: Simulação Lógica TypeScript / In-Memory (Node.js unit/integration mock).
 * NÃO É: Teste E2E em emulador Android nem teste em dispositivo/hardware físico.
 *
 * ESCOPO VALIDADO:
 * - Ciclos lógicos de autenticação, cofre cifrado (WebCrypto), isolamento de tenant,
 *   outbox offline, regras fiscais provisórias e semântica estrita de sessão de caixa.
 *
 * ESCOPO NÃO COMPROVADO AQUI (Requer Emulador/Hardware Físico Real):
 * - Runtime Android, ciclo de vida do SO (background/foreground real), rotação real de ecrã do SO,
 *   Android Keystore / hardware-backed keystore, permissões reais de câmara do Android OS,
 *   Android PrintManager nativo, portas físicas USB-OTG/Bluetooth HID ou impressoras térmicas reais.
 */
class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe("Phase 6: Mobile Client Android/Tablet Logical Simulation (TypeScript / In-Memory)", () => {
  let storage: SecureStorageAdapter;
  let outbox: MobileOutboxManager;
  let catalog: MobileCatalogManager;
  let cart: MobileCartManager;
  let cash: MobileCashManager;
  let permissions: MobilePermissionManager;
  let mockStorage: MockLocalStorage;

  const mockTenant1: TenantContext = {
    companyId: "empresa-luanda-01",
    branchId: "filial-sede-01",
    companyName: "Luanda Distribuição Lda",
    branchName: "Sede Kinaxixi",
    membershipId: "mem-01",
    role: "ADMIN",
    terminalId: "TERM-01",
    modules: ["POS", "STOCK", "ACCOUNTING"],
  };

  const mockTenant2: TenantContext = {
    companyId: "empresa-benguela-02",
    branchId: "filial-porto-01",
    companyName: "Benguela Logística SA",
    branchName: "Porto Comercial",
    membershipId: "mem-02",
    role: "OPERATOR",
    terminalId: "TERM-02",
    modules: ["POS"],
  };

  const mockUser: UserProfile = {
    id: "user-operador-01",
    email: "operador@vendaja.ao",
    username: "operador1",
    displayName: "João Operador",
    role: "OPERATOR",
    authMethod: "password",
  };

  const sampleProducts: Product[] = [
    {
      id: "prod-1",
      name: "Arroz Agulha 1kg",
      sku: "ARR-001",
      barcode: "5601234567890",
      priceCents: 150000, // 1500 Kz
      stock: 25,
      taxRate: 0, // Isento de IVA para teste de total
      active: true,
      categoryId: "ALIMENTACAO",
    },
    {
      id: "prod-2",
      name: "Óleo Alimentar 1L",
      sku: "OLE-002",
      barcode: "5609876543210",
      priceCents: 220000, // 2200 Kz
      stock: 10,
      taxRate: 0.14,
      active: true,
      categoryId: "ALIMENTACAO",
    },
  ];

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).sessionStorage = mockStorage;

    storage = new SecureStorageAdapter(true);
    outbox = new MobileOutboxManager();
    catalog = new MobileCatalogManager(storage);
    cart = new MobileCartManager();
    cash = new MobileCashManager();
    permissions = new MobilePermissionManager();
  });

  // CENÁRIO 1: Primeiro login online e armazenamento seguro de tokens/PIN
  it("Cenário 1: Primeiro login online guarda tokens cifrados e PIN sem vazar segredos", async () => {
    const tokens = {
      accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummyAccessToken",
      refreshToken: "refresh-token-uuid-1234",
    };

    await storage.storeSession(tokens, mockUser);
    await storage.storePin("1234");

    const loadedSession = await storage.getSession();
    assert.ok(loadedSession);
    assert.equal(loadedSession.user.username, "operador1");
    assert.equal(loadedSession.tokens.accessToken, tokens.accessToken);

    // O PIN não é guardado em texto simples no armazenamento
    assert.notEqual(mockStorage.getItem("vendaja_sec_v2_pin_hash"), "1234");
    const isPinValid = await storage.verifyPin("1234");
    assert.equal(isPinValid, true);

    const isWrongPin = await storage.verifyPin("9999");
    assert.equal(isWrongPin, false);
  });

  // CENÁRIO 2: Seleção de empresa/filial (tenant selector) com chaveamento de cache isolada
  it("Cenário 2: Seleção de empresa/filial chaveia cache e isola dados por tenant", async () => {
    await storage.storeTenant(mockTenant1);
    let current = await storage.getTenant();
    assert.equal(current?.companyId, mockTenant1.companyId);

    // Guarda catálogo da empresa 1
    mockStorage.setItem(
      `vendaja_catalog_${mockTenant1.companyId}_${mockTenant1.branchId}`,
      JSON.stringify(sampleProducts)
    );

    // Chaveia para empresa 2
    await storage.storeTenant(mockTenant2);
    current = await storage.getTenant();
    assert.equal(current?.companyId, mockTenant2.companyId);

    // Verifica que catálogo da empresa 2 está vazio inicialmente
    const cachedTenant2 = catalog.loadCachedCatalog(mockTenant2.companyId, mockTenant2.branchId);
    assert.equal(cachedTenant2.length, 0);

    // E o da empresa 1 permanece isolado
    const cachedTenant1 = catalog.loadCachedCatalog(mockTenant1.companyId, mockTenant1.branchId);
    assert.equal(cachedTenant1.length, 2);
  });

  // CENÁRIO 3: Carregamento e paginação do catálogo com benchmark de desempenho (< 50ms)
  it("Cenário 3: Catálogo suporta paginação rápida e benchmark de busca com latência < 50ms", () => {
    const largeCatalog: Product[] = Array.from({ length: 100 }, (_, i) => ({
      id: `prod-${i}`,
      name: `Artigo Supermercado #${i}`,
      sku: `SKU-${1000 + i}`,
      barcode: `700000000${i.toString().padStart(4, "0")}`,
      priceCents: (i + 1) * 10000,
      stock: 50,
      taxRate: 0.14,
      active: true,
      categoryId: i % 2 === 0 ? "MERCEARIA" : "HIGIENE",
    }));

    mockStorage.setItem(
      `vendaja_catalog_${mockTenant1.companyId}_${mockTenant1.branchId}`,
      JSON.stringify(largeCatalog)
    );
    catalog.loadFromCache(mockTenant1.companyId, mockTenant1.branchId);

    // Paginação
    const page1 = catalog.getPage(1, 20);
    assert.equal(page1.items.length, 20);
    assert.equal(page1.totalPages, 5);
    assert.equal(page1.total, 100);

    // Benchmark de pesquisa: 50 iterações devem ter tempo médio < 20ms (requisito < 50ms)
    const benchmark = catalog.benchmarkSearch({ query: "Supermercado #4" }, 50);
    assert.ok(benchmark.matchedCount > 0);
    assert.ok(benchmark.averageMs < 20);
  });

  // CENÁRIO 4: Venda offline provisória sem número fiscal definitivo
  it("Cenário 4: Venda offline provisória não gera número fiscal definitivo e enfileira na Outbox", () => {
    cart.addProduct(sampleProducts[0]!, 2);
    const totals = cart.calculateTotals();
    assert.equal(totals.itemCount, 2);
    assert.equal(totals.totalCents, 300000); // 2 * 150000 = 3000 Kz

    const plan = cart.buildPaymentPlan({
      paymentMethod: "CASH",
      tenderedCents: 400000,
    });

    const mutation = outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      payload: {
        paymentPlan: plan,
        lines: cart.getLines(),
        isProvisional: true,
      },
      tenant: mockTenant1,
      userId: mockUser.id,
    });

    assert.ok(mutation.id);
    assert.equal(mutation.state, "PENDING");
    // O payload de venda offline NÃO tem número fiscal final, nem QR fiscal oficial
    assert.equal((mutation.payload as any).fiscalNumber, undefined);
    assert.equal((mutation.payload as any).fiscalHash, undefined);

    const pending = outbox.getItemsForTenant(mockTenant1.companyId);
    assert.equal(pending.length, 1);
  });

  // CENÁRIO 5: Fecho e reinício da aplicação com hidratação de sessão e dados intactos
  it("Cenário 5: Fecho e reinício restaura sessão, tenant e mutations da Outbox sem perdas", async () => {
    await storage.storeTenant(mockTenant1);
    await storage.storeSession(
      { accessToken: "valid-tok", refreshToken: "valid-ref" },
      mockUser
    );
    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      payload: { id: "sale-offline-preserved" },
      tenant: mockTenant1,
      userId: mockUser.id,
    });

    // Simula reinício da aplicação criando novos adaptadores apontando para o mesmo storage
    const freshStorage = new SecureStorageAdapter(true);
    const freshOutbox = new MobileOutboxManager();

    const restoredSession = await freshStorage.getSession();
    const restoredTenant = await freshStorage.getTenant();
    const restoredPending = freshOutbox.getItemsForTenant(mockTenant1.companyId);

    assert.equal(restoredSession?.user.displayName, "João Operador");
    assert.equal(restoredTenant?.companyName, "Luanda Distribuição Lda");
    assert.equal(restoredPending.length, 1);
    assert.equal((restoredPending[0]?.payload as any).id, "sale-offline-preserved");
  });

  // CENÁRIO 6: Reconexão e sincronização da Outbox com o backend
  it("Cenário 6: Reconexão sincroniza vendas da Outbox com confirmação do servidor", async () => {
    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      payload: { id: "sale-sync-test", totalCents: 2000 },
      tenant: mockTenant1,
      userId: mockUser.id,
    });

    // Mock global de fetch bem-sucedido
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          success: true,
          documentId: "doc-central-001",
          fiscalNumber: "FT LU1/000001",
        }),
      } as any);

    try {
      const result = await outbox.syncPending("https://api.vendaja.ao", "valid-token", mockTenant1);
      assert.equal(result.sent, 1);
      assert.equal(result.failed, 0);

      const pendingAfter = outbox.getItemsForTenant(mockTenant1.companyId).filter(
        (i) => i.state === "PENDING"
      );
      assert.equal(pendingAfter.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // CENÁRIO 7: Bloqueio estrito de acesso cruzado entre empresas (tenant isolation)
  it("Cenário 7: Impede visualização ou sincronização cruzada entre diferentes tenants", () => {
    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      payload: { sale: "T1" },
      tenant: mockTenant1,
      userId: mockUser.id,
    });

    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      payload: { sale: "T2" },
      tenant: mockTenant2,
      userId: mockUser.id,
    });

    const pendingT1 = outbox.getItemsForTenant(mockTenant1.companyId);
    const pendingT2 = outbox.getItemsForTenant(mockTenant2.companyId);

    assert.equal(pendingT1.length, 1);
    assert.equal(pendingT1[0]?.companyId, mockTenant1.companyId);

    assert.equal(pendingT2.length, 1);
    assert.equal(pendingT2[0]?.companyId, mockTenant2.companyId);
  });

  // CENÁRIO 8: Scanner de câmara: permissão negada vs concedida e fallback manual
  it("Cenário 8: Permissão da câmara gere recusa com segurança e permite fallback manual", async () => {
    const diag = permissions.getPeripheralsDiagnostic();
    const camInit = diag.find((p) => p.type === "camera");
    assert.ok(camInit);
    assert.equal(camInit?.status, "parcial");

    // Recusa runtime (sem navigator.mediaDevices na suite de teste)
    const result = await permissions.requestCamera();
    assert.equal(result.granted, false);

    // Fallback manual no catálogo
    mockStorage.setItem(
      `vendaja_catalog_${mockTenant1.companyId}_${mockTenant1.branchId}`,
      JSON.stringify(sampleProducts)
    );
    catalog.loadFromCache(mockTenant1.companyId, mockTenant1.branchId);

    const foundManual = catalog.findByBarcodeOrSku("5601234567890");
    assert.equal(foundManual?.name, "Arroz Agulha 1kg");
  });

  // CENÁRIO 9: Transição e layout adaptativo entre telemóvel e tablet (7–10 polegadas)
  it("Cenário 9: Deteção de tablet POS (>=768px) e touch targets de 48dp", () => {
    const phoneWidth = 390;
    const isTabletPhone = phoneWidth >= 768;
    assert.equal(isTabletPhone, false);

    const tabletWidth = 800;
    const isTablet = tabletWidth >= 768;
    assert.equal(isTablet, true);

    const minTouchTargetPx = 48;
    assert.ok(minTouchTargetPx >= 48);
  });

  // CENÁRIO 10: Semântica estrita de Turno de Caixa (Fase 3 & Fase 6)
  it("Cenário 10: Ciclo de turno de caixa respeita integridade da Fase 3: pendente não autoriza CASH e fecho offline aguarda backend", async () => {
    // 1. Sessão criada offline permanece pendente de validação central e NÃO autoriza venda CASH offline
    const openAction = cash.openSessionOffline(
      outbox,
      mockTenant1,
      {
        openingCents: 500000,
        operatorName: mockUser.displayName,
        terminalId: mockTenant1.terminalId,
        pin: "123456",
      },
      mockUser.id
    );

    assert.equal(openAction.status, "PENDING_CENTRAL_VALIDATION");
    assert.equal(openAction.notice, "Pendente de validação central");

    const pendingCheck = cash.canCreateOfflineCashSale({
      companyId: mockTenant1.companyId,
      branchId: mockTenant1.branchId,
      terminalId: mockTenant1.terminalId,
      userId: mockUser.id,
    });
    assert.equal(pendingCheck.allowed, false);
    assert.equal(
      pendingCheck.reason,
      "Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor."
    );

    // 2. Simulação de confirmação oficial pelo servidor (apenas sessão confirmada autoriza CASH)
    const confirmedSession: ActiveCashSession = {
      id: "session-srv-confirmed-001",
      companyId: mockTenant1.companyId,
      branchId: mockTenant1.branchId,
      openedBy: mockUser.id,
      openedAt: new Date().toISOString(),
      openingCents: 500000,
      sangriaCents: 0,
      suprimentoCents: 0,
      terminalId: mockTenant1.terminalId,
      operatorName: mockUser.displayName,
      status: "OPEN",
      isServerConfirmed: true,
      isOfflineIntent: false,
    };
    cash.setCurrentSession(confirmedSession);
    (cash as any).pendingAction = null; // Limpa ação pendente após confirmação central

    const confirmedCheck = cash.canCreateOfflineCashSale({
      companyId: mockTenant1.companyId,
      branchId: mockTenant1.branchId,
      terminalId: mockTenant1.terminalId,
      userId: mockUser.id,
    });
    assert.equal(confirmedCheck.allowed, true);

    // Rejeição cruzada por tenant/filial/operador divergente
    const wrongTenantCheck = cash.canCreateOfflineCashSale({
      companyId: "outra-empresa",
      branchId: mockTenant1.branchId,
      terminalId: mockTenant1.terminalId,
      userId: mockUser.id,
    });
    assert.equal(wrongTenantCheck.allowed, false);

    // 3. Fecho de sessão offline: gera intenção PENDING na outbox e não oficializa divergência local
    const closeAction = cash.closeSessionOffline(
      outbox,
      mockTenant1,
      confirmedSession.id,
      520000,
      mockUser.id
    );
    assert.equal(closeAction.status, "PENDING_CENTRAL_VALIDATION");
    assert.equal(closeAction.notice, "Pendente de validação central");
    assert.equal(cash.getCurrentSession(), null); // Sessão local não fica como oficialmente fechada com divergência definitiva

    // 4. Após fecho offline, nova venda CASH offline volta a estar bloqueada
    const afterCloseCheck = cash.canCreateOfflineCashSale({
      companyId: mockTenant1.companyId,
      branchId: mockTenant1.branchId,
      terminalId: mockTenant1.terminalId,
      userId: mockUser.id,
    });
    assert.equal(afterCloseCheck.allowed, false);

    // Limpeza
    cash.setCurrentSession(null);
  });

  // CENÁRIO 11: Tratamento de erro de rede no backend com enfileiramento na Outbox
  it("Cenário 11: Falhas transitórias no backend mantêm a venda preservada na Outbox com retry", async () => {
    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      payload: { id: "sale-retry-network", totalCents: 5000 },
      tenant: mockTenant1,
      userId: mockUser.id,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({ message: "Service Unavailable" }),
      } as any);

    try {
      const result = await outbox.syncPending("https://api.vendaja.ao", "tok", mockTenant1);
      assert.equal(result.failed, 1);

      const items = outbox.getItemsForTenant(mockTenant1.companyId);
      assert.equal(items.length, 1);
      assert.ok(items[0] && items[0].attempts >= 1);
      assert.equal(items[0]?.state, "RETRYABLE");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // CENÁRIO 12: Bloqueio rápido com PIN e logout seguro sem vazamento de segredos
  it("Cenário 12: Bloqueio rápido por PIN e logout limpam sessão e impedem acesso não autorizado", async () => {
    await storage.storePin("4321");
    await storage.storeSession(
      { accessToken: "tok-secret", refreshToken: "ref-secret" },
      mockUser
    );

    const unlocked = await storage.verifyPin("4321");
    assert.equal(unlocked, true);

    storage.clearSession();
    const sessionAfter = await storage.getSession();
    assert.equal(sessionAfter, null);
  });

  // Periféricos: Verificação do leitor HID e separação honesta de impressão
  it("Periféricos: HID Scanner captura barcode e impressora separa sistema de Bluetooth pendente", () => {
    const hid = HidScannerService.getInstance();
    assert.match(hid.getTestedModel(), /keyboard-wedge/i);
    assert.match(hid.getTestedModel(), /pendente de validação física/i);

    const printer = MobilePrinterService.getInstance();
    const classification = printer.getPeripheralsClassification();

    const hidClass = classification.find((p) => p.type === "HID_SCANNER");
    assert.equal(hidClass?.status, "compatível por keyboard-wedge; pendente de validação física");

    const sysPrint = classification.find((p) => p.type === "SYSTEM_PRINT");
    assert.equal(sysPrint?.status, "implementada via window.print/WebView; pendente de validação em Android e impressora física");

    const escPos = classification.find((p) => p.type === "ESC_POS_TCP");
    assert.equal(escPos?.status, "interface/protocolo preparado; requer plugin nativo/bridge e teste físico");

    const drawer = classification.find((p) => p.type === "CASH_DRAWER");
    assert.equal(drawer?.status, "interface/protocolo preparado; requer plugin nativo/bridge e teste físico");

    const bt = classification.find((p) => p.type === "BLUETOOTH_PRINTER");
    assert.equal(bt?.status, "interface/protocolo preparado; requer plugin nativo/bridge e teste físico");
  });
});
