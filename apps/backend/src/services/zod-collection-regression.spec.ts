import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Schemas under test
import {
  workflowMetadataSchema,
  conditionExpressionSchema,
  actionConfigSchema,
  triggerPayloadSchema,
  jobPayloadSchema,
} from "../routes/automation-workflow.js";
import { input as saleInput } from "../routes/sales.js";
import { purchaseInput, receiptInput } from "../routes/purchases.js";
import { documentInput } from "../routes/commercial-documents.js";
import { journalSchema, templateSchema } from "../routes/accounting.js";
import { lines as procurementLines } from "../routes/procurement.js";
import { transferInput, inventoryInput } from "../routes/stock.js";
import { syncInput, saleSchema as syncSaleSchema } from "../routes/sync.js";
import { bankStatementSchema } from "../routes/platform.js";
import {
  createRoleInput,
  updateRoleInput,
  updatePolicySchema,
} from "../routes/security-governance.js";
import {
  createOppSchema,
  createProposalSchema,
  uploadDocumentSchema,
} from "../routes/crm-documents.js";

// ============================================================================
// SUITE 1: AUTOMATION WORKFLOW RECORDS (5 RECORDS ADAPTED TO ZOD 4)
// ============================================================================

test("Zod 4 Regression - Automation Record 1: workflowMetadataSchema", () => {
  // Valid payload with primitives
  const valid = workflowMetadataSchema.safeParse({
    tenant: "empresa-1",
    priority: 10,
    active: true,
    note: null,
  });
  assert.equal(valid.success, true);

  // Key length boundary: 64 chars is valid
  const key64 = "a".repeat(64);
  assert.equal(workflowMetadataSchema.safeParse({ [key64]: "ok" }).success, true);

  // Key length exceeded: 65 chars must be rejected
  const key65 = "a".repeat(65);
  assert.equal(workflowMetadataSchema.safeParse({ [key65]: "nok" }).success, false);

  // String value boundary: 500 chars is valid
  assert.equal(workflowMetadataSchema.safeParse({ desc: "x".repeat(500) }).success, true);

  // String value exceeded: 501 chars must be rejected
  assert.equal(workflowMetadataSchema.safeParse({ desc: "x".repeat(501) }).success, false);

  // Nested object injection must be rejected
  assert.equal(
    workflowMetadataSchema.safeParse({ nested: { evil: true } }).success,
    false,
    "Nested object should be rejected"
  );

  // Nested array injection must be rejected
  assert.equal(
    workflowMetadataSchema.safeParse({ list: [1, 2, 3] }).success,
    false,
    "Nested array should be rejected"
  );

  // Max keys boundary: 50 keys is valid
  const obj50: Record<string, string> = {};
  for (let i = 0; i < 50; i++) obj50[`k_${i}`] = `val_${i}`;
  assert.equal(workflowMetadataSchema.safeParse(obj50).success, true);

  // Max keys exceeded: 51 keys must fail with custom message
  const obj51: Record<string, string> = {};
  for (let i = 0; i < 51; i++) obj51[`k_${i}`] = `val_${i}`;
  const res51 = workflowMetadataSchema.safeParse(obj51);
  assert.equal(res51.success, false);
  if (!res51.success) {
    assert.ok(res51.error.issues.some((i) => i.message === "metadata_max_keys_exceeded"));
  }
});

test("Zod 4 Regression - Automation Record 2: conditionExpressionSchema", () => {
  // Valid payload with primitives and comparison operators
  const valid = conditionExpressionSchema.safeParse({
    status: "CONFIRMED",
    stock: { $lt: 5 },
    price: { $gte: 100, $lte: 500 },
    revenue: { $gt: 1000 },
  });
  assert.equal(valid.success, true);

  // Unsupported comparison operator ($ne, $in) must be rejected
  assert.equal(
    conditionExpressionSchema.safeParse({ stock: { $ne: 0 } }).success,
    false,
    "Unsupported $ne operator must be rejected"
  );
  assert.equal(
    conditionExpressionSchema.safeParse({ status: { $in: ["A", "B"] } }).success,
    false,
    "Unsupported $in operator must be rejected"
  );

  // Invalid comparison value types (nested object, boolean, or string > 500) must be rejected
  assert.equal(
    conditionExpressionSchema.safeParse({ stock: { $lt: { nested: 1 } } }).success,
    false,
    "Nested object in comparison operator must be rejected"
  );
  assert.equal(
    conditionExpressionSchema.safeParse({ stock: { $lt: true as any } }).success,
    false,
    "Boolean value in comparison operator must be rejected"
  );
  assert.equal(
    conditionExpressionSchema.safeParse({ stock: { $lt: "x".repeat(501) } }).success,
    false,
    "String exceeding 500 chars in comparison operator must be rejected"
  );

  // Arbitrary deeply nested objects must be rejected
  assert.equal(
    conditionExpressionSchema.safeParse({ complex: { deep: { nested: 1 } } }).success,
    false,
    "Deeply nested object must be rejected"
  );

  // Max criteria boundary: 20 keys is valid
  const obj20: Record<string, number> = {};
  for (let i = 0; i < 20; i++) obj20[`c_${i}`] = i;
  assert.equal(conditionExpressionSchema.safeParse(obj20).success, true);

  // Max criteria exceeded: 21 keys must fail with custom message
  const obj21: Record<string, number> = {};
  for (let i = 0; i < 21; i++) obj21[`c_${i}`] = i;
  const res21 = conditionExpressionSchema.safeParse(obj21);
  assert.equal(res21.success, false);
  if (!res21.success) {
    assert.ok(res21.error.issues.some((i) => i.message === "condition_expression_max_keys_exceeded"));
  }
});

test("Zod 4 Regression - Automation Record 3: actionConfigSchema", () => {
  // Valid flat primitives
  assert.equal(actionConfigSchema.safeParse({ channel: "SMS", retries: 3, urgent: false }).success, true);

  // Reject nested object or array
  assert.equal(actionConfigSchema.safeParse({ headers: { auth: "bearer" } }).success, false);
  assert.equal(actionConfigSchema.safeParse({ recipients: ["admin@ao.ao"] }).success, false);

  // Boundary 30 keys is valid
  const obj30: Record<string, string> = {};
  for (let i = 0; i < 30; i++) obj30[`a_${i}`] = `v_${i}`;
  assert.equal(actionConfigSchema.safeParse(obj30).success, true);

  // Exceeded: 31 keys must fail with custom message
  const obj31: Record<string, string> = {};
  for (let i = 0; i < 31; i++) obj31[`a_${i}`] = `v_${i}`;
  const res31 = actionConfigSchema.safeParse(obj31);
  assert.equal(res31.success, false);
  if (!res31.success) {
    assert.ok(res31.error.issues.some((i) => i.message === "action_config_max_keys_exceeded"));
  }
});

test("Zod 4 Regression - Automation Record 4: triggerPayloadSchema", () => {
  // Valid default empty object
  assert.equal(triggerPayloadSchema.safeParse(undefined).success, true);
  assert.equal(triggerPayloadSchema.safeParse({}).success, true);

  // Valid flat primitives
  assert.equal(triggerPayloadSchema.safeParse({ event: "STOCK_ALERT", level: 2 }).success, true);

  // Reject nested structures
  assert.equal(triggerPayloadSchema.safeParse({ nested: { a: 1 } }).success, false);
  assert.equal(triggerPayloadSchema.safeParse({ list: [1] }).success, false);

  // Boundary 50 keys is valid
  const obj50: Record<string, string> = {};
  for (let i = 0; i < 50; i++) obj50[`t_${i}`] = `v_${i}`;
  assert.equal(triggerPayloadSchema.safeParse(obj50).success, true);

  // Exceeded: 51 keys must fail with custom message
  const obj51: Record<string, string> = {};
  for (let i = 0; i < 51; i++) obj51[`t_${i}`] = `v_${i}`;
  const res51 = triggerPayloadSchema.safeParse(obj51);
  assert.equal(res51.success, false);
  if (!res51.success) {
    assert.ok(res51.error.issues.some((i) => i.message === "trigger_payload_max_keys_exceeded"));
  }
});

test("Zod 4 Regression - Automation Record 5: jobPayloadSchema", () => {
  // Valid flat primitives
  assert.equal(jobPayloadSchema.safeParse({ reportType: "SAFT", year: 2026 }).success, true);

  // Reject nested structures
  assert.equal(jobPayloadSchema.safeParse({ sub: { x: 1 } }).success, false);
  assert.equal(jobPayloadSchema.safeParse({ items: [] }).success, false);

  // Boundary 20 keys is valid
  const obj20: Record<string, number> = {};
  for (let i = 0; i < 20; i++) obj20[`j_${i}`] = i;
  assert.equal(jobPayloadSchema.safeParse(obj20).success, true);

  // Exceeded: 21 keys must fail with custom message
  const obj21: Record<string, number> = {};
  for (let i = 0; i < 21; i++) obj21[`j_${i}`] = i;
  const res21 = jobPayloadSchema.safeParse(obj21);
  assert.equal(res21.success, false);
  if (!res21.success) {
    assert.ok(res21.error.issues.some((i) => i.message === "job_payload_max_keys_exceeded"));
  }
});

// ============================================================================
// SUITE 2: HTTP ROUTE COLLECTION LIMITS (19 ARRAYS)
// ============================================================================

test("Zod 4 Regression - Array 1: sales.ts lines (min 1, max 1000)", () => {
  const baseLine = { productId: "prod-1", quantity: 2, unitPriceCents: 1000, taxRate: 0.14 };
  const baseSale = { id: randomUUID(), paymentMethod: "CASH" as const };

  // 0 lines -> invalid (min 1)
  assert.equal(saleInput.safeParse({ ...baseSale, lines: [] }).success, false);

  // 1 line -> valid
  assert.equal(saleInput.safeParse({ ...baseSale, lines: [baseLine] }).success, true);

  // 1000 lines -> valid (boundary)
  const lines1000 = Array.from({ length: 1000 }, () => baseLine);
  assert.equal(saleInput.safeParse({ ...baseSale, lines: lines1000 }).success, true);

  // 1001 lines -> invalid (max 1000 exceeded)
  const lines1001 = Array.from({ length: 1001 }, () => baseLine);
  assert.equal(saleInput.safeParse({ ...baseSale, lines: lines1001 }).success, false);
});

test("Zod 4 Regression - Array 2: purchases.ts purchaseInput.lines (min 1, max 1000)", () => {
  const prodId = randomUUID();
  const suppId = randomUUID();
  const baseLine = { productId: prodId, quantity: 5, unitCostCents: 500, taxRate: 0 };
  const basePurchase = {
    idempotencyKey: "idem-1",
    number: "PUR-001",
    supplierId: suppId,
    paymentMethod: "CASH" as const,
  };

  // 0 lines -> invalid
  assert.equal(purchaseInput.safeParse({ ...basePurchase, lines: [] }).success, false);

  // 1 line -> valid
  assert.equal(purchaseInput.safeParse({ ...basePurchase, lines: [baseLine] }).success, true);

  // 1000 lines -> valid
  const lines1000 = Array.from({ length: 1000 }, () => baseLine);
  assert.equal(purchaseInput.safeParse({ ...basePurchase, lines: lines1000 }).success, true);

  // 1001 lines -> invalid
  const lines1001 = Array.from({ length: 1001 }, () => baseLine);
  assert.equal(purchaseInput.safeParse({ ...basePurchase, lines: lines1001 }).success, false);
});

test("Zod 4 Regression - Array 3: purchases.ts receiptInput.lines (min 1, max 1000)", () => {
  const prodId = randomUUID();
  const locId = randomUUID();
  const baseLine = { productId: prodId, quantity: 1 };
  const baseReceipt = { reference: "REC-001", locationId: locId };

  // 0 lines -> invalid
  assert.equal(receiptInput.safeParse({ ...baseReceipt, lines: [] }).success, false);

  // 1 line -> valid
  assert.equal(receiptInput.safeParse({ ...baseReceipt, lines: [baseLine] }).success, true);

  // 1000 lines -> valid
  const lines1000 = Array.from({ length: 1000 }, () => baseLine);
  assert.equal(receiptInput.safeParse({ ...baseReceipt, lines: lines1000 }).success, true);

  // 1001 lines -> invalid
  const lines1001 = Array.from({ length: 1001 }, () => baseLine);
  assert.equal(receiptInput.safeParse({ ...baseReceipt, lines: lines1001 }).success, false);
});

test("Zod 4 Regression - Array 4: commercial-documents.ts documentInput.lines (min 1, max 1000)", () => {
  const prodId = randomUUID();
  const baseLine = { productId: prodId, quantity: 1, unitPriceCents: 200 };
  const baseDoc = { type: "QUOTE" as const, series: "A" };

  // 0 lines -> invalid
  assert.equal(documentInput.safeParse({ ...baseDoc, lines: [] }).success, false);

  // 1 line -> valid
  assert.equal(documentInput.safeParse({ ...baseDoc, lines: [baseLine] }).success, true);

  // 1000 lines -> valid
  const lines1000 = Array.from({ length: 1000 }, () => baseLine);
  assert.equal(documentInput.safeParse({ ...baseDoc, lines: lines1000 }).success, true);

  // 1001 lines -> invalid
  const lines1001 = Array.from({ length: 1001 }, () => baseLine);
  assert.equal(documentInput.safeParse({ ...baseDoc, lines: lines1001 }).success, false);
});

test("Zod 4 Regression - Array 5: accounting.ts journalSchema.lines (min 2, max 1000)", () => {
  const lineDebit = { accountCode: "1.1", debitCents: 1000, creditCents: 0 };
  const lineCredit = { accountCode: "2.1", debitCents: 0, creditCents: 1000 };
  const baseJournal = { description: "Lançamento Contabilístico Geral" };

  // 1 line -> invalid (min 2)
  assert.equal(journalSchema.safeParse({ ...baseJournal, lines: [lineDebit] }).success, false);

  // 2 lines -> valid
  assert.equal(journalSchema.safeParse({ ...baseJournal, lines: [lineDebit, lineCredit] }).success, true);

  // 1000 lines -> valid (500 debits + 500 credits)
  const lines1000 = [
    ...Array.from({ length: 500 }, () => lineDebit),
    ...Array.from({ length: 500 }, () => lineCredit),
  ];
  assert.equal(journalSchema.safeParse({ ...baseJournal, lines: lines1000 }).success, true);

  // 1001 lines -> invalid (max 1000)
  const lines1001 = [...lines1000, lineDebit];
  assert.equal(journalSchema.safeParse({ ...baseJournal, lines: lines1001 }).success, false);
});

test("Zod 4 Regression - Array 6: accounting.ts templateSchema.accounts (max 500)", () => {
  const baseAccount = { code: "1.1", name: "Caixa Geral", type: "ASSET" as const };

  // 0 accounts -> valid
  assert.equal(templateSchema.safeParse({ accounts: [] }).success, true);

  // 500 accounts -> valid (boundary)
  const accounts500 = Array.from({ length: 500 }, (_, i) => ({
    ...baseAccount,
    code: `1.${i + 1}`,
  }));
  assert.equal(templateSchema.safeParse({ accounts: accounts500 }).success, true);

  // 501 accounts -> invalid (max 500 exceeded)
  const accounts501 = Array.from({ length: 501 }, (_, i) => ({
    ...baseAccount,
    code: `1.${i + 1}`,
  }));
  assert.equal(templateSchema.safeParse({ accounts: accounts501 }).success, false);
});

test("Zod 4 Regression - Array 7: procurement.ts lines (min 1, max 500)", () => {
  const prodId = randomUUID();
  const baseLine = { productId: prodId, quantity: 10, unitCostCents: 1500 };

  // 0 lines -> invalid
  assert.equal(procurementLines.safeParse([]).success, false);

  // 1 line -> valid
  assert.equal(procurementLines.safeParse([baseLine]).success, true);

  // 500 lines -> valid (boundary)
  const lines500 = Array.from({ length: 500 }, () => baseLine);
  assert.equal(procurementLines.safeParse(lines500).success, true);

  // 501 lines -> invalid (max 500 exceeded)
  const lines501 = Array.from({ length: 501 }, () => baseLine);
  assert.equal(procurementLines.safeParse(lines501).success, false);
});

test("Zod 4 Regression - Array 8: stock.ts transferInput.lines (min 1, max 1000)", () => {
  const src = randomUUID();
  const dst = randomUUID();
  const prodId = randomUUID();
  const baseLine = { productId: prodId, quantity: 5 };
  const baseTransfer = { sourceLocationId: src, destinationLocationId: dst, reference: "TRF-001" };

  // 0 lines -> invalid
  assert.equal(transferInput.safeParse({ ...baseTransfer, lines: [] }).success, false);

  // 1 line -> valid
  assert.equal(transferInput.safeParse({ ...baseTransfer, lines: [baseLine] }).success, true);

  // 1000 lines -> valid (boundary)
  const lines1000 = Array.from({ length: 1000 }, () => baseLine);
  assert.equal(transferInput.safeParse({ ...baseTransfer, lines: lines1000 }).success, true);

  // 1001 lines -> invalid (max 1000 exceeded)
  const lines1001 = Array.from({ length: 1001 }, () => baseLine);
  assert.equal(transferInput.safeParse({ ...baseTransfer, lines: lines1001 }).success, false);
});

test("Zod 4 Regression - Array 9: stock.ts inventoryInput.lines (min 1, max 5000)", () => {
  const locId = randomUUID();
  const baseInv = { locationId: locId, reference: "INV-2026" };

  // 0 lines -> invalid
  assert.equal(inventoryInput.safeParse({ ...baseInv, lines: [] }).success, false);

  // 1 line -> valid
  assert.equal(
    inventoryInput.safeParse({
      ...baseInv,
      lines: [{ productId: randomUUID(), countedQuantity: 10 }],
    }).success,
    true
  );

  // 5000 lines -> valid (boundary - each product unique for superRefine)
  const lines5000 = Array.from({ length: 5000 }, () => ({
    productId: randomUUID(),
    countedQuantity: 1,
  }));
  assert.equal(inventoryInput.safeParse({ ...baseInv, lines: lines5000 }).success, true);

  // 5001 lines -> invalid (max 5000 exceeded)
  const lines5001 = Array.from({ length: 5001 }, () => ({
    productId: randomUUID(),
    countedQuantity: 1,
  }));
  assert.equal(inventoryInput.safeParse({ ...baseInv, lines: lines5001 }).success, false);
});

test("Zod 4 Regression - Array 10: sync.ts saleSchema.lines (min 1, max 1000)", () => {
  const baseLine = { productId: "prod-1", quantity: 1, unitPriceCents: 100 };
  const baseSale = { id: randomUUID() };

  // 0 lines -> invalid
  assert.equal(syncSaleSchema.safeParse({ ...baseSale, lines: [] }).success, false);

  // 1 line -> valid
  assert.equal(syncSaleSchema.safeParse({ ...baseSale, lines: [baseLine] }).success, true);

  // 1000 lines -> valid (boundary)
  const lines1000 = Array.from({ length: 1000 }, () => baseLine);
  assert.equal(syncSaleSchema.safeParse({ ...baseSale, lines: lines1000 }).success, true);

  // 1001 lines -> invalid (max 1000 exceeded)
  const lines1001 = Array.from({ length: 1001 }, () => baseLine);
  assert.equal(syncSaleSchema.safeParse({ ...baseSale, lines: lines1001 }).success, false);
});

test("Zod 4 Regression - Array 11: sync.ts syncInput.mutations (max 1000)", () => {
  const baseMut = {
    id: "mut-1",
    operation: "CREATE" as const,
    entity: "SALE" as const,
    payload: {},
    occurredAt: new Date().toISOString(),
  };

  // 0 mutations -> valid
  assert.equal(syncInput.safeParse({ deviceId: "dev-1", mutations: [] }).success, true);

  // 1000 mutations -> valid (boundary)
  const muts1000 = Array.from({ length: 1000 }, (_, i) => ({ ...baseMut, id: `mut-${i}` }));
  assert.equal(syncInput.safeParse({ deviceId: "dev-1", mutations: muts1000 }).success, true);

  // 1001 mutations -> invalid (max 1000 exceeded)
  const muts1001 = Array.from({ length: 1001 }, (_, i) => ({ ...baseMut, id: `mut-${i}` }));
  assert.equal(syncInput.safeParse({ deviceId: "dev-1", mutations: muts1001 }).success, false);
});

test("Zod 4 Regression - Array 12: platform.ts bankStatementSchema.lines (max 5000)", () => {
  const baseStatement = {
    statementDate: new Date(),
    openingBalanceCents: 0,
    closingBalanceCents: 10000,
  };
  const baseLine = {
    occurredAt: new Date(),
    description: "Depósito Bancário",
    amountCents: 5000,
  };

  // 0 lines -> valid
  assert.equal(bankStatementSchema.safeParse({ ...baseStatement, lines: [] }).success, true);

  // 5000 lines -> valid (boundary)
  const lines5000 = Array.from({ length: 5000 }, () => baseLine);
  assert.equal(bankStatementSchema.safeParse({ ...baseStatement, lines: lines5000 }).success, true);

  // 5001 lines -> invalid (max 5000 exceeded)
  const lines5001 = Array.from({ length: 5001 }, () => baseLine);
  assert.equal(bankStatementSchema.safeParse({ ...baseStatement, lines: lines5001 }).success, false);
});

test("Zod 4 Regression - Array 13: security-governance.ts createRoleInput.permissionCodes (max 200)", () => {
  const baseRole = { name: "Contabilista Sénior", code: "ROLE_ACCOUNTANT_SR" };

  // 0 permissionCodes -> valid (optional)
  assert.equal(createRoleInput.safeParse({ ...baseRole, permissionCodes: [] }).success, true);

  // 200 permissionCodes -> valid (boundary)
  const codes200 = Array.from({ length: 200 }, (_, i) => `PERM_${i}`);
  assert.equal(createRoleInput.safeParse({ ...baseRole, permissionCodes: codes200 }).success, true);

  // 201 permissionCodes -> invalid (max 200 exceeded)
  const codes201 = Array.from({ length: 201 }, (_, i) => `PERM_${i}`);
  assert.equal(createRoleInput.safeParse({ ...baseRole, permissionCodes: codes201 }).success, false);
});

test("Zod 4 Regression - Array 14: security-governance.ts updateRoleInput.permissionCodes (max 200)", () => {
  // 0 permissionCodes -> valid
  assert.equal(updateRoleInput.safeParse({ permissionCodes: [] }).success, true);

  // 200 permissionCodes -> valid (boundary)
  const codes200 = Array.from({ length: 200 }, (_, i) => `PERM_${i}`);
  assert.equal(updateRoleInput.safeParse({ permissionCodes: codes200 }).success, true);

  // 201 permissionCodes -> invalid (max 200 exceeded)
  const codes201 = Array.from({ length: 201 }, (_, i) => `PERM_${i}`);
  assert.equal(updateRoleInput.safeParse({ permissionCodes: codes201 }).success, false);
});

test("Zod 4 Regression - Array 15: security-governance.ts updatePolicySchema.mfaMandatoryRoles (max 50)", () => {
  // 0 roles -> valid
  assert.equal(updatePolicySchema.safeParse({ mfaMandatoryRoles: [] }).success, true);

  // 50 roles -> valid (boundary)
  const roles50 = Array.from({ length: 50 }, (_, i) => `ROLE_${i}`);
  assert.equal(updatePolicySchema.safeParse({ mfaMandatoryRoles: roles50 }).success, true);

  // 51 roles -> invalid (max 50 exceeded)
  const roles51 = Array.from({ length: 51 }, (_, i) => `ROLE_${i}`);
  assert.equal(updatePolicySchema.safeParse({ mfaMandatoryRoles: roles51 }).success, false);
});

test("Zod 4 Regression - Array 16: security-governance.ts updatePolicySchema.ipWhitelist (max 100)", () => {
  // 0 IPs -> valid
  assert.equal(updatePolicySchema.safeParse({ ipWhitelist: [] }).success, true);

  // 100 IPs -> valid (boundary)
  const ips100 = Array.from({ length: 100 }, (_, i) => `192.168.1.${i}`);
  assert.equal(updatePolicySchema.safeParse({ ipWhitelist: ips100 }).success, true);

  // 101 IPs -> invalid (max 100 exceeded)
  const ips101 = Array.from({ length: 101 }, (_, i) => `192.168.1.${i}`);
  assert.equal(updatePolicySchema.safeParse({ ipWhitelist: ips101 }).success, false);
});

test("Zod 4 Regression - Array 17: crm-documents.ts createOppSchema.tags (max 50)", () => {
  const baseOpp = { title: "Oportunidade de Venda de Licenças" };

  // 0 tags -> valid
  assert.equal(createOppSchema.safeParse({ ...baseOpp, tags: [] }).success, true);

  // 50 tags -> valid (boundary)
  const tags50 = Array.from({ length: 50 }, (_, i) => `tag_${i}`);
  assert.equal(createOppSchema.safeParse({ ...baseOpp, tags: tags50 }).success, true);

  // 51 tags -> invalid (max 50 exceeded)
  const tags51 = Array.from({ length: 51 }, (_, i) => `tag_${i}`);
  assert.equal(createOppSchema.safeParse({ ...baseOpp, tags: tags51 }).success, false);
});

test("Zod 4 Regression - Array 18: crm-documents.ts createProposalSchema.items (min 1, max 500)", () => {
  const baseProp = { title: "Proposta Comercial 2026/001" };
  const baseItem = { description: "Serviço de Consultoria", quantity: 1, unitPriceCents: 50000, totalCents: 50000 };

  // 0 items -> invalid (min 1)
  assert.equal(createProposalSchema.safeParse({ ...baseProp, items: [] }).success, false);

  // 1 item -> valid
  assert.equal(createProposalSchema.safeParse({ ...baseProp, items: [baseItem] }).success, true);

  // 500 items -> valid (boundary)
  const items500 = Array.from({ length: 500 }, () => baseItem);
  assert.equal(createProposalSchema.safeParse({ ...baseProp, items: items500 }).success, true);

  // 501 items -> invalid (max 500 exceeded)
  const items501 = Array.from({ length: 501 }, () => baseItem);
  assert.equal(createProposalSchema.safeParse({ ...baseProp, items: items501 }).success, false);
});

test("Zod 4 Regression - Array 19: crm-documents.ts uploadDocumentSchema.tags (max 50)", () => {
  const baseDoc = { title: "Alvará Comercial 2026" };

  // 0 tags -> valid
  assert.equal(uploadDocumentSchema.safeParse({ ...baseDoc, tags: [] }).success, true);

  // 50 tags -> valid (boundary)
  const tags50 = Array.from({ length: 50 }, (_, i) => `tag_${i}`);
  assert.equal(uploadDocumentSchema.safeParse({ ...baseDoc, tags: tags50 }).success, true);

  // 51 tags -> invalid (max 50 exceeded)
  const tags51 = Array.from({ length: 51 }, (_, i) => `tag_${i}`);
  assert.equal(uploadDocumentSchema.safeParse({ ...baseDoc, tags: tags51 }).success, false);
});
