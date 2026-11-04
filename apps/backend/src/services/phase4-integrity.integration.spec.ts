import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getEffectiveTestDatabaseUrl } from "./db-test-helper.js";
import { getEnv } from "../config/env.js";
import { stockRouter } from "../routes/stock.js";
import { customerRouter, receivableRouter } from "../routes/customers.js";
import { purchaseRouter, supplierRouter } from "../routes/purchases.js";

const databaseUrl = await getEffectiveTestDatabaseUrl();
const integration = databaseUrl ? test : test.skip;

integration("Fase 4 PostgreSQL: Validação de Integridade e Isolamento Backend", async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/stock", stockRouter);
  app.use("/api/v1/customers", customerRouter);
  app.use("/api/v1/receivables", receivableRouter);
  app.use("/api/v1/purchases", purchaseRouter);
  app.use("/api/v1/suppliers", supplierRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const suffix = randomUUID().slice(0, 8);
  const jwtSecret = getEnv().JWT_SECRET;

  // 1. Fixture de Empresas A e B
  const [companyA, companyB] = await Promise.all([
    prisma.company.create({ data: { legalName: `Empresa Alfa ${suffix}` } }),
    prisma.company.create({ data: { legalName: `Empresa Beta ${suffix}` } }),
  ]);

  const [branchA, branchB] = await Promise.all([
    prisma.branch.create({ data: { companyId: companyA.id, code: `BRA-${suffix}`, name: "Filial Alfa" } }),
    prisma.branch.create({ data: { companyId: companyB.id, code: `BRB-${suffix}`, name: "Filial Beta" } }),
  ]);

  // 2. Utilizadores e Memberships
  // Admin em A
  const userAdminA = await prisma.user.create({
    data: {
      email: `admin-a-${suffix}@teste.ao`,
      username: `admin_a_${suffix}`,
      passwordHash: "dummy-hash",
      role: "ROLE_ADMIN",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userAdminA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_ADMIN", active: true },
  });
  const tokenAdminA = jwt.sign({ id: userAdminA.id, role: "ROLE_ADMIN" }, jwtSecret, { expiresIn: "1h" });

  // Operador/HR em A (Sem permissão de STOCK nem ADMIN)
  const userHrA = await prisma.user.create({
    data: {
      email: `hr-a-${suffix}@teste.ao`,
      username: `hr_a_${suffix}`,
      passwordHash: "dummy-hash",
      role: "ROLE_HR",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userHrA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_HR", active: true },
  });
  const tokenHrA = jwt.sign({ id: userHrA.id, role: "ROLE_HR" }, jwtSecret, { expiresIn: "1h" });

  // 3. Armazéns, Localizações e Produtos para Alfa e Beta
  const [warehouseA, warehouseB] = await Promise.all([
    prisma.warehouse.create({ data: { companyId: companyA.id, branchId: branchA.id, code: `WHA-${suffix}`, name: "Armazém A" } }),
    prisma.warehouse.create({ data: { companyId: companyB.id, branchId: branchB.id, code: `WHB-${suffix}`, name: "Armazém B" } }),
  ]);

  const [locA1, locA2, locB1] = await Promise.all([
    prisma.stockLocation.create({ data: { warehouseId: warehouseA.id, code: "A1", name: "Corredor A1" } }),
    prisma.stockLocation.create({ data: { warehouseId: warehouseA.id, code: "A2", name: "Corredor A2" } }),
    prisma.stockLocation.create({ data: { warehouseId: warehouseB.id, code: "B1", name: "Corredor B1" } }),
  ]);

  const [prodA, prodB] = await Promise.all([
    prisma.product.create({
      data: {
        companyId: companyA.id,
        branchId: branchA.id,
        sku: `SKU-A-${suffix}`,
        name: "Produto Alfa",
        priceCents: 50000,
        costCents: 20000,
        stock: 100,
        taxRate: 0.14,
      },
    }),
    prisma.product.create({
      data: {
        companyId: companyB.id,
        branchId: branchB.id,
        sku: `SKU-B-${suffix}`,
        name: "Produto Beta",
        priceCents: 60000,
        costCents: 30000,
        stock: 50,
        taxRate: 0.14,
      },
    }),
  ]);

  // Saldo inicial no Armazém A
  await prisma.stockBalance.create({
    data: {
      productId: prodA.id,
      locationId: locA1.id,
      quantity: 100,
      totalCostCents: 2000000,
      averageCostCents: 20000,
    },
  });

  try {
    // --------------------------------------------------------------------------
    // Teste 1: STOCK_TRANSFER de tenant/filial diferente rejeitado com 404 sem vazar dados
    // --------------------------------------------------------------------------
    await t.test("1. STOCK_TRANSFER de tenant/filial diferente rejeitado com 404", async () => {
      const res = await fetch(`${baseUrl}/api/v1/stock/transfers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          sourceLocationId: locA1.id,
          destinationLocationId: locB1.id, // Pertence à Empresa B!
          reference: `TRF-X-${suffix}`,
          lines: [{ productId: prodA.id, quantity: 5 }],
        }),
      });

      assert.equal(res.status, 404, "Tentativa de transferir para armazém de outro tenant deve retornar 404");
      const err = await res.json();
      assert.equal(err.error, "stock_location_not_found");

      // Verificar que o saldo em A1 não sofreu alteração
      const balA1 = await prisma.stockBalance.findUniqueOrThrow({
        where: { productId_locationId: { productId: prodA.id, locationId: locA1.id } },
      });
      assert.equal(balA1.quantity, 100, "Saldo de origem não deve ser debitado");
    });

    // --------------------------------------------------------------------------
    // Teste 2: INVENTORY_COUNT de armazém não autorizado rejeitado com 404
    // --------------------------------------------------------------------------
    await t.test("2. INVENTORY_COUNT de armazém não autorizado rejeitado com 404", async () => {
      const res = await fetch(`${baseUrl}/api/v1/stock/inventory-counts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          locationId: locB1.id, // Pertence à Empresa B!
          reference: `INV-X-${suffix}`,
          lines: [{ productId: prodA.id, countedQuantity: 80 }],
        }),
      });

      assert.equal(res.status, 404, "Contagem em armazém de outra empresa deve retornar 404");
      const err = await res.json();
      assert.equal(err.error, "stock_location_not_found");
    });

    // --------------------------------------------------------------------------
    // Teste 3: PURCHASE_RECEIPT com purchaseId de outro tenant rejeitado com 404
    // --------------------------------------------------------------------------
    let purchaseBId = "";
    await t.test("3. PURCHASE_RECEIPT com purchaseId de outro tenant rejeitado com 404", async () => {
      const supplierB = await prisma.supplier.create({
        data: { companyId: companyB.id, branchId: branchB.id, name: `Fornecedor B ${suffix}` },
      });
      const purchaseB = await prisma.purchase.create({
        data: {
          companyId: companyB.id,
          branchId: branchB.id,
          number: `PO-B-${suffix}`,
          supplierId: supplierB.id,
          subtotalCents: 300000,
          totalCents: 300000,
          status: "CONFIRMED",
          idempotencyKey: `idem-po-b-${suffix}`,
          lines: {
            create: { productId: prodB.id, quantity: 10, unitCostCents: 30000, taxRate: 0, totalCents: 300000 },
          },
        },
      });
      purchaseBId = purchaseB.id;

      // Admin da Empresa A tenta receber mercadoria da encomenda da Empresa B
      const res = await fetch(`${baseUrl}/api/v1/purchases/${purchaseB.id}/receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          locationId: locA1.id,
          reference: `REC-CROSS-${suffix}`,
          lines: [{ productId: prodB.id, quantity: 10 }],
        }),
      });

      assert.equal(res.status, 404, "Receção de compra de outro tenant deve retornar 404");
      const err = await res.json();
      assert.equal(err.error, "purchase_not_found");
    });

    // --------------------------------------------------------------------------
    // Teste 4: Receção parcial repetida com a mesma idempotencyKey retorna 200 replay
    // --------------------------------------------------------------------------
    let purchaseAId = "";
    await t.test("4. Receção parcial repetida com a mesma idempotencyKey retorna replay idempotente", async () => {
      const supplierA = await prisma.supplier.create({
        data: { companyId: companyA.id, branchId: branchA.id, name: `Fornecedor A ${suffix}` },
      });
      const purchaseA = await prisma.purchase.create({
        data: {
          companyId: companyA.id,
          branchId: branchA.id,
          number: `PO-A-${suffix}`,
          supplierId: supplierA.id,
          subtotalCents: 200000,
          totalCents: 200000,
          status: "CONFIRMED",
          idempotencyKey: `idem-po-a-${suffix}`,
          lines: {
            create: { productId: prodA.id, quantity: 10, unitCostCents: 20000, taxRate: 0, totalCents: 200000 },
          },
        },
      });
      purchaseAId = purchaseA.id;

      const receiptRef = `REC-PARCIAL-${suffix}`;
      const receiptPayload = {
        locationId: locA1.id,
        reference: receiptRef,
        lines: [{ productId: prodA.id, quantity: 4 }],
      };

      // 1.ª chamada: cria receção parcial de 4 unidades
      const res1 = await fetch(`${baseUrl}/api/v1/purchases/${purchaseA.id}/receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify(receiptPayload),
      });
      assert.equal(res1.status, 201, "Primeira receção deve retornar 201");

      const poAfter1 = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseA.id } });
      assert.equal(poAfter1.status, "PARTIALLY_RECEIVED");

      const balAfter1 = await prisma.stockBalance.findUniqueOrThrow({
        where: { productId_locationId: { productId: prodA.id, locationId: locA1.id } },
      });
      assert.equal(balAfter1.quantity, 104, "Stock deve incrementar em 4");

      // 2.ª chamada com a mesma referência/idempotência e mesmo payload
      const res2 = await fetch(`${baseUrl}/api/v1/purchases/${purchaseA.id}/receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify(receiptPayload),
      });
      assert.equal(res2.status, 201, "Replay com mesmo payload deve retornar o recibo existente com sucesso");

      const balAfter2 = await prisma.stockBalance.findUniqueOrThrow({
        where: { productId_locationId: { productId: prodA.id, locationId: locA1.id } },
      });
      assert.equal(balAfter2.quantity, 104, "Stock NÃO deve ser duplicado em repetição idempotente");
    });

    // --------------------------------------------------------------------------
    // Teste 5: Receção offline rejeitada e depois recuperada
    // --------------------------------------------------------------------------
    await t.test("5. Receção offline rejeitada (excede restante) e depois recuperada com sucesso", async () => {
      // Compra tinha 10, foram recebidas 4, restam 6.
      // Tentativa de receber 8 -> deve falhar com 409 receipt_exceeds_ordered
      const resReject = await fetch(`${baseUrl}/api/v1/purchases/${purchaseAId}/receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          locationId: locA1.id,
          reference: `REC-EXCEED-${suffix}`,
          lines: [{ productId: prodA.id, quantity: 8 }],
        }),
      });
      assert.equal(resReject.status, 409);
      const errReject = await resReject.json();
      assert.equal(errReject.error, "receipt_exceeds_ordered");

      // Recuperação: Operador corrige para as 6 unidades restantes
      const resRecover = await fetch(`${baseUrl}/api/v1/purchases/${purchaseAId}/receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          locationId: locA1.id,
          reference: `REC-RECOVER-${suffix}`,
          lines: [{ productId: prodA.id, quantity: 6 }],
        }),
      });
      assert.equal(resRecover.status, 201);

      const poFinal = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseAId } });
      assert.equal(poFinal.status, "RECEIVED", "Estado deve progredir para RECEIVED na conclusão da receção");

      const balFinal = await prisma.stockBalance.findUniqueOrThrow({
        where: { productId_locationId: { productId: prodA.id, locationId: locA1.id } },
      });
      assert.equal(balFinal.quantity, 110, "Stock final deve ser 100 inicial + 4 + 6 = 110");
    });

    // --------------------------------------------------------------------------
    // Teste 6: CUSTOMER criado offline com NIF duplicado na mesma empresa rejeitado (409)
    // --------------------------------------------------------------------------
    const sharedNif = `54${Math.floor(10000000 + Math.random() * 90000000)}`;
    await t.test("6. CUSTOMER com NIF duplicado na mesma empresa rejeitado com 409", async () => {
      // 1. Cria cliente 1 em Alfa
      const res1 = await fetch(`${baseUrl}/api/v1/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          name: "Cliente Original",
          nif: sharedNif,
        }),
      });
      assert.equal(res1.status, 201);

      // 2. Tenta criar cliente 2 em Alfa com o mesmo NIF
      const res2 = await fetch(`${baseUrl}/api/v1/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          name: "Cliente Duplicado",
          nif: sharedNif,
        }),
      });
      assert.equal(res2.status, 409);
      const err = await res2.json();
      assert.equal(err.error, "customer_nif_exists");
    });

    // --------------------------------------------------------------------------
    // Teste 7: Mesmo NIF permitido noutra empresa (multiempresa permitida por schema)
    // --------------------------------------------------------------------------
    await t.test("7. Mesmo NIF permitido noutra empresa (@@unique([companyId, nif]))", async () => {
      // Criar membership para userAdminA na Empresa B para permitir emissão em Beta
      await prisma.companyMembership.create({
        data: { userId: userAdminA.id, companyId: companyB.id, branchId: branchB.id, role: "ROLE_ADMIN", active: true },
      });

      const resBeta = await fetch(`${baseUrl}/api/v1/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyB.id,
          "x-branch-id": branchB.id,
        },
        body: JSON.stringify({
          name: "Cliente Filial Beta",
          nif: sharedNif, // Mesmo NIF, mas na Empresa B!
        }),
      });
      assert.equal(resBeta.status, 201, "Mesmo NIF noutra empresa deve ser permitido pelo índice composto");
    });

    // --------------------------------------------------------------------------
    // Teste 8: RECEIVABLE_PAYMENT repetido retorna 200 replay idempotente
    // --------------------------------------------------------------------------
    let customerAId = "";
    let cashSessionAId = "";
    await t.test("8. RECEIVABLE_PAYMENT repetido com mesma idempotencyKey retorna replay", async () => {
      // Cliente com dívida de 50.000 Kz
      const custA = await prisma.customer.create({
        data: {
          companyId: companyA.id,
          branchId: branchA.id,
          name: `Devedor ${suffix}`,
          creditLimitCents: 1000000,
          outstandingDebtCents: 5000000, // 50.000 Kz
        },
      });
      customerAId = custA.id;

      // Turno de caixa aberto para receber pagamento
      const cashSess = await prisma.cashSession.create({
        data: {
          companyId: companyA.id,
          branchId: branchA.id,
          terminalId: "MOB-01",
          openedBy: userAdminA.id,
          openingCents: 100000,
          sangriaCents: 0,
          suprimentoCents: 0,
        },
      });
      cashSessionAId = cashSess.id;

      const paymentPayload = {
        amountCents: 2000000, // 20.000 Kz
        paymentMethod: "CASH",
        idempotencyKey: `idem-pay-${suffix}`,
        cashSessionId: cashSess.id,
        reference: "LIQ-001",
      };

      // 1.º pagamento
      const res1 = await fetch(`${baseUrl}/api/v1/customers/${custA.id}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify(paymentPayload),
      });
      assert.equal(res1.status, 201);
      const data1 = await res1.json();
      assert.equal(data1.replay, false);

      const custAfter1 = await prisma.customer.findUniqueOrThrow({ where: { id: custA.id } });
      assert.equal(custAfter1.outstandingDebtCents, 3000000, "Dívida deve abater 20.000 Kz (saldo 30.000)");

      // 2.º pagamento com mesma idempotencyKey (replay)
      const res2 = await fetch(`${baseUrl}/api/v1/customers/${custA.id}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify(paymentPayload),
      });
      assert.equal(res2.status, 200, "Replay deve retornar HTTP 200");
      const data2 = await res2.json();
      assert.equal(data2.replay, true);

      const custAfter2 = await prisma.customer.findUniqueOrThrow({ where: { id: custA.id } });
      assert.equal(custAfter2.outstandingDebtCents, 3000000, "Dívida NÃO deve ser debitada novamente");
    });

    // --------------------------------------------------------------------------
    // Teste 9: Pagamento de conta corrente acima do saldo rejeitado com 409
    // --------------------------------------------------------------------------
    await t.test("9. Pagamento de conta corrente acima do saldo rejeitado com 409", async () => {
      // Saldo restante é 30.000 Kz. Tentativa de pagar 40.000 Kz
      const res = await fetch(`${baseUrl}/api/v1/customers/${customerAId}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          amountCents: 4000000, // 40.000 Kz
          paymentMethod: "CASH",
          idempotencyKey: `idem-pay-excess-${suffix}`,
          cashSessionId: cashSessionAId,
        }),
      });

      assert.equal(res.status, 409);
      const err = await res.json();
      assert.equal(err.error, "payment_exceeds_outstanding");

      const cust = await prisma.customer.findUniqueOrThrow({ where: { id: customerAId } });
      assert.equal(cust.outstandingDebtCents, 3000000, "Saldo devedor deve permanecer inalterado");
    });

    // --------------------------------------------------------------------------
    // Teste 10: Pagamento de cliente de outro tenant rejeitado com 404 sem vazar dados
    // --------------------------------------------------------------------------
    await t.test("10. Pagamento de cliente de outro tenant rejeitado com 404", async () => {
      const custB = await prisma.customer.create({
        data: {
          companyId: companyB.id,
          branchId: branchB.id,
          name: `Cliente de Beta ${suffix}`,
          outstandingDebtCents: 100000,
        },
      });

      // Operador no contexto de Alfa tenta liquidar pagamento no cliente de Beta
      const res = await fetch(`${baseUrl}/api/v1/customers/${custB.id}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAdminA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          amountCents: 50000,
          paymentMethod: "CASH",
          idempotencyKey: `idem-pay-cross-${suffix}`,
          cashSessionId: cashSessionAId,
        }),
      });

      assert.equal(res.status, 404, "Cliente de outra empresa deve retornar 404 sem vazar dados");
      const err = await res.json();
      assert.equal(err.error, "customer_not_found");
    });

    // --------------------------------------------------------------------------
    // Teste 11: Mutação com headers forçados x-company-id de outra empresa bloqueada com 403
    // --------------------------------------------------------------------------
    await t.test("11. Mutação com headers forçados x-company-id de outra empresa bloqueada com 403", async () => {
      // userHrA só pertence a companyA (não pertence a companyB)
      const res = await fetch(`${baseUrl}/api/v1/customers`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenHrA}`,
          "x-company-id": companyB.id, // Tentativa de forçar header de Beta
          "x-branch-id": branchB.id,
        },
      });

      assert.equal(res.status, 403, "Header x-company-id sem membership ativa deve retornar 403 forbidden");
      const err = await res.json();
      assert.equal(err.error, "company_context_forbidden");
    });

    // --------------------------------------------------------------------------
    // Teste 12: Operador sem RBAC rejeitado com 403 para transferência, inventário, receção e pagamento
    // --------------------------------------------------------------------------
    await t.test("12. Operador sem RBAC rejeitado com 403 para operações restritas da Fase 4", async () => {
      // 1. Transferência (exige ADMIN / STOCK)
      const resTrf = await fetch(`${baseUrl}/api/v1/stock/transfers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenHrA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          sourceLocationId: locA1.id,
          destinationLocationId: locA2.id,
          reference: `TRF-NORBAC-${suffix}`,
          lines: [{ productId: prodA.id, quantity: 1 }],
        }),
      });
      assert.equal(resTrf.status, 403, "Transferência sem RBAC ADMIN deve retornar 403");

      // 2. Contagem de Inventário (exige ADMIN)
      const resInv = await fetch(`${baseUrl}/api/v1/stock/inventory-counts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenHrA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          locationId: locA1.id,
          reference: `INV-NORBAC-${suffix}`,
          lines: [{ productId: prodA.id, countedQuantity: 100 }],
        }),
      });
      assert.equal(resInv.status, 403, "Contagem de inventário sem RBAC ADMIN deve retornar 403");

      // 3. Receção de Compras (exige ADMIN / STOCK)
      const resRec = await fetch(`${baseUrl}/api/v1/purchases/${purchaseAId}/receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenHrA}`,
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          locationId: locA1.id,
          reference: `REC-NORBAC-${suffix}`,
          lines: [{ productId: prodA.id, quantity: 1 }],
        }),
      });
      assert.equal(resRec.status, 403, "Receção sem RBAC ADMIN deve retornar 403");

      // 4. Pagamento de Recebíveis (exige ADMIN, CASHIER ou ACCOUNTANT)
      const resPay = await fetch(`${baseUrl}/api/v1/customers/${customerAId}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenHrA}`, // ROLE_HR não tem permissão de tesouraria
          "Content-Type": "application/json",
          "x-company-id": companyA.id,
          "x-branch-id": branchA.id,
        },
        body: JSON.stringify({
          amountCents: 1000,
          paymentMethod: "CASH",
          idempotencyKey: `idem-norbac-${suffix}`,
          cashSessionId: cashSessionAId,
        }),
      });
      assert.equal(resPay.status, 403, "Pagamento de conta corrente por utilizador sem permissão financeira deve retornar 403");
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Limpeza de fixtures
    await prisma.receivablePayment.deleteMany({ where: { customer: { companyId: { in: [companyA.id, companyB.id] } } } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.stockMovement.deleteMany({ where: { product: { companyId: { in: [companyA.id, companyB.id] } } } });
    await prisma.purchaseReceiptLine.deleteMany({ where: { product: { companyId: { in: [companyA.id, companyB.id] } } } });
    await prisma.purchaseReceipt.deleteMany({ where: { purchase: { companyId: { in: [companyA.id, companyB.id] } } } });
    await prisma.purchaseLine.deleteMany({ where: { purchase: { companyId: { in: [companyA.id, companyB.id] } } } });
    await prisma.purchase.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.supplier.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.stockBalance.deleteMany({ where: { location: { warehouse: { companyId: { in: [companyA.id, companyB.id] } } } } });
    await prisma.stockLocation.deleteMany({ where: { warehouse: { companyId: { in: [companyA.id, companyB.id] } } } });
    await prisma.warehouse.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.product.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.cashSession.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.companyMembership.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.branch.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyA.id, companyB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAdminA.id, userHrA.id] } } });
    await prisma.$disconnect();
  }
});
