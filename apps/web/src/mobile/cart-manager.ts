import type { FiscalDocumentType, PaymentMethod, Product } from "@angola/shared";

export interface MobileCartLine {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  taxRate?: number;
  hasTaxPolicy: boolean;
  exemptionCode?: string | null;
  lineTotalCents: number;
  lineTaxCents: number;
}

export interface CartCustomer {
  id: string;
  name: string;
  nif?: string | null;
  creditLimitCents?: number;
  outstandingDebtCents?: number;
}

export interface TenantFiscalPolicy {
  version?: number | string;
  defaultTaxRate?: number;
  exemptionReasons?: Record<string, string>;
  isTaxConfigured: boolean;
}

export interface IndicativeCartTotals {
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  itemCount: number;
  hasTaxPolicy: boolean;
  taxNotice?: string;
  totalNotice?: string;
}

export interface PaymentExecutionPlan {
  idempotencyKey: string;
  paymentMethod: PaymentMethod;
  fiscalType: FiscalDocumentType;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  tenderedCents: number;
  changeCents: number;
  customer: CartCustomer | null;
  dueDate: string | null;
  cashSessionId: string | null;
  tpaAuthorizationCode?: string;
  transferReference?: string;
  hasTaxPolicy: boolean;
  taxNotice?: string;
  totalNotice?: string;
}

export class MobileCartManager {
  private lines: MobileCartLine[] = [];
  private discountCents: number = 0;
  private customer: CartCustomer | null = null;
  private fiscalType: FiscalDocumentType = "INVOICE_RECEIPT";
  private currentSaleIdempotencyKey: string | null = null;
  private fiscalPolicy: TenantFiscalPolicy | null = null;

  public getLines(): MobileCartLine[] {
    return [...this.lines];
  }

  public getCustomer(): CartCustomer | null {
    return this.customer;
  }

  public setCustomer(customer: CartCustomer | null): void {
    this.customer = customer;
  }

  public getFiscalType(): FiscalDocumentType {
    return this.fiscalType;
  }

  public setFiscalType(type: FiscalDocumentType): void {
    this.fiscalType = type;
  }

  public getDiscountCents(): number {
    return this.discountCents;
  }

  public setDiscountCents(amount: number): void {
    this.discountCents = Math.max(0, Math.round(amount));
  }

  public setFiscalPolicy(policy: TenantFiscalPolicy | null): void {
    this.fiscalPolicy = policy;
    this.recalculateAll();
  }

  public getFiscalPolicy(): TenantFiscalPolicy | null {
    return this.fiscalPolicy;
  }

  /**
   * Obtém ou inicializa a chave de idempotência estável criada no momento de criação local da venda.
   * A chave é preservada e reutilizada em cada retry, timeout e reinício.
   */
  public getOrCreateSaleIdempotencyKey(terminalId?: string): string {
    if (!this.currentSaleIdempotencyKey) {
      const term = terminalId || "01";
      const now = Date.now();
      const randomSuffix = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : `${Math.floor(Math.random() * 1000000)}`;
      this.currentSaleIdempotencyKey = `sale-mob-${term}-${now}-${randomSuffix}`;
    }
    return this.currentSaleIdempotencyKey;
  }

  public setSaleIdempotencyKey(key: string): void {
    this.currentSaleIdempotencyKey = key;
  }

  /**
   * Adiciona um produto ao carrinho. Se já existir, incrementa a quantidade.
   * Não assume nenhuma taxa fixa de 14%; utiliza exclusivamente política fiscal
   * configurada no produto ou sincronizada no tenant.
   */
  public addProduct(product: Product, quantity = 1): void {
    if (quantity <= 0) return;

    // Inicializa chave estável no momento da primeira ação na venda
    this.getOrCreateSaleIdempotencyKey();

    const existing = this.lines.find((l) => l.productId === product.id);
    if (existing) {
      existing.quantity += quantity;
      this.recalculateLine(existing);
    } else {
      const hasProductTax = typeof product.taxRate === "number";
      const resolvedTaxRate = hasProductTax
        ? product.taxRate
        : (this.fiscalPolicy?.isTaxConfigured && typeof this.fiscalPolicy.defaultTaxRate === "number"
            ? this.fiscalPolicy.defaultTaxRate
            : undefined);

      const hasTaxPolicy = typeof resolvedTaxRate === "number";

      const newLine: MobileCartLine = {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity,
        taxRate: resolvedTaxRate,
        hasTaxPolicy,
        exemptionCode: product.exemptionCode,
        lineTotalCents: 0,
        lineTaxCents: 0,
      };
      this.recalculateLine(newLine);
      this.lines.push(newLine);
    }
  }

  /**
   * Atualiza a quantidade de uma linha diretamente.
   */
  public updateLineQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeLine(productId);
      return;
    }
    const line = this.lines.find((l) => l.productId === productId);
    if (line) {
      line.quantity = Math.round(quantity);
      this.recalculateLine(line);
    }
  }

  /**
   * Remove uma linha do carrinho.
   */
  public removeLine(productId: string): void {
    this.lines = this.lines.filter((l) => l.productId !== productId);
    if (this.lines.length === 0) {
      this.currentSaleIdempotencyKey = null;
    }
  }

  /**
   * Limpa todo o carrinho e reinicializa a chave da venda concluída ou cancelada.
   */
  public clear(): void {
    this.lines = [];
    this.discountCents = 0;
    this.customer = null;
    this.fiscalType = "INVOICE_RECEIPT";
    this.currentSaleIdempotencyKey = null;
  }

  private recalculateAll(): void {
    for (const line of this.lines) {
      this.recalculateLine(line);
    }
  }

  private recalculateLine(line: MobileCartLine): void {
    const gross = line.quantity * line.unitPriceCents;
    line.lineTotalCents = gross;
    if (typeof line.taxRate === "number") {
      line.lineTaxCents = Math.round(gross * line.taxRate);
      line.hasTaxPolicy = true;
    } else {
      line.lineTaxCents = 0;
      line.hasTaxPolicy = false;
    }
  }

  /**
   * Executa cálculo local indicativo.
   * Se a política fiscal não estiver disponível offline, reporta explicitamente
   * "impostos sujeitos a validação central", sem assumir taxa arbitrária.
   */
  public getIndicativeTotals(): IndicativeCartTotals {
    const subtotalCents = this.lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
    const hasTaxPolicy =
      this.lines.length > 0 && this.lines.every((l) => l.hasTaxPolicy && typeof l.taxRate === "number");
    const taxCents = this.lines.reduce((sum, l) => sum + l.lineTaxCents, 0);
    const cappedDiscount = Math.min(this.discountCents, subtotalCents);
    const totalCents = Math.max(0, subtotalCents + taxCents - cappedDiscount);
    const itemCount = this.lines.reduce((sum, l) => sum + l.quantity, 0);

    return {
      subtotalCents,
      taxCents,
      discountCents: cappedDiscount,
      totalCents,
      itemCount,
      hasTaxPolicy,
      taxNotice: hasTaxPolicy
        ? undefined
        : "impostos sujeitos a validação central (taxCents=0 não é imposto final)",
      totalNotice: hasTaxPolicy ? undefined : "Total provisório sujeito a validação central",
    };
  }

  public calculateTotals(): IndicativeCartTotals {
    return this.getIndicativeTotals();
  }

  /**
   * Valida o plano de pagamento antes de submeter para a outbox ou backend.
   */
  public validatePayment(plan: {
    paymentMethod: PaymentMethod;
    tenderedCents?: number;
    cashSessionId?: string | null;
    dueDate?: string | null;
    tpaAuthorizationCode?: string;
    transferReference?: string;
    idempotencyKey?: string;
  }): PaymentExecutionPlan {
    const totals = this.getIndicativeTotals();
    if (this.lines.length === 0 || totals.totalCents <= 0) {
      throw new Error("O carrinho não pode estar vazio para cobrança.");
    }

    let cashCents = 0;
    let cardCents = 0;
    let transferCents = 0;
    let tenderedCents = plan.tenderedCents ?? totals.totalCents;
    let changeCents = 0;
    let computedFiscalType: FiscalDocumentType = this.fiscalType;

    if (plan.paymentMethod === "CASH") {
      cashCents = totals.totalCents;
      if (tenderedCents < totals.totalCents) {
        throw new Error(
          `Valor entregue (${tenderedCents / 100} Kz) é inferior ao total da venda (${totals.totalCents / 100} Kz).`
        );
      }
      changeCents = tenderedCents - totals.totalCents;
    } else if (plan.paymentMethod === "CARD") {
      cardCents = totals.totalCents;
      tenderedCents = totals.totalCents;
    } else if (plan.paymentMethod === "TRANSFER") {
      transferCents = totals.totalCents;
      tenderedCents = totals.totalCents;
    } else if (plan.paymentMethod === "CREDIT") {
      // Regra de integridade estrita: Venda a crédito exige cliente registado e data de vencimento futura
      if (!this.customer?.id) {
        throw new Error("Vendas a crédito exigem obrigatoriamente a seleção de um cliente registado.");
      }
      if (!plan.dueDate) {
        throw new Error("Vendas a crédito exigem obrigatoriamente uma data de vencimento.");
      }
      const due = new Date(plan.dueDate);
      if (due <= new Date()) {
        throw new Error("A data de vencimento para venda a crédito deve ser uma data futura.");
      }
      tenderedCents = 0;
      computedFiscalType = "INVOICE";
    }

    const stableKey = plan.idempotencyKey || this.getOrCreateSaleIdempotencyKey();

    return {
      idempotencyKey: stableKey,
      paymentMethod: plan.paymentMethod,
      fiscalType: computedFiscalType,
      totalCents: totals.totalCents,
      cashCents,
      cardCents,
      transferCents,
      tenderedCents,
      changeCents,
      customer: this.customer,
      dueDate: plan.dueDate ?? null,
      cashSessionId: plan.cashSessionId ?? null,
      tpaAuthorizationCode: plan.tpaAuthorizationCode,
      transferReference: plan.transferReference,
      hasTaxPolicy: totals.hasTaxPolicy,
      taxNotice: totals.taxNotice,
      totalNotice: totals.totalNotice,
    };
  }

  public buildPaymentPlan(plan: {
    paymentMethod: PaymentMethod;
    tenderedCents?: number;
    cashSessionId?: string | null;
    dueDate?: string | null;
    tpaAuthorizationCode?: string;
    transferReference?: string;
    idempotencyKey?: string;
  }): PaymentExecutionPlan {
    return this.validatePayment(plan);
  }
}
