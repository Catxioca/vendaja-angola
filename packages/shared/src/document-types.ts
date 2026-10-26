export type CommercialDocumentType =
  | "FT" // Fatura
  | "FR" // Fatura-Recibo
  | "RC" // Recibo
  | "NC" // Nota de Crédito
  | "ND" // Nota de Débito
  | "FP" // Fatura Proforma / Cotação
  | "EC" // Encomenda de Cliente
  | "GR" // Guia de Remessa
  | "GT" // Guia de Transporte
  | "OC" // Ordem de Compra
  | "POS_X" // Relatório de Turno (Consulta de Caixa X)
  | "POS_Z"; // Fecho Diário de Caixa (Z)

export type PaperFormat = "58mm" | "80mm" | "a5" | "a4" | "letter";

export interface DocumentCompanyInfo {
  name: string;
  tradeName?: string;
  nif: string;
  address: string;
  city?: string;
  province?: string;
  country?: string;
  phone: string;
  email?: string;
  website?: string;
  commercialRegistry?: string;
  shareCapital?: string;
  logoUrl?: string;
  logoText?: string;
  footerText?: string;
  thanksMessage?: string;
  signatureText?: string;
  bankAccounts?: Array<{
    bank: string;
    iban: string;
    swift?: string;
    accountNumber?: string;
  }>;
}

export interface DocumentCustomerInfo {
  name: string;
  nif?: string;
  address?: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  customerCode?: string;
}

export interface DocumentLineItem {
  id?: string;
  code: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPriceCents: number;
  discountPercent?: number;
  discountCents?: number;
  taxRate: number; // 0.14, 0.07, 0.05, 0
  taxExemptionCode?: string;
  taxExemptionReason?: string;
  totalCents: number;
}

export interface DocumentTaxSummaryItem {
  rate: number;
  code?: string;
  baseCents: number;
  taxCents: number;
  exemptionReason?: string;
}

export interface DocumentPaymentDetails {
  method: "CASH" | "CARD" | "TRANSFER" | "CREDIT" | "MIXED";
  methodLabel?: string;
  cashCents?: number;
  cardCents?: number;
  transferCents?: number;
  creditCents?: number;
  tenderedCents?: number;
  changeCents?: number;
}

export interface DocumentTransportInfo {
  vehiclePlate: string;
  driverName?: string;
  driverIdDoc?: string;
  departureAddress: string;
  deliveryAddress: string;
  departureDateTime: string;
  arrivalDateTime?: string;
  transitCodeAGT?: string;
}

export interface DocumentCashSummary {
  openingBalanceCents: number;
  cashInCents: number;
  cashOutCents: number;
  cashSalesCents: number;
  cardSalesCents: number;
  transferSalesCents: number;
  creditSalesCents: number;
  totalSalesCents: number;
  expectedBalanceCents: number;
  actualBalanceCents?: number;
  differenceCents?: number;
  firstDocNumber?: string;
  lastDocNumber?: string;
  salesCount: number;
  voidsCount: number;
  voidsAmountCents: number;
  discountsAmountCents: number;
  accumulatedTurnoverCents?: number; // Totalizador Geral Acumulado (Z)
}

export interface CommercialDocument {
  id: string;
  type: CommercialDocumentType;
  typeName: string;
  series: string;
  number: string;
  date: string; // ISO
  dueDate?: string;
  taxPointDate?: string;
  company: DocumentCompanyInfo;
  customer?: DocumentCustomerInfo;
  lines: DocumentLineItem[];
  subtotalCents: number;
  discountCents: number;
  taxSummary: DocumentTaxSummaryItem[];
  taxTotalCents: number;
  retentionPercent?: number;
  retentionCents?: number;
  totalCents: number;
  paymentDetails?: DocumentPaymentDetails;
  operator?: {
    id?: string;
    name: string;
    terminalId?: string;
    shiftId?: string;
  };
  referenceDocument?: {
    type: string;
    number: string;
    date?: string;
    reason?: string;
  };
  transport?: DocumentTransportInfo;
  cashSummary?: DocumentCashSummary;
  fiscalHash?: string;
  agtCertificate?: string;
  qrPayload?: string;
  notes?: string;
  terms?: string;
  footerText?: string;
  thanksMessage?: string;
  signatureText?: string;
  isDraft?: boolean;
  isCancelled?: boolean;
}

export const DOCUMENT_TYPE_METADATA: Record<
  CommercialDocumentType,
  { label: string; acronym: string; fiscal: boolean; description: string }
> = {
  FT: {
    label: "FATURA COMERCIAL",
    acronym: "FT",
    fiscal: true,
    description: "Fatura a crédito ou com prazo de liquidação.",
  },
  FR: {
    label: "FATURA / RECIBO",
    acronym: "FR",
    fiscal: true,
    description: "Fatura a pronto pagamento (POS / Balcão).",
  },
  RC: {
    label: "RECIBO DE QUITAÇÃO",
    acronym: "RC",
    fiscal: true,
    description: "Comprovativo de liquidação total ou parcial de documentos.",
  },
  NC: {
    label: "NOTA DE CRÉDITO",
    acronym: "NC",
    fiscal: true,
    description: "Documento retificativo de crédito ou regularização a favor do cliente.",
  },
  ND: {
    label: "NOTA DE DÉBITO",
    acronym: "ND",
    fiscal: true,
    description: "Documento retificativo de acréscimo de despesas ou penalizações.",
  },
  FP: {
    label: "FATURA PROFORMA / COTAÇÃO",
    acronym: "FP",
    fiscal: false,
    description: "Proposta comercial sem valor fiscal. Não movimenta stock nem contas correntes.",
  },
  EC: {
    label: "ENCOMENDA DE CLIENTE",
    acronym: "EC",
    fiscal: false,
    description: "Registo de encomenda pendente de entrega ou expedição.",
  },
  GR: {
    label: "GUIA DE REMESSA",
    acronym: "GR",
    fiscal: true,
    description: "Comprovativo de expedição e entrega física de mercadorias.",
  },
  GT: {
    label: "GUIA DE TRANSPORTE",
    acronym: "GT",
    fiscal: true,
    description: "Documento obrigatório de circulação de mercadorias com dados da viatura.",
  },
  OC: {
    label: "ORDEM DE COMPRA",
    acronym: "OC",
    fiscal: false,
    description: "Pedido formal de aquisição de bens ou serviços a fornecedor.",
  },
  POS_X: {
    label: "RELATÓRIO DE TURNO (CONSULTA X)",
    acronym: "X",
    fiscal: false,
    description: "Resumo do operador sem encerramento de período fiscal.",
  },
  POS_Z: {
    label: "FECHO DIÁRIO DE CAIXA (FECHO Z)",
    acronym: "Z",
    fiscal: true,
    description: "Encerramento fiscal diário com totalizadores acumulados irreversíveis.",
  },
};

export const PAPER_FORMAT_INFO: Record<
  PaperFormat,
  { name: string; widthMm: number; heightMm?: number; isRoll: boolean; defaultMarginsMm: number }
> = {
  "58mm": {
    name: "58mm Térmico (Talão Estreito)",
    widthMm: 58,
    isRoll: true,
    defaultMarginsMm: 0,
  },
  "80mm": {
    name: "80mm Térmico (Padrão Retalho / POS)",
    widthMm: 80,
    isRoll: true,
    defaultMarginsMm: 0,
  },
  a5: {
    name: "A5 Compacto (148 × 210 mm)",
    widthMm: 148,
    heightMm: 210,
    isRoll: false,
    defaultMarginsMm: 6,
  },
  a4: {
    name: "A4 Escritório Corporativo (210 × 297 mm)",
    widthMm: 210,
    heightMm: 297,
    isRoll: false,
    defaultMarginsMm: 8,
  },
  letter: {
    name: "Carta / Letter (216 × 279 mm)",
    widthMm: 216,
    heightMm: 279,
    isRoll: false,
    defaultMarginsMm: 8,
  },
};

/**
 * Generates an AGT-compliant fiscal QR code payload string
 */
export function buildAgtQrPayload(params: {
  issuerNif: string;
  customerNif?: string;
  documentType: string;
  documentNumber: string;
  totalCents: number;
  dateIso: string;
  hash: string;
}): string {
  const nifIssuer = params.issuerNif || "999999999";
  const nifCustomer = params.customerNif || "999999999";
  const amountStr = (params.totalCents / 100).toFixed(2);
  const dateStr = params.dateIso.slice(0, 10);
  return `AO|${nifIssuer}|${nifCustomer}|${params.documentType}|${params.documentNumber}|${amountStr}|${dateStr}|${params.hash}`;
}

/**
 * Generates an AGT certified software mention string
 */
export function formatAgtCertificationMention(hash: string, certNumber = "24/AGT/2026"): string {
  const hashPrefix = (hash || "0000").slice(0, 4);
  return `${hashPrefix}-Processado por programa certificado n.º ${certNumber}`;
}

/**
 * Creates realistic sample commercial documents for any of the 12 document types.
 * Useful for WYSIWYG previewing, printer diagnostics, and automated tests.
 */
export function createSampleCommercialDocument(
  type: CommercialDocumentType = "FR",
  companyOverride?: Partial<DocumentCompanyInfo>
): CommercialDocument {
  const company: DocumentCompanyInfo = {
    name: "VendaJá Angola Soluções Comerciais, Lda.",
    tradeName: "VendaJá Angola Enterprise",
    nif: "5417283921",
    address: "Avenida 4 de Fevereiro, n.º 120, 4.º Andar",
    city: "Luanda",
    province: "Luanda",
    country: "Angola",
    phone: "+244 923 000 111",
    email: "suporte@vendaja.ao",
    website: "https://vendaja.ao",
    commercialRegistry: "Conservatória do Registo Comercial de Luanda n.º 12.345/2023",
    shareCapital: "50.000.000,00 Kz",
    bankAccounts: [
      {
        bank: "Banco Angolano de Investimentos (BAI)",
        iban: "AO06.0040.0000.1234.5678.9012.3",
        swift: "BAINAOLA",
      },
      {
        bank: "Banco de Fomento Angola (BFA)",
        iban: "AO06.0006.0000.9876.5432.1098.7",
        swift: "BFANAOLA",
      },
    ],
    ...companyOverride,
  };

  const customer: DocumentCustomerInfo = {
    name: "Consumidor Final / Cliente Geral",
    nif: "999999999",
    address: "Rua Rainha Ginga, n.º 29",
    city: "Luanda",
    province: "Luanda",
    phone: "+244 222 334 455",
    email: "cliente@empresa.ao",
    customerCode: "CLI-0042",
  };

  const now = new Date();
  const dateIso = now.toISOString();
  const dateFormatted = dateIso.slice(0, 10);
  const metadata = DOCUMENT_TYPE_METADATA[type];

  // Specific document samples
  switch (type) {
    case "RC": {
      const subtotalCents = 15000000;
      const totalCents = 15000000;
      const hash = "b712c9e4";
      return {
        id: "sample-rc-001",
        type: "RC",
        typeName: metadata.label,
        series: "RC 2026",
        number: "RC 2026/0122",
        date: dateIso,
        taxPointDate: dateFormatted,
        company,
        customer,
        lines: [
          {
            code: "DOC-LIQ",
            description: "Liquidação integral de Fatura Comercial FT 2026/0142",
            unit: "un",
            quantity: 1,
            unitPriceCents: 15000000,
            taxRate: 0,
            totalCents: 15000000,
          },
        ],
        subtotalCents,
        discountCents: 0,
        taxSummary: [],
        taxTotalCents: 0,
        totalCents,
        paymentDetails: {
          method: "TRANSFER",
          methodLabel: "Transferência Bancária (Comprovativo REF-4921)",
          transferCents: totalCents,
          tenderedCents: totalCents,
          changeCents: 0,
        },
        referenceDocument: {
          type: "Fatura",
          number: "FT 2026/0142",
          date: "2026-09-15",
          reason: "Quitação total de documento comercial",
        },
        operator: { name: "Maria Domingos", terminalId: "TESOURARIA-01" },
        fiscalHash: hash,
        agtCertificate: "24/AGT/2026",
        qrPayload: buildAgtQrPayload({
          issuerNif: company.nif,
          customerNif: customer.nif,
          documentType: "RC",
          documentNumber: "RC 2026/0122",
          totalCents,
          dateIso,
          hash,
        }),
        notes: "Damos plena quitação da quantia supra referenciada respeitante aos documentos indicados.",
      };
    }

    case "ND": {
      const subtotalCents = 1800000;
      const taxTotalCents = Math.round(subtotalCents * 0.14);
      const totalCents = subtotalCents + taxTotalCents;
      const hash = "d48a12ef";
      return {
        id: "sample-nd-001",
        type: "ND",
        typeName: metadata.label,
        series: "ND 2026",
        number: "ND 2026/0009",
        date: dateIso,
        taxPointDate: dateFormatted,
        company,
        customer,
        lines: [
          {
            code: "ENC-001",
            description: "Encargos financeiros e portes de transporte adicional urgente",
            unit: "un",
            quantity: 1,
            unitPriceCents: 1800000,
            taxRate: 0.14,
            totalCents: 1800000,
          },
        ],
        subtotalCents,
        discountCents: 0,
        taxSummary: [{ rate: 0.14, baseCents: subtotalCents, taxCents: taxTotalCents }],
        taxTotalCents,
        totalCents,
        referenceDocument: {
          type: "Fatura",
          number: "FT 2026/0201",
          date: "2026-10-01",
          reason: "Despesas de transporte complementar debitadas ao cliente",
        },
        operator: { name: "Carlos Fernandes", terminalId: "CAIXA-01" },
        fiscalHash: hash,
        agtCertificate: "24/AGT/2026",
        qrPayload: buildAgtQrPayload({
          issuerNif: company.nif,
          customerNif: customer.nif,
          documentType: "ND",
          documentNumber: "ND 2026/0009",
          totalCents,
          dateIso,
          hash,
        }),
        notes: "Valor debitado na conta corrente do cliente nos termos acordados.",
      };
    }

    case "EC": {
      const lines: DocumentLineItem[] = [
        {
          code: "MAT-001",
          description: "Resma de Papel A4 Navigator 80g (Caixa com 5 resmas)",
          unit: "cx",
          quantity: 25,
          unitPriceCents: 1850000,
          taxRate: 0.14,
          totalCents: 46250000,
        },
      ];
      const subtotalCents = 46250000;
      const taxTotalCents = Math.round(subtotalCents * 0.14);
      const totalCents = subtotalCents + taxTotalCents;
      return {
        id: "sample-ec-001",
        type: "EC",
        typeName: metadata.label,
        series: "EC 2026",
        number: "EC 2026/0073",
        date: dateIso,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        company,
        customer,
        lines,
        subtotalCents,
        discountCents: 0,
        taxSummary: [{ rate: 0.14, baseCents: subtotalCents, taxCents: taxTotalCents }],
        taxTotalCents,
        totalCents,
        operator: { name: "Manuel Costa (Comercial)", terminalId: "VENDAS-01" },
        notes: "Encomenda de cliente pendente de separação e expedição no armazém.",
      };
    }

    case "GR": {
      const lines: DocumentLineItem[] = [
        {
          code: "MAT-001",
          description: "Resma de Papel A4 Navigator 80g (Caixa com 5 resmas)",
          unit: "cx",
          quantity: 25,
          unitPriceCents: 1850000,
          taxRate: 0.14,
          totalCents: 46250000,
        },
      ];
      const subtotalCents = 46250000;
      const taxTotalCents = Math.round(subtotalCents * 0.14);
      const totalCents = subtotalCents + taxTotalCents;
      const hash = "e9124a80";
      return {
        id: "sample-gr-001",
        type: "GR",
        typeName: metadata.label,
        series: "GR 2026",
        number: "GR 2026/0051",
        date: dateIso,
        taxPointDate: dateFormatted,
        company,
        customer,
        lines,
        subtotalCents,
        discountCents: 0,
        taxSummary: [{ rate: 0.14, baseCents: subtotalCents, taxCents: taxTotalCents }],
        taxTotalCents,
        totalCents,
        transport: {
          vehiclePlate: "LD-22-44-AB",
          driverName: "Mateus Silva",
          departureAddress: "VendaJá Armazém 1 - Viana",
          deliveryAddress: "Armazém Central - Rua Rainha Ginga, Luanda",
          departureDateTime: new Date().toISOString(),
        },
        operator: { name: "Expedição Armazém", terminalId: "EXP-01" },
        fiscalHash: hash,
        agtCertificate: "24/AGT/2026",
        qrPayload: buildAgtQrPayload({
          issuerNif: company.nif,
          customerNif: customer.nif,
          documentType: "GR",
          documentNumber: "GR 2026/0051",
          totalCents,
          dateIso,
          hash,
        }),
        notes: "Guia de remessa comprovativa da entrega efetiva das mercadorias.",
      };
    }

    case "OC": {
      const lines: DocumentLineItem[] = [
        {
          code: "SUPP-01",
          description: "Aquisição de Toners Originais HP LaserJet Enterprise",
          unit: "un",
          quantity: 10,
          unitPriceCents: 6500000,
          taxRate: 0.14,
          totalCents: 65000000,
        },
      ];
      const subtotalCents = 65000000;
      const taxTotalCents = Math.round(subtotalCents * 0.14);
      const totalCents = subtotalCents + taxTotalCents;
      return {
        id: "sample-oc-001",
        type: "OC",
        typeName: metadata.label,
        series: "OC 2026",
        number: "OC 2026/0019",
        date: dateIso,
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        company,
        customer: {
          name: "Fornecedor HP Angola Distribuição, Lda.",
          nif: "5409182736",
          address: "Talatona Corporate Park, Edifício 2, Luanda",
          phone: "+244 222 778 899",
        },
        lines,
        subtotalCents,
        discountCents: 0,
        taxSummary: [{ rate: 0.14, baseCents: subtotalCents, taxCents: taxTotalCents }],
        taxTotalCents,
        totalCents,
        operator: { name: "Departamento de Compras", terminalId: "COMPRAS-01" },
        notes: "Ordem de compra enviada ao fornecedor com pagamento a 15 dias após entrega.",
      };
    }

    case "NC": {
      const lines: DocumentLineItem[] = [
        {
          code: "SERV-002",
          description: "Devolução parcial - Licença de Software Corporativo Anual",
          unit: "un",
          quantity: 1,
          unitPriceCents: 4500000,
          discountPercent: 0,
          taxRate: 0.14,
          totalCents: 4500000,
        },
      ];
      const subtotalCents = 4500000;
      const taxTotalCents = Math.round(subtotalCents * 0.14);
      const totalCents = subtotalCents + taxTotalCents;
      const hash = "c89f21b7";

      return {
        id: "sample-nc-001",
        type: "NC",
        typeName: metadata.label,
        series: "NC 2026",
        number: "NC 2026/0014",
        date: dateIso,
        taxPointDate: dateFormatted,
        company,
        customer,
        lines,
        subtotalCents,
        discountCents: 0,
        taxSummary: [
          {
            rate: 0.14,
            baseCents: subtotalCents,
            taxCents: taxTotalCents,
          },
        ],
        taxTotalCents,
        totalCents,
        referenceDocument: {
          type: "Fatura",
          number: "FT 2026/0142",
          date: "2026-09-15",
          reason: "Regularização de desconto comercial acordado após emissão",
        },
        operator: { name: "António Silva", terminalId: "CAIXA-01" },
        fiscalHash: hash,
        agtCertificate: "24/AGT/2026",
        qrPayload: buildAgtQrPayload({
          issuerNif: company.nif,
          customerNif: customer.nif,
          documentType: "NC",
          documentNumber: "NC 2026/0014",
          totalCents,
          dateIso,
          hash,
        }),
        notes: "Crédito a deduzir na próxima liquidação de conta corrente do cliente.",
      };
    }

    case "FP": {
      const lines: DocumentLineItem[] = [
        {
          code: "HW-POS-01",
          description: "Terminal POS Táctil 15.6'' Fanless Intel Core i5 / 8GB / 256GB SSD",
          unit: "un",
          quantity: 2,
          unitPriceCents: 48500000,
          discountPercent: 5,
          discountCents: 4850000,
          taxRate: 0.14,
          totalCents: 92150000,
        },
        {
          code: "PRN-TH-80",
          description: "Impressora Térmica de Talões 80mm USB/Ethernet/Serial Auto-Cut",
          unit: "un",
          quantity: 2,
          unitPriceCents: 11500000,
          discountPercent: 0,
          taxRate: 0.14,
          totalCents: 23000000,
        },
      ];
      const subtotalCents = 115150000;
      const discountCents = 4850000;
      const taxTotalCents = Math.round(subtotalCents * 0.14);
      const totalCents = subtotalCents + taxTotalCents;

      return {
        id: "sample-fp-001",
        type: "FP",
        typeName: metadata.label,
        series: "FP 2026",
        number: "FP 2026/0088",
        date: dateIso,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        company,
        customer,
        lines,
        subtotalCents,
        discountCents,
        taxSummary: [
          {
            rate: 0.14,
            baseCents: subtotalCents,
            taxCents: taxTotalCents,
          },
        ],
        taxTotalCents,
        totalCents,
        operator: { name: "Manuel Costa (Comercial)", terminalId: "ESCRITORIO-01" },
        terms:
          "Validade da proposta: 30 dias. Prazo de entrega: 5 dias úteis após confirmação de pagamento. Pagamento: 100% no ato da adjudicação.",
        notes: "ESTE DOCUMENTO NÃO SERVE DE FATURA. NÃO POSSUI EFICÁCIA FISCAL.",
      };
    }

    case "GT": {
      const lines: DocumentLineItem[] = [
        {
          code: "ALIM-001",
          description: "Óleo Vegetal Alimentar 5L (Caixa com 4 unidades)",
          unit: "cx",
          quantity: 120,
          unitPriceCents: 2450000,
          discountPercent: 0,
          taxRate: 0.14,
          totalCents: 294000000,
        },
        {
          code: "ALIM-002",
          description: "Arroz Agulha Extra 25Kg (Saco)",
          unit: "sc",
          quantity: 80,
          unitPriceCents: 3100000,
          discountPercent: 0,
          taxRate: 0.05,
          totalCents: 248000000,
        },
      ];
      const subtotalCents = 542000000;
      const taxTotalCents = Math.round(294000000 * 0.14 + 248000000 * 0.05);
      const totalCents = subtotalCents + taxTotalCents;
      const hash = "a4e1b820";

      return {
        id: "sample-gt-001",
        type: "GT",
        typeName: metadata.label,
        series: "GT 2026",
        number: "GT 2026/0031",
        date: dateIso,
        taxPointDate: dateFormatted,
        company,
        customer,
        lines,
        subtotalCents,
        discountCents: 0,
        taxSummary: [
          { rate: 0.14, baseCents: 294000000, taxCents: Math.round(294000000 * 0.14) },
          { rate: 0.05, baseCents: 248000000, taxCents: Math.round(248000000 * 0.05) },
        ],
        taxTotalCents,
        totalCents,
        transport: {
          vehiclePlate: "LD-84-29-HL",
          driverName: "João Baptista Afonso",
          driverIdDoc: "BI 003928172LA041",
          departureAddress: "Armazém Central VendaJá - Viana, Km 14, Luanda",
          deliveryAddress: "Centro Logístico Geral - Estrada de Cacuaco, Luanda",
          departureDateTime: new Date().toISOString(),
          arrivalDateTime: new Date(Date.now() + 14400000).toISOString(),
          transitCodeAGT: "AGT-TRANS-2026/049182",
        },
        operator: { name: "Pedro Kwanza", terminalId: "LOGISTICA-01" },
        fiscalHash: hash,
        agtCertificate: "24/AGT/2026",
        qrPayload: buildAgtQrPayload({
          issuerNif: company.nif,
          customerNif: customer.nif,
          documentType: "GT",
          documentNumber: "GT 2026/0031",
          totalCents,
          dateIso,
          hash,
        }),
        notes:
          "Documento emitido nos termos do Regime Jurídico de Circulação de Mercadorias em Território Angolano.",
      };
    }

    case "POS_Z": {
      const hash = "9f32b1a8";
      return {
        id: "sample-pos-z-001",
        type: "POS_Z",
        typeName: metadata.label,
        series: "Z 2026",
        number: "Z 2026/0154",
        date: dateIso,
        company,
        lines: [],
        subtotalCents: 41850000,
        discountCents: 150000,
        taxSummary: [
          { rate: 0.14, baseCents: 32000000, taxCents: 4480000 },
          { rate: 0.05, baseCents: 8500000, taxCents: 425000 },
          {
            rate: 0,
            baseCents: 1350000,
            taxCents: 0,
            exemptionReason: "M02 - Isento nos termos do Código do IVA",
          },
        ],
        taxTotalCents: 4905000,
        totalCents: 46755000,
        cashSummary: {
          openingBalanceCents: 5000000,
          cashInCents: 1000000,
          cashOutCents: 500000,
          cashSalesCents: 21500000,
          cardSalesCents: 18255000,
          transferSalesCents: 7000000,
          creditSalesCents: 0,
          totalSalesCents: 46755000,
          expectedBalanceCents: 27000000,
          actualBalanceCents: 27000000,
          differenceCents: 0,
          firstDocNumber: "FR 2026/1020",
          lastDocNumber: "FR 2026/1089",
          salesCount: 69,
          voidsCount: 2,
          voidsAmountCents: 450000,
          discountsAmountCents: 150000,
          accumulatedTurnoverCents: 894520000, // Totalizador acumulado permanente
        },
        operator: { name: "Maria Domingos", terminalId: "POS-01", shiftId: "TURNO-T1" },
        fiscalHash: hash,
        agtCertificate: "24/AGT/2026",
        qrPayload: buildAgtQrPayload({
          issuerNif: company.nif,
          documentType: "POS_Z",
          documentNumber: "Z 2026/0154",
          totalCents: 46755000,
          dateIso,
          hash,
        }),
        notes: "Fecho Diário Z definitivo. Totalizador Geral Acumulado atualizado nos registos fiscais.",
      };
    }

    case "POS_X": {
      return {
        id: "sample-pos-x-001",
        type: "POS_X",
        typeName: metadata.label,
        series: "X 2026",
        number: "X 2026/0042",
        date: dateIso,
        company,
        lines: [],
        subtotalCents: 18450000,
        discountCents: 50000,
        taxSummary: [
          { rate: 0.14, baseCents: 14200000, taxCents: 1988000 },
          { rate: 0.05, baseCents: 4250000, taxCents: 212500 },
        ],
        taxTotalCents: 2200500,
        totalCents: 20650500,
        cashSummary: {
          openingBalanceCents: 5000000,
          cashInCents: 0,
          cashOutCents: 200000,
          cashSalesCents: 10450500,
          cardSalesCents: 8200000,
          transferSalesCents: 2000000,
          creditSalesCents: 0,
          totalSalesCents: 20650500,
          expectedBalanceCents: 15250500,
          actualBalanceCents: 15250500,
          differenceCents: 0,
          firstDocNumber: "FR 2026/1020",
          lastDocNumber: "FR 2026/1045",
          salesCount: 26,
          voidsCount: 0,
          voidsAmountCents: 0,
          discountsAmountCents: 50000,
        },
        operator: { name: "Maria Domingos", terminalId: "POS-01", shiftId: "TURNO-T1" },
        notes: "Leitura provisória X de meio de turno. Não zera contadores fiscais.",
      };
    }

    // Default to Standard Fatura / Fatura-Recibo
    default: {
      const isFR = type === "FR";
      const lines: DocumentLineItem[] = [
        {
          code: "PROD-001",
          description: "Leite UHT Meio Gordo Nido 1L",
          unit: "un",
          quantity: 3,
          unitPriceCents: 185000,
          discountPercent: 0,
          taxRate: 0.14,
          totalCents: 555000,
        },
        {
          code: "PROD-002",
          description: "Café Solúvel Delta Ritmo 200g Frasco",
          unit: "un",
          quantity: 2,
          unitPriceCents: 345000,
          discountPercent: 0,
          taxRate: 0.14,
          totalCents: 690000,
        },
        {
          code: "PROD-003",
          description: "Pão de Forma Tradicional 500g",
          unit: "un",
          quantity: 4,
          unitPriceCents: 75000,
          discountPercent: 0,
          taxRate: 0.05,
          totalCents: 300000,
        },
        {
          code: "PROD-004",
          description: "Água Mineral Chela 1.5L Garrafa",
          unit: "un",
          quantity: 6,
          unitPriceCents: 35000,
          discountPercent: 0,
          taxRate: 0.14,
          totalCents: 210000,
        },
      ];

      const subtotalCents = 1755000;
      const discountCents = 0;
      const taxTotalCents = Math.round((555000 + 690000 + 210000) * 0.14 + 300000 * 0.05);
      const totalCents = subtotalCents + taxTotalCents;
      const hash = "e74a81dc";
      const docNumber = isFR ? "FR AGT2026/001" : "FT 2026/0291";

      return {
        id: "sample-doc-001",
        type: type,
        typeName: metadata.label,
        series: isFR ? "FR AGT2026" : "FT 2026",
        number: docNumber,
        date: dateIso,
        taxPointDate: dateFormatted,
        dueDate: isFR ? dateFormatted : new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        company,
        customer,
        lines,
        subtotalCents,
        discountCents,
        taxSummary: [
          {
            rate: 0.14,
            baseCents: 555000 + 690000 + 210000,
            taxCents: Math.round((555000 + 690000 + 210000) * 0.14),
          },
          {
            rate: 0.05,
            baseCents: 300000,
            taxCents: Math.round(300000 * 0.05),
          },
        ],
        taxTotalCents,
        totalCents,
        paymentDetails: {
          method: "CARD",
          methodLabel: "TPA / Multicaixa",
          cardCents: totalCents,
          tenderedCents: totalCents,
          changeCents: 0,
        },
        operator: {
          name: "Carlos Fernandes",
          terminalId: "POS-01",
        },
        fiscalHash: hash,
        agtCertificate: "24/AGT/2026",
        qrPayload: buildAgtQrPayload({
          issuerNif: company.nif,
          customerNif: customer.nif,
          documentType: isFR ? "FR" : "FT",
          documentNumber: docNumber,
          totalCents,
          dateIso,
          hash,
        }),
        notes:
          "Os bens ou serviços foram colocados à disposição na data do documento. Talão indispensável em caso de troca ou reclamação no prazo legal de 15 dias.",
      };
    }
  }
}

/**
 * Converts a POS Sale record into a complete CommercialDocument
 */
export function saleToCommercialDocument(
  sale: {
    id?: string;
    number?: string;
    lines?: Array<{
      productId: string;
      quantity: number;
      unitPriceCents: number;
      taxRate: number;
      discountPercent?: number;
      description?: string;
      unit?: string;
    }>;
    subtotalCents?: number;
    taxCents?: number;
    totalCents?: number;
    createdAt?: string;
    discountCents?: number;
    paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "CREDIT" | "MIXED";
    cashCents?: number;
    cardCents?: number;
    transferCents?: number;
    tenderedCents?: number;
    changeCents?: number;
    customerName?: string;
    customerNif?: string;
    customerAddress?: string;
    fiscalType?: "INVOICE" | "INVOICE_RECEIPT" | "PROFORMA" | "TRANSPORT_GUIDE" | "CREDIT_NOTE";
    operatorName?: string;
    terminalId?: string;
  },
  companyInfo?: Partial<DocumentCompanyInfo>,
  catalog: Array<{ id: string; name: string; sku?: string | null; barcode?: string | null; brand?: string | null }> = [],
  hash?: string,
  qrPayload?: string
): CommercialDocument {
  const isProforma = sale?.fiscalType === "PROFORMA";
  const isInvoice = sale?.fiscalType === "INVOICE";
  const docType: CommercialDocumentType = isProforma ? "FP" : isInvoice ? "FT" : "FR";
  const metadata = DOCUMENT_TYPE_METADATA[docType] || {
    label: isProforma ? "FATURA PROFORMA" : isInvoice ? "FATURA COMERCIAL" : "FATURA / RECIBO",
    acronym: docType,
    fiscal: !isProforma,
  };

  const safeCompany: DocumentCompanyInfo = {
    name: companyInfo?.name || "Empresa Comercial, Lda.",
    tradeName: companyInfo?.tradeName || companyInfo?.name || "Empresa Comercial",
    nif: companyInfo?.nif || "5000000000",
    address: companyInfo?.address || "Rua Principal, Luanda, Angola",
    city: companyInfo?.city || "Luanda",
    province: companyInfo?.province || "Luanda",
    phone: companyInfo?.phone || "+244 923 000 000",
    email: companyInfo?.email || "comercial@empresa.ao",
    website: companyInfo?.website,
    shareCapital: companyInfo?.shareCapital || "1.000.000 Kz",
    commercialRegistry: companyInfo?.commercialRegistry || "Reg. Comercial Luanda",
    logoUrl: companyInfo?.logoUrl,
    logoText: companyInfo?.logoText || "",
    footerText: companyInfo?.footerText,
    thanksMessage: companyInfo?.thanksMessage || "Obrigado pela sua preferência! Volte sempre.",
    signatureText: companyInfo?.signatureText,
    bankAccounts: companyInfo?.bankAccounts && companyInfo.bankAccounts.length > 0
      ? companyInfo.bankAccounts
      : [
          { bank: "Banco BAI", iban: "AO06 0040 0000 1234 5678 9012 3", swift: "BAIAO2LU" },
          { bank: "Banco BFA", iban: "AO06 0006 0000 9876 5432 1098 7", swift: "BFAAO2LU" },
        ],
  };

  const rawLines = Array.isArray(sale?.lines) ? sale.lines : [];
  const lines: DocumentLineItem[] = rawLines.map((line, idx) => {
    const product = catalog.find((p) => p.id === line.productId);
    const desc = line.description || (product ? `${product.name}${product.brand ? ` · ${product.brand}` : ""}` : (line.productId || `Artigo ${idx + 1}`));
    const code = product?.sku || product?.barcode || line.productId?.slice(0, 8) || `ART-${idx + 1}`;
    const qty = Number(line.quantity) || 1;
    const unitPrice = Number(line.unitPriceCents) || 0;
    const totalCents = Math.round(qty * unitPrice);
    const taxRate = Number(line.taxRate) || 0;
    return {
      id: line.productId || `item-${idx}`,
      code,
      description: desc,
      unit: line.unit || "un",
      quantity: qty,
      unitPriceCents: unitPrice,
      taxRate,
      discountPercent: line.discountPercent || 0,
      totalCents,
      taxExemptionReason: taxRate === 0 ? "M02 - Isento nos termos do Código do IVA" : undefined,
    };
  });

  // Calculate tax breakdown:
  // Detect whether lines are net pre-tax base amounts or gross retail PVP amounts.
  const linesSum = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const isNetBaseSale =
    sale?.subtotalCents !== undefined &&
    Math.abs(sale.subtotalCents - linesSum) <= 5 &&
    sale?.totalCents !== undefined &&
    sale.totalCents > linesSum;

  const taxSummaryMap = new Map<number, { baseCents: number; taxCents: number }>();
  for (const line of lines) {
    const rate = Number(line.taxRate);
    const current = taxSummaryMap.get(rate) || { baseCents: 0, taxCents: 0 };
    const lineGross = line.totalCents;
    const lineBase = isNetBaseSale
      ? lineGross
      : rate > 0
      ? Math.round(lineGross / (1 + rate))
      : lineGross;
    const lineTax = isNetBaseSale
      ? Math.round(lineGross * rate)
      : lineGross - lineBase;
    current.baseCents += lineBase;
    current.taxCents += lineTax;
    taxSummaryMap.set(rate, current);
  }

  const taxSummary: DocumentTaxSummaryItem[] = Array.from(taxSummaryMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([rate, vals]) => ({
      rate,
      baseCents: vals.baseCents,
      taxCents: vals.taxCents,
      exemptionReason: rate === 0 ? "M02 - Isento nos termos do Código do IVA" : undefined,
    }));

  const method = sale?.paymentMethod || "CASH";
  const methodLabel =
    method === "CASH"
      ? "Dinheiro / Numerário"
      : method === "CARD"
      ? "TPA / Multicaixa"
      : method === "TRANSFER"
      ? "Transferência Bancária"
      : method === "CREDIT"
      ? "Venda a Crédito"
      : "Pagamento Misto";

  const totalCents = sale?.totalCents ?? lines.reduce((sum, l) => sum + l.totalCents, 0);
  const taxCents = sale?.taxCents ?? Array.from(taxSummaryMap.values()).reduce((sum, t) => sum + t.taxCents, 0);
  const discountCents = sale?.discountCents ?? 0;
  const subtotalCents = sale?.subtotalCents ?? Math.max(0, totalCents - taxCents + discountCents);

  const tenderCents = sale?.tenderedCents ?? (
    sale?.paymentMethod === "CASH"
      ? (sale?.cashCents && sale.cashCents > 0 ? sale.cashCents : totalCents)
      : sale?.paymentMethod === "CARD"
      ? (sale?.cardCents && sale.cardCents > 0 ? sale.cardCents : totalCents)
      : sale?.paymentMethod === "TRANSFER"
      ? (sale?.transferCents && sale.transferCents > 0 ? sale.transferCents : totalCents)
      : sale?.paymentMethod === "CREDIT"
      ? 0
      : ((sale?.cashCents ?? 0) + (sale?.cardCents ?? 0) + (sale?.transferCents ?? 0) || totalCents)
  );

  const changeCents = sale?.changeCents ?? (
    (sale?.paymentMethod === "CASH" || sale?.paymentMethod === "MIXED")
      ? Math.max(0, tenderCents - totalCents)
      : 0
  );

  const dateStr = sale?.createdAt || new Date().toISOString();
  const safeNumber = sale?.number || `${docType} ${new Date(dateStr).getFullYear()}/0001`;
  const series = safeNumber.split("/")[0] || (isProforma ? "FP 2026" : "FR 2026");
  const computedHash = hash || "--------";
  const computedQr =
    qrPayload ||
    buildAgtQrPayload({
      issuerNif: safeCompany.nif,
      customerNif: sale?.customerNif,
      documentType: docType,
      documentNumber: safeNumber,
      totalCents: totalCents,
      dateIso: dateStr,
      hash: computedHash,
    });

  return {
    id: sale?.id || `doc-${Date.now()}`,
    type: docType,
    typeName: metadata.label,
    series,
    number: safeNumber,
    date: dateStr,
    taxPointDate: dateStr.slice(0, 10),
    company: safeCompany,
    customer: {
      name: sale?.customerName || "Consumidor Final",
      nif: sale?.customerNif || "999999999",
      address: sale?.customerAddress || "Luanda, Angola",
    },
    lines,
    subtotalCents,
    discountCents,
    taxSummary,
    taxTotalCents: taxCents,
    totalCents,
    paymentDetails: {
      method,
      methodLabel,
      cashCents: sale?.cashCents,
      cardCents: sale?.cardCents,
      transferCents: sale?.transferCents,
      tenderedCents: tenderCents,
      changeCents,
    },
    operator: {
      name: sale?.operatorName || "Operador do Sistema",
      terminalId: sale?.terminalId || "01",
    },
    fiscalHash: isProforma ? undefined : computedHash,
    agtCertificate: isProforma ? undefined : "24/AGT/2026",
    qrPayload: isProforma ? undefined : computedQr,
    notes: isProforma
      ? "Este documento não serve de fatura / Isento de validação fiscal."
      : "Os bens ou serviços foram colocados à disposição na data do documento. Talão indispensável em caso de troca ou reclamação no prazo de 15 dias.",
    footerText: companyInfo?.footerText || safeCompany.footerText,
    thanksMessage: companyInfo?.thanksMessage || safeCompany.thanksMessage,
    signatureText: companyInfo?.signatureText || safeCompany.signatureText,
  };
}
