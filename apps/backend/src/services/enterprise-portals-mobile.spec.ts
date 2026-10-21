import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseCustomerPortalService,
  EnterpriseSupplierPortalService,
  EnterpriseEmployeePortalService,
  EnterpriseMobileErpService,
  type MobileSyncMutation,
} from "./enterprise/index.js";

describe("Phase 9: Enterprise Portals, Mobile Apps & Omnichannel Self-Service Suite", () => {
  // =========================================================================
  // 1. PORTAL DO CLIENTE (CUSTOMER SELF-SERVICE)
  // =========================================================================
  describe("1. Portal do Cliente (Customer Self-Service)", () => {
    it("should authenticate customer with valid credentials and issue JWT portal token", async () => {
      const auth = await EnterpriseCustomerPortalService.authenticateCustomer(
        "5401992831",
        "pin1234",
        "comp-default"
      );

      assert.ok(auth, "Autenticação do cliente deve ter sucesso");
      assert.ok(auth.token, "Deve emitir token JWT");
      assert.equal(auth.customer.nif, "5401992831");
      assert.equal(auth.customer.name, "Sonangol Distribuidora S.A.");
    });

    it("should reject customer authentication with invalid secret or missing credentials", async () => {
      const invalid = await EnterpriseCustomerPortalService.authenticateCustomer("5401992831", "12");
      assert.equal(invalid, null, "Deve rejeitar segredo inferior a 4 dígitos");

      const notFound = await EnterpriseCustomerPortalService.authenticateCustomer("0000000000", "pin1234");
      assert.equal(notFound, null, "Deve rejeitar cliente inexistente");
    });

    it("should compute accurate customer dashboard and financial statement summary", async () => {
      const dashboard = await EnterpriseCustomerPortalService.getDashboard("cust-portal-01", "comp-default");

      assert.equal(dashboard.customerId, "cust-portal-01");
      assert.ok(dashboard.totalPurchasedCents > 0, "Deve conter total comprado");
      assert.ok(dashboard.creditLimitCents >= 50_000_000_00, "Deve conter limite de crédito contratual");
      assert.ok(dashboard.recentDocuments.length > 0, "Deve listar faturas recentes");
      assert.ok(dashboard.recentPayments.length > 0, "Deve listar pagamentos recentes");

      // Verify statement summary metrics
      assert.ok(dashboard.statementSummary.totalInvoicedCents >= 12_450_000_00);
      assert.ok(dashboard.statementSummary.totalPaidCents >= 5_000_000_00);
    });

    it("should calculate exact running balance in Statement of Account (Extrato de Conta Corrente)", async () => {
      const statement = await EnterpriseCustomerPortalService.getStatement("cust-portal-01");

      assert.ok(statement.entries.length >= 3, "Extrato deve conter faturas e pagamentos");
      assert.ok(statement.totalDebitCents > 0, "Débito total deve ser superior a zero");
      assert.ok(statement.totalCreditCents > 0, "Crédito total deve ser superior a zero");

      // Running balance rule: Entry Debit increases balance, Credit decreases balance
      let expectedBalance = 0;
      for (const entry of statement.entries) {
        expectedBalance += entry.debitCents - entry.creditCents;
        assert.equal(entry.runningBalanceCents, expectedBalance, "Saldo corrente deve coincidir linha a linha");
      }

      assert.equal(statement.finalBalanceCents, expectedBalance);
    });

    it("should generate Multicaixa/GPO payment reference and bank transfer details", async () => {
      const ref = await EnterpriseCustomerPortalService.generatePaymentReference(
        "cust-portal-01",
        "doc-ft-2026-001",
        8_500_000_00
      );

      assert.equal(ref.entity, "00142", "Entidade EMIS Multicaixa oficial");
      assert.equal(ref.reference.length, 9, "Referência Multicaixa deve ter 9 dígitos");
      assert.equal(ref.amountCents, 8_500_000_00, "Valor da referência deve ser 8.500.000 Kz");
      assert.equal(ref.status, "ACTIVE");
      assert.ok(ref.bankIban.startsWith("AO06"), "IBAN deve cumprir padrão bancário angolano");
    });

    it("should allow customer to update contact details from self-service portal", async () => {
      const res = await EnterpriseCustomerPortalService.updateCustomerProfile("cust-portal-01", {
        phone: "+244 923 999 888",
        email: "cobrancas@sonangol.co.ao",
        address: "Avenida 4 de Fevereiro, Luanda",
      });

      assert.ok(res.success);
      assert.equal(res.customer.phone, "+244 923 999 888");
      assert.equal(res.customer.email, "cobrancas@sonangol.co.ao");
    });
  });

  // =========================================================================
  // 2. PORTAL DO FORNECEDOR (SUPPLIER SELF-SERVICE)
  // =========================================================================
  describe("2. Portal do Fornecedor (Supplier Self-Service)", () => {
    it("should authenticate supplier with valid NIF/secret", async () => {
      const auth = await EnterpriseSupplierPortalService.authenticateSupplier(
        "5409112233",
        "supp2026",
        "comp-default"
      );

      assert.ok(auth, "Autenticação do fornecedor deve ter sucesso");
      assert.ok(auth.token);
      assert.equal(auth.supplier.nif, "5409112233");
      assert.equal(auth.supplier.name, "Angola Distribuição & Logística Lda.");
    });

    it("should compute supplier dashboard with orders, receipts and pending payables", async () => {
      const dashboard = await EnterpriseSupplierPortalService.getDashboard("supp-portal-01", "comp-default");

      assert.equal(dashboard.supplierId, "supp-portal-01");
      assert.ok(dashboard.totalPurchasesCents > 0, "Deve calcular total de compras");
      assert.ok(dashboard.openOrdersCount >= 1, "Deve contabilizar ordens abertas");
      assert.ok(dashboard.recentOrders.length > 0, "Deve listar encomendas recentes");
      assert.ok(dashboard.recentReceipts.length > 0, "Deve listar receções de mercadoria");
      assert.ok(dashboard.recentPayments.length > 0, "Deve listar pagamentos liquidados");
    });

    it("should list purchase orders and goods receipts for the supplier", async () => {
      const orders = await EnterpriseSupplierPortalService.listPurchaseOrders("supp-portal-01");
      assert.ok(orders.length >= 2);
      assert.ok(orders.some((o) => o.number === "OC 2026/0041"));

      const receipts = await EnterpriseSupplierPortalService.listGoodsReceipts("supp-portal-01");
      assert.ok(receipts.length >= 1);
      assert.equal(receipts[0].orderNumber, "OC 2026/0082");
    });

    it("should allow supplier to submit invoice document with notification dispatch", async () => {
      const doc = await EnterpriseSupplierPortalService.submitDocument("supp-portal-01", {
        documentType: "SUPPLIER_INVOICE",
        documentNumber: "FAT-FORN-2026/99",
        amountCents: 15_800_000_00,
        issueDate: "2026-10-21",
        notes: "Fatura enviada para liquidação bancária",
        fileAttachmentUrl: "https://docs.fornecedor.ao/fat-99.pdf",
      });

      assert.ok(doc.id);
      assert.equal(doc.status, "SUBMITTED");
      assert.equal(doc.documentNumber, "FAT-FORN-2026/99");
      assert.equal(doc.amountCents, 15_800_000_00);

      const list = await EnterpriseSupplierPortalService.listSubmittedDocuments("supp-portal-01");
      assert.ok(list.some((d) => d.id === doc.id));
    });

    it("should update supplier profile and banking IBAN", async () => {
      const res = await EnterpriseSupplierPortalService.updateSupplierProfile("supp-portal-01", {
        contactName: "Eng. Alberto Silva",
        phone: "+244 923 777 666",
        iban: "AO06.0006.0000.9999.8888.7777.6",
      });

      assert.ok(res.success);
      assert.equal(res.supplier.contactName, "Eng. Alberto Silva");
      assert.equal(res.supplier.iban, "AO06.0006.0000.9999.8888.7777.6");
    });
  });

  // =========================================================================
  // 3. PORTAL DO COLABORADOR (RH SELF-SERVICE)
  // =========================================================================
  describe("3. Portal do Colaborador (RH Self-Service)", () => {
    it("should authenticate employee with NIF and PIN", async () => {
      const auth = await EnterpriseEmployeePortalService.authenticateEmployee(
        "5412998877",
        "pin2026",
        "comp-default"
      );

      assert.ok(auth, "Autenticação do colaborador deve ter sucesso");
      assert.ok(auth.token);
      assert.equal(auth.employee.nif, "5412998877");
      assert.equal(auth.employee.fullName, "Dra. Teresa Kwanza de Carvalho");
    });

    it("should compute employee dashboard and legal vacation balance (22 dias LGT)", async () => {
      const dashboard = await EnterpriseEmployeePortalService.getDashboard("emp-portal-01", "comp-default");

      assert.equal(dashboard.employeeId, "emp-portal-01");
      assert.equal(dashboard.position, "Responsável de Tesouraria");
      assert.equal(dashboard.baseSalaryCents, 1_250_000_00);
      assert.equal(dashboard.lastNetSalaryCents, 1_277_000_00);

      // Vacation balance per Angolan LGT
      const vac = dashboard.vacationSummary;
      assert.equal(vac.annualEntitlementDays, 22, "Direito anual a 22 dias úteis de férias");
      assert.equal(vac.daysTaken, 10, "10 dias gozados anteriormente");
      assert.equal(vac.daysRemaining, 12, "22 - 10 = 12 dias restantes");

      assert.ok(dashboard.recentPayslips.length >= 2, "Deve listar recibos salariais");
    });

    it("should list detailed payslips with IRT and INSS 3% deductions", async () => {
      const payslips = await EnterpriseEmployeePortalService.listPayslips("emp-portal-01");

      assert.ok(payslips.length >= 2);
      const latest = payslips[0]!;
      assert.equal(latest.month, "2026-09");
      assert.equal(latest.salaryBaseCents, 1_250_000_00);
      assert.equal(latest.grossSalaryCents, 1_500_000_00);
      assert.equal(latest.inssEmployeeDeductionCents, 37_500_00, "INSS Trabalhador (3% de 1.250.000)");
      assert.equal(latest.inssEmployerDeductionCents, 100_000_00, "INSS Entidade Empregadora (8% de 1.250.000)");
      assert.equal(latest.irtDeductionCents, 185_500_00);
      assert.equal(latest.netSalaryCents, 1_277_000_00);
    });

    it("should submit leave request connected with Workflow Engine", async () => {
      const request = await EnterpriseEmployeePortalService.submitLeaveRequest("emp-portal-01", {
        type: "VACATION",
        startDate: "2026-12-01",
        endDate: "2026-12-05",
        daysCount: 5,
        justification: "Férias no período festivo de Dezembro",
      });

      assert.ok(request.id);
      assert.equal(request.status, "PENDING_APPROVAL");
      assert.equal(request.daysCount, 5);
      assert.equal(request.type, "VACATION");
      assert.ok(request.workflowInstanceId, "Deve estar vinculado a instância de Workflow");

      const list = await EnterpriseEmployeePortalService.listLeaveRequests("emp-portal-01");
      assert.ok(list.some((r) => r.id === request.id));
    });

    it("should update employee profile and emergency contacts", async () => {
      const res = await EnterpriseEmployeePortalService.updateEmployeeProfile("emp-portal-01", {
        phone: "+244 923 444 333",
        email: "teresa.carvalho.pessoal@gmail.com",
        address: "Condomínio Kinaxixi, Torre B, Luanda",
      });

      assert.ok(res.success);
      assert.equal(res.employee.phone, "+244 923 444 333");
      assert.equal(res.employee.email, "teresa.carvalho.pessoal@gmail.com");
    });
  });

  // =========================================================================
  // 4. APLICAÇÕES MÓVEIS (ANDROID & iOS)
  // =========================================================================
  describe("4. Aplicações Móveis (Android & iOS)", () => {
    it("should provide real-time Executive Dashboard for mobile managers", async () => {
      const dash = await EnterpriseMobileErpService.getExecutiveDashboard("comp-default");

      assert.ok(dash.companyName);
      assert.equal(dash.kpis.systemHealth, "HEALTHY");
      assert.ok(dash.kpis.todaySalesCents > 0, "Vendas de hoje devem estar presentes");
      assert.ok(dash.kpis.monthSalesCents > 0, "Vendas do mês devem estar presentes");
      assert.ok(dash.kpis.estimatedMarginPercent > 20, "Margem operacional calculada");
      assert.ok(dash.kpis.cashAvailableCents > 0, "Caixa disponível");
      assert.ok(dash.kpis.receivablesOpenCents > 0, "Contas a receber");
      assert.ok(dash.kpis.payablesOpenCents > 0, "Contas a pagar");
      assert.ok(dash.charts.weeklyTrend.length === 6, "Gráfico semanal deve conter 6 dias");
    });

    it("should list mobile approvals across Purchases, Payments, Leave and Stock", async () => {
      const approvals = await EnterpriseMobileErpService.listApprovals();

      assert.ok(approvals.length >= 4);
      assert.ok(approvals.some((a) => a.category === "PURCHASE_ORDER"));
      assert.ok(approvals.some((a) => a.category === "TREASURY_PAYMENT"));
      assert.ok(approvals.some((a) => a.category === "LEAVE_REQUEST"));
      assert.ok(approvals.some((a) => a.category === "STOCK_TRANSFER"));
    });

    it("should execute one-tap mobile approval action (APPROVE, REJECT, REQUEST_REVISION)", async () => {
      // 1. Approve a purchase order
      const approveRes = await EnterpriseMobileErpService.processApprovalAction(
        "appr-oc-01",
        "APPROVE",
        "exec-director-01",
        "Aprovado conforme plano de compras Q4."
      );

      assert.ok(approveRes.success);
      assert.equal(approveRes.item.status, "APPROVED");
      assert.equal(approveRes.item.details.reviewerUserId, "exec-director-01");
      assert.equal(approveRes.item.details.reviewerComment, "Aprovado conforme plano de compras Q4.");

      // 2. Reject a payment or request revision
      const rejRes = await EnterpriseMobileErpService.processApprovalAction(
        "appr-trf-01",
        "REQUEST_REVISION",
        "finance-director-01",
        "Confirmar saldo de fatura antes da emissão."
      );

      assert.ok(rejRes.success);
      assert.equal(rejRes.item.status, "REVISION_REQUESTED");
    });

    it("should register georeferenced Mobile CRM client visit with signature", async () => {
      const visit = await EnterpriseMobileErpService.registerVisit("sales-agent-01", {
        customerId: "cust-portal-01",
        customerName: "Sonangol Distribuidora S.A.",
        latitude: -8.8147,
        longitude: 13.2302,
        notes: "Visita comercial presencial no escritório central de Luanda. Apresentação do catálogo Q4.",
        outcome: "PROPOSAL_REQUESTED",
        customerSignature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      });

      assert.ok(visit.id);
      assert.equal(visit.customerId, "cust-portal-01");
      assert.equal(visit.latitude, -8.8147);
      assert.equal(visit.longitude, 13.2302);
      assert.equal(visit.outcome, "PROPOSAL_REQUESTED");
      assert.ok(visit.customerSignature);

      const visits = await EnterpriseMobileErpService.listVisits("sales-agent-01");
      assert.ok(visits.some((v) => v.id === visit.id));
    });

    it("should register customer phone calls on mobile CRM", async () => {
      const call = await EnterpriseMobileErpService.registerCall("sales-agent-01", {
        customerId: "cust-portal-01",
        customerName: "Sonangol Distribuidora S.A.",
        phone: "+244 923 888 777",
        durationSeconds: 185,
        notes: "Chamada de follow-up sobre a proposta comercial.",
      });

      assert.ok(call.id);
      assert.equal(call.durationSeconds, 185);
      assert.equal(call.phone, "+244 923 888 777");
    });

    it("should register mobile device push notification token and preferences (Android/iOS)", async () => {
      // 1. Android device
      const androidDev = await EnterpriseMobileErpService.registerDevice({
        userId: "user-exec-01",
        deviceId: "android-pixel-9-uuid-001",
        platform: "android",
        pushToken: "fcm-token-sample-android-xyz-12345",
        model: "Google Pixel 9 Pro",
        appVersion: "2.2.2",
        preferences: { approvals: true, criticalStock: true, overdueInvoices: true },
      });

      assert.equal(androidDev.platform, "android");
      assert.equal(androidDev.model, "Google Pixel 9 Pro");
      assert.equal(androidDev.preferences.approvals, true);

      // 2. iOS device
      const iosDev = await EnterpriseMobileErpService.registerDevice({
        userId: "user-exec-02",
        deviceId: "ios-iphone-16-uuid-002",
        platform: "ios",
        pushToken: "apns-token-sample-ios-abc-67890",
        model: "Apple iPhone 16 Pro Max",
        appVersion: "2.2.2",
        preferences: { approvals: true, criticalStock: false, backupFailed: true },
      });

      assert.equal(iosDev.platform, "ios");
      assert.equal(iosDev.model, "Apple iPhone 16 Pro Max");

      const devices = await EnterpriseMobileErpService.listRegisteredDevices();
      assert.ok(devices.some((d) => d.deviceId === "android-pixel-9-uuid-001"));
      assert.ok(devices.some((d) => d.deviceId === "ios-iphone-16-uuid-002"));
    });

    it("should synchronize batch offline mobile mutations with deterministic idempotency", async () => {
      const mutations: MobileSyncMutation[] = [
        {
          idempotencyKey: "mut-visit-offline-01",
          entity: "CRM_VISIT",
          operation: "CREATE",
          payload: {
            customerId: "cust-portal-01",
            customerName: "Sonangol Distribuidora S.A.",
            latitude: -8.8383,
            longitude: 13.2344,
            notes: "Visita efetuada em modo offline sem internet.",
            outcome: "SALE_CLOSED",
          },
          occurredAt: new Date().toISOString(),
        },
        {
          idempotencyKey: "mut-call-offline-02",
          entity: "CRM_CALL",
          operation: "CREATE",
          payload: {
            customerId: "cust-portal-01",
            customerName: "Sonangol Distribuidora S.A.",
            phone: "+244 923 000 111",
            durationSeconds: 120,
            notes: "Chamada offline sincronizada.",
          },
          occurredAt: new Date().toISOString(),
        },
      ];

      // First sync attempt
      const sync1 = await EnterpriseMobileErpService.syncOfflineBatch("user-agent-01", mutations);
      assert.equal(sync1.accepted.length, 2, "Todas as mutações devem ser aceites");
      assert.equal(sync1.rejected.length, 0);

      // Second sync attempt (Idempotency test): duplicate keys must be safely accepted without duplicate execution
      const sync2 = await EnterpriseMobileErpService.syncOfflineBatch("user-agent-01", mutations);
      assert.equal(sync2.accepted.length, 2, "Reenvio idempotente deve ser aceite");
      assert.equal(sync2.rejected.length, 0);
    });

    it("should generate comprehensive offline snapshot bundle for field mobile operations", async () => {
      const snapshot = await EnterpriseMobileErpService.getOfflineSnapshot("user-agent-01");

      assert.ok(snapshot.snapshotAt);
      assert.ok(snapshot.pendingApprovals.length > 0, "Deve incluir aprovações pendentes");
      assert.ok(snapshot.catalog.length >= 3, "Deve incluir catálogo essencial offline");
      assert.ok(snapshot.customers.length >= 2, "Deve incluir carteira de clientes offline");
    });
  });
});
