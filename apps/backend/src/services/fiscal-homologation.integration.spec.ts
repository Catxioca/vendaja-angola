import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { getEffectiveTestDatabaseUrl } from "./db-test-helper.js";
import {
  calculateFiscalDocument,
  validateFiscalDocumentWorkflow,
  getNextChainedHash,
  exportSaftAo,
  recordDocumentReprint,
  processFiscalCreditNoteReversal,
  DEFAULT_PROVISIONAL_FISCAL_POLICY,
} from "./fiscal.js";
import { assertImmutableFiscalMutation } from "./fiscal-integrity.js";
import { FiscalArchiveService } from "./fiscal-archive.service.js";

const databaseUrl = await getEffectiveTestDatabaseUrl();
const integration = databaseUrl ? test : test.skip;

integration("PostgreSQL Fiscal Engine: FiscalConfig, Sequence and Multi-rate Calculation", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: {
      legalName: `Fiscal Corp ${suffix}`,
    },
  });

  try {
    const config = await prisma.fiscalConfig.create({
      data: {
        id: `config-${suffix}`,
        companyId: company.id,
        companyName: `Fiscal Corp ${suffix}`,
        companyNif: "5412345678",
        softwareCertificationNumber: "000/AGT/2026",
        softwareVersion: "2.2.2-rc.3",
        baseCurrency: "AOA",
        fiscalRegime: "GERAL",
        invoiceSeries: `F${suffix.slice(0, 3)}`,
        fiscalArchiveRetentionYears: 10,
      },
    });
    assert.equal(config.companyNif, "5412345678");

    const calculation = calculateFiscalDocument({
      lines: [
        {
          productId: `PROD-${suffix}`,
          quantity: 1,
          unitPriceCents: 100000,
          taxRate: 0.14,
          discountCents: 10000,
        },
      ],
      globalDiscountCents: 5000,
      withholdingRate: 0.065,
    });

    assert.equal(calculation.subtotalCents, 100000);
    assert.equal(calculation.discountCents, 15000);
    assert.equal(calculation.taxableBaseCents, 85000);
    assert.equal(calculation.taxCents, 12600);
    assert.equal(calculation.withholdingCents, 5525);
    assert.equal(calculation.totalCents, 97600);
    assert.equal(calculation.netPayableCents, 92075);

    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        sku: `PROD-${suffix}`,
        name: "Consultoria TI",
        priceCents: 100000,
        taxRate: 0.14,
      },
    });

    const sale = await prisma.sale.create({
      data: {
        id: `FT-${suffix}`,
        companyId: company.id,
        number: `FT ${config.invoiceSeries}/${suffix}`,
        series: config.invoiceSeries,
        fiscalType: "INVOICE",
        subtotalCents: calculation.taxableBaseCents,
        taxCents: calculation.taxCents,
        totalCents: calculation.totalCents,
        fiscalHash: "INIT_HASH_TEST_1234",
        status: "COMPLETED",
        lines: {
          create: [
            {
              id: `LINE-${suffix}`,
              productId: product.id,
              quantity: 1,
              unitPriceCents: 100000,
              taxRate: 0.14,
            },
          ],
        },
      },
      include: { lines: true },
    });

    assert.equal(sale.totalCents, 97600);
    assert.equal(sale.lines.length, 1);
  } finally {
    await prisma.saleLine.deleteMany({ where: { sale: { companyId: company.id } } });
    await prisma.sale.deleteMany({ where: { companyId: company.id } });
    await prisma.product.deleteMany({ where: { companyId: company.id } });
    await prisma.fiscalConfig.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

integration("PostgreSQL Fiscal Engine: Concurrent Sequence & Chained Hash Allocation", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: { legalName: `Concurrent Tenant ${suffix}` },
  });

  const series = `C${suffix.slice(0, 3)}`;
  const fiscalYear = 2026;
  const docType = "INVOICE";

  try {
    const seqRecord = await prisma.fiscalSequence.create({
      data: {
        companyId: company.id,
        branchScopeId: "__COMPANY__",
        documentType: docType,
        series,
        fiscalYear,
        nextNumber: 1,
      },
    });
    assert.ok(seqRecord.id);

    // 5 concurrent workers requesting sequence increments atomically
    const allocatedNumbers = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        prisma.$transaction(async (tx) => {
          const current = await tx.fiscalSequence.update({
            where: {
              companyId_branchScopeId_documentType_series_fiscalYear: {
                companyId: company.id,
                branchScopeId: "__COMPANY__",
                documentType: docType,
                series,
                fiscalYear,
              },
            },
            data: { nextNumber: { increment: 1 } },
          });
          return current.nextNumber - 1;
        })
      )
    );

    assert.equal(new Set(allocatedNumbers).size, 5);
    assert.deepEqual(allocatedNumbers.sort((a, b) => a - b), [1, 2, 3, 4, 5]);

    // Test sequential chained hash generation against DB
    const hash1 = await getNextChainedHash(
      {
        companyId: company.id,
        documentType: docType,
        series,
        number: `FT ${series}/1`,
        date: new Date("2026-01-10T10:00:00Z"),
        subtotalCents: 10000,
        taxCents: 1400,
        totalCents: 11400,
      },
      prisma
    );
    assert.ok(hash1.fiscalHash.length >= 10);
    assert.equal(hash1.previousHash, null);

    await prisma.sale.create({
      data: {
        id: `SALE-1-${suffix}`,
        companyId: company.id,
        number: `FT ${series}/1`,
        series,
        fiscalType: docType,
        subtotalCents: 10000,
        taxCents: 1400,
        totalCents: 11400,
        fiscalHash: hash1.fiscalHash,
        status: "COMPLETED",
      },
    });

    const hash2 = await getNextChainedHash(
      {
        companyId: company.id,
        documentType: docType,
        series,
        number: `FT ${series}/2`,
        date: new Date("2026-01-10T10:05:00Z"),
        subtotalCents: 20000,
        taxCents: 2800,
        totalCents: 22800,
      },
      prisma
    );
    assert.equal(hash2.previousHash, hash1.fiscalHash);
    assert.notEqual(hash1.fiscalHash, hash2.fiscalHash);
  } finally {
    await prisma.sale.deleteMany({ where: { companyId: company.id } });
    await prisma.fiscalSequence.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

integration("PostgreSQL Fiscal Engine: Document Workflows (NC, ND, FT->RC Parcial/Total, GT)", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: { legalName: `Workflow Tenant ${suffix}` },
  });

  try {
    // 1. FT (Factura a Crédito de 100.000 Kz)
    const ftValidation = validateFiscalDocumentWorkflow({
      documentType: "FT",
      paymentMethod: "CREDIT",
    });
    assert.equal(ftValidation.valid, true);

    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        name: `Customer RC ${suffix}`,
        nif: "5409999999",
      },
    });

    const invoice = await prisma.sale.create({
      data: {
        id: `FT-DOC-${suffix}`,
        companyId: company.id,
        customerId: customer.id,
        number: `FT A/${suffix}`,
        series: "A",
        fiscalType: "FT",
        subtotalCents: 87719,
        taxCents: 12281,
        totalCents: 100000,
        fiscalHash: "HASH_FT_ORIGINAL",
        status: "COMPLETED",
        dueDate: new Date("2026-12-31"),
      },
    });

    // 2. FT -> RC Parcial (40.000 Kz pagos, 60.000 Kz saldo remanescente)
    const rcParcialValidation = validateFiscalDocumentWorkflow({
      documentType: "RC",
      referencedDocument: {
        documentType: "FT",
        number: invoice.number,
        totalCents: 100000,
        remainingBalanceCents: 60000,
      },
    });
    assert.equal(rcParcialValidation.valid, true);

    const paymentParcial = await prisma.receivablePayment.create({
      data: {
        customerId: customer.id,
        amountCents: 40000,
        paymentMethod: "BANK_TRANSFER",
        idempotencyKey: `rc-parcial-${suffix}`,
        reference: `RC-1 A/${suffix}`,
      },
    });
    assert.equal(paymentParcial.amountCents, 40000);

    // 3. FT -> RC Total (60.000 Kz liquidando a totalidade)
    const rcTotalValidation = validateFiscalDocumentWorkflow({
      documentType: "RC",
      referencedDocument: {
        documentType: "FT",
        number: invoice.number,
        totalCents: 100000,
        remainingBalanceCents: 0,
      },
    });
    assert.equal(rcTotalValidation.valid, true);

    const paymentTotal = await prisma.receivablePayment.create({
      data: {
        customerId: customer.id,
        amountCents: 60000,
        paymentMethod: "CASH",
        idempotencyKey: `rc-total-${suffix}`,
        reference: `RC-2 A/${suffix}`,
      },
    });
    assert.equal(paymentTotal.amountCents, 60000);

    // 4. NC (Nota de Crédito) linked to FT
    const ncValidation = validateFiscalDocumentWorkflow({
      documentType: "NC",
      referencedDocument: {
        documentType: "FT",
        number: invoice.number,
        totalCents: invoice.totalCents,
      },
    });
    assert.equal(ncValidation.valid, true);

    // 5. ND (Nota de Débito) linked to FT
    const ndValidation = validateFiscalDocumentWorkflow({
      documentType: "ND",
      referencedDocument: {
        documentType: "FT",
        number: invoice.number,
        totalCents: invoice.totalCents,
      },
    });
    assert.equal(ndValidation.valid, true);

    // 6. GT (Guia de Transporte) com política configurável
    const gtValidation = validateFiscalDocumentWorkflow({
      documentType: "GT",
      transportInfo: {
        vehiclePlate: "LD-99-44-AA",
        driverName: "Motorista A",
        departureAddress: "Armazém Luanda",
        deliveryAddress: "Loja Viana",
        departureDateTime: "2026-06-01T08:00:00Z",
      },
    });
    assert.equal(gtValidation.valid, true);
  } finally {
    await prisma.receivablePayment.deleteMany({ where: { customer: { companyId: company.id } } });
    await prisma.customer.deleteMany({ where: { companyId: company.id } });
    await prisma.sale.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

integration("PostgreSQL Fiscal Engine: Reversal NC Flow with Idempotent Effects", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: { legalName: `Reversal NC Tenant ${suffix}` },
  });

  try {
    const operator = await prisma.user.create({
      data: {
        email: `op-${suffix}@vendaja.ao`,
        username: `operator-${suffix}`,
        passwordHash: "integration-hash",
        role: "OPERATOR",
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: { code: `WH-${suffix}`, name: "Armazém Teste" },
    });
    const location = await prisma.stockLocation.create({
      data: { warehouseId: warehouse.id, code: "LOC1", name: "Zona 1" },
    });
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        sku: `SKU-REV-${suffix}`,
        name: "Artigo Estornável",
        priceCents: 10000,
        taxRate: 0.14,
      },
    });

    const originalSale = await prisma.sale.create({
      data: {
        id: `SALE-ORIG-${suffix}`,
        companyId: company.id,
        number: `FR A/${suffix}`,
        series: "A",
        fiscalType: "FR",
        subtotalCents: 10000,
        taxCents: 1400,
        totalCents: 11400,
        fiscalHash: "HASH_FR_ORIG",
        status: "COMPLETED",
        lines: {
          create: [
            {
              id: `LINE-ORIG-${suffix}`,
              productId: product.id,
              quantity: 2,
              unitPriceCents: 5000,
              taxRate: 0.14,
            },
          ],
        },
      },
    });

    // Execute Credit Note Reversal Flow
    const reversal = await processFiscalCreditNoteReversal(
      {
        companyId: company.id,
        originalSaleId: originalSale.id,
        creditNoteNumber: `NC A/${suffix}`,
        creditNoteSeries: "A",
        reason: "Devolução integral por defeito de fabrico",
        lines: [
          {
            productId: product.id,
            locationId: location.id,
            quantity: 2,
            unitPriceCents: 5000,
            taxRate: 0.14,
          },
        ],
        operatorId: operator.id,
      },
      prisma
    );

    assert.equal(reversal.creditNote.fiscalType, "NC");
    assert.equal(reversal.creditNote.totalCents, -11400);
    assert.equal(reversal.reversalSummary.reversedTotalCents, 11400);
    assert.equal(reversal.reversalSummary.stockRestored, true);
    assert.ok(reversal.reversalSummary.refundReference?.startsWith("REFUND:NC:"));
    assert.ok(reversal.reversalSummary.accountingReference.startsWith("ACC:NC:"));

    // Verify stock ledger was updated idempotently with CUSTOMER_RETURN
    const balance = await prisma.stockBalance.findUnique({
      where: {
        productId_locationId: { productId: product.id, locationId: location.id },
      },
    });
    assert.ok(balance && balance.quantity === 2);
  } finally {
    await prisma.stockBalance.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLocation.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.saleLine.deleteMany({ where: { sale: { companyId: company.id } } });
    await prisma.sale.deleteMany({ where: { companyId: company.id } });
    await prisma.product.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

integration("PostgreSQL Fiscal Engine: Document Reprint Logging", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: { legalName: `Reprint Tenant ${suffix}` },
  });

  try {
    const user = await prisma.user.create({
      data: {
        email: `op-${suffix}@angola.invalid`,
        username: `op-${suffix}`,
        passwordHash: "hash-test",
        role: "ROLE_OPERATOR",
      },
    });

    const sale = await prisma.sale.create({
      data: {
        id: `SALE-REP-${suffix}`,
        companyId: company.id,
        number: `FT REP/${suffix}`,
        series: "REP",
        fiscalType: "FT",
        subtotalCents: 10000,
        taxCents: 1400,
        totalCents: 11400,
        fiscalHash: "HASH_REP",
        status: "COMPLETED",
      },
    });

    // 1. Primeira reimpressão (2.ª via)
    const reprint1 = await recordDocumentReprint(
      {
        companyId: company.id,
        documentType: "FT",
        documentId: sale.id,
        reason: "Papel encravado na impressora térmica durante a emissão",
        userId: user.id,
      },
      prisma
    );

    assert.equal(reprint1.reprintCount, 1);
    assert.equal(reprint1.disclaimer, "2.ª via emitida em conformidade com o original");

    // 2. Segunda reimpressão (3.ª via)
    const reprint2 = await recordDocumentReprint(
      {
        companyId: company.id,
        documentType: "FT",
        documentId: sale.id,
        reason: "Pedido de segunda via pelo departamento de contabilidade do cliente",
        userId: user.id,
      },
      prisma
    );

    assert.equal(reprint2.reprintCount, 2);

    // Rejeita reimpressão sem motivo válido
    await assert.rejects(
      () =>
        recordDocumentReprint(
          {
            companyId: company.id,
            documentType: "FT",
            documentId: sale.id,
            reason: "   ",
            userId: user.id,
          },
          prisma
        ),
      /reprint_reason_required/
    );
  } finally {
    await prisma.reprintLog.deleteMany({ where: { companyId: company.id } });
    await prisma.sale.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { email: `op-${suffix}@angola.invalid` } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

integration("PostgreSQL Fiscal Engine: Fiscal Archive & Legal Retention Integrity", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: { legalName: `Archive Tenant ${suffix}` },
  });

  try {
    await prisma.fiscalConfig.create({
      data: {
        id: `cfg-arch-${suffix}`,
        companyId: company.id,
        fiscalArchiveRetentionYears: 10,
      },
    });

    const archiveService = new FiscalArchiveService(prisma);
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?><AuditFile><Header><CompanyID>${company.id}</CompanyID></Header></AuditFile>`;

    // 1. Arquivar exportação fiscal estrutural
    const archived = await archiveService.archiveFiscalExport({
      companyId: company.id,
      exportType: "SAFT_AO",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
      content: sampleXml,
      exportedBy: "AUDITOR_USER",
    });

    assert.ok(archived.archiveId);
    assert.equal(archived.retentionYears, 10);
    assert.ok(archived.retentionExpiresAt.getFullYear() >= 2036);

    // 2. Verificar integridade criptográfica intacta
    const verifyIntact = await archiveService.verifyFiscalArchiveIntegrity(
      archived.archiveId,
      sampleXml
    );
    assert.equal(verifyIntact.status, "INTACT");
    assert.equal(verifyIntact.withinMandatoryRetention, true);

    // 3. Detectar violação de integridade por adulteração de conteúdo
    const tamperedXml = sampleXml.replace("AuditFile", "TamperedAuditFile");
    const verifyTampered = await archiveService.verifyFiscalArchiveIntegrity(
      archived.archiveId,
      tamperedXml
    );
    assert.equal(verifyTampered.status, "TAMPERED");

    // 4. Proteger contra expurgo prematuro durante o período de retenção legal
    await assert.rejects(
      () => archiveService.assertCanPurgeArchive(archived.archiveId, new Date("2028-01-01")),
      /fiscal_archive_retention_active/
    );
  } finally {
    await prisma.enterpriseDocument.deleteMany({ where: { companyId: company.id } });
    await prisma.fiscalConfig.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

integration("PostgreSQL Fiscal Engine: SAF-T Export Isolation per Tenant", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);

  const [companyA, companyB] = await Promise.all([
    prisma.company.create({ data: { legalName: `Tenant Alpha ${suffix}` } }),
    prisma.company.create({ data: { legalName: `Tenant Beta ${suffix}` } }),
  ]);

  try {
    await Promise.all([
      prisma.fiscalConfig.create({
        data: {
          id: `cfg-a-${suffix}`,
          companyId: companyA.id,
          companyName: `Tenant Alpha ${suffix}`,
          companyNif: "5401111111",
          invoiceSeries: "A",
        },
      }),
      prisma.fiscalConfig.create({
        data: {
          id: `cfg-b-${suffix}`,
          companyId: companyB.id,
          companyName: `Tenant Beta ${suffix}`,
          companyNif: "5402222222",
          invoiceSeries: "B",
        },
      }),
    ]);

    const [customerA, customerB] = await Promise.all([
      prisma.customer.create({
        data: {
          companyId: companyA.id,
          name: `Customer Alpha ${suffix}`,
          nif: "5409999991",
        },
      }),
      prisma.customer.create({
        data: {
          companyId: companyB.id,
          name: `Customer Beta ${suffix}`,
          nif: "5409999992",
        },
      }),
    ]);

    await Promise.all([
      prisma.sale.create({
        data: {
          id: `SALE-A-${suffix}`,
          companyId: companyA.id,
          number: `FT A/${suffix}`,
          series: "A",
          fiscalType: "INVOICE",
          subtotalCents: 100000,
          taxCents: 14000,
          totalCents: 114000,
          fiscalHash: "HASH_TENANT_A",
          status: "COMPLETED",
          customerId: customerA.id,
        },
      }),
      prisma.sale.create({
        data: {
          id: `SALE-B-${suffix}`,
          companyId: companyB.id,
          number: `FT B/${suffix}`,
          series: "B",
          fiscalType: "INVOICE",
          subtotalCents: 200000,
          taxCents: 28000,
          totalCents: 228000,
          fiscalHash: "HASH_TENANT_B",
          status: "COMPLETED",
          customerId: customerB.id,
        },
      }),
    ]);

    // Export SAF-T exclusively for Tenant Alpha
    const saftXmlAlpha = await exportSaftAo(
      new Date("2026-01-01"),
      new Date("2026-12-31"),
      { companyId: companyA.id, branchId: null },
      prisma
    );

    assert.ok(saftXmlAlpha.includes("<TaxRegistrationNumber>5401111111</TaxRegistrationNumber>"));
    assert.ok(saftXmlAlpha.includes(`FT A/${suffix}`));
    assert.ok(saftXmlAlpha.includes("HASH_TENANT_A"));

    // Verify ZERO leakage of Tenant Beta into Tenant Alpha's SAF-T
    assert.ok(!saftXmlAlpha.includes("5402222222"), "cross_tenant_nif_leak");
    assert.ok(!saftXmlAlpha.includes(`FT B/${suffix}`), "cross_tenant_document_leak");
    assert.ok(!saftXmlAlpha.includes("HASH_TENANT_B"), "cross_tenant_hash_leak");
    assert.ok(!saftXmlAlpha.includes(`Customer Beta ${suffix}`), "cross_tenant_customer_leak");
  } finally {
    await prisma.sale.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.fiscalConfig.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyA.id, companyB.id] } } });
    await prisma.$disconnect();
  }
});

integration("PostgreSQL Fiscal Engine: Document Immutability Guard (Blocks DELETE & CANCELLED)", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: { legalName: `Immutable Guard ${suffix}` },
  });

  try {
    const sale = await prisma.sale.create({
      data: {
        id: `IMM-${suffix}`,
        companyId: company.id,
        number: `FT IMM/${suffix}`,
        series: "IMM",
        fiscalType: "INVOICE",
        subtotalCents: 100000,
        taxCents: 14000,
        totalCents: 114000,
        fiscalHash: "IMMUTABLE_HASH_VAL",
        status: "COMPLETED",
      },
    });

    // Attempting to delete an issued fiscal document must throw
    assert.throws(
      () =>
        assertImmutableFiscalMutation("Sale", "delete", null, { id: sale.id }),
      /immutable_fiscal_sale/
    );

    // Attempting to alter financial value must throw
    assert.throws(
      () =>
        assertImmutableFiscalMutation("Sale", "update", { totalCents: 50000 }, { id: sale.id }),
      /immutable_fiscal_sale_fields:totalCents/
    );

    // Attempting direct cancellation (status = CANCELLED) must throw
    assert.throws(
      () =>
        assertImmutableFiscalMutation(
          "Sale",
          "update",
          { status: "CANCELLED" },
          { id: sale.id }
        ),
      /immutable_fiscal_cancellation_prohibited/
    );

    // Attempting to alter hash must throw
    assert.throws(
      () =>
        assertImmutableFiscalMutation("Sale", "update", { fiscalHash: "TAMPERED_HASH" }, { id: sale.id }),
      /immutable_fiscal_sale_fields:fiscalHash/
    );
  } finally {
    await prisma.sale.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});
