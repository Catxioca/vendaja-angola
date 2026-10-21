import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";

export interface ParsedStatementLine {
  transactionDate: Date;
  valueDate?: Date;
  description: string;
  reference?: string;
  fitid?: string;
  amountCents: number;
  direction: "IN" | "OUT";
  balanceCents?: number;
}

export interface ParsedBankStatement {
  statementDate: Date;
  openingBalanceCents: number;
  closingBalanceCents: number;
  lines: ParsedStatementLine[];
}

export class BankReconciliationService {
  /**
   * Parse OFX bank statement content (XML/SGML-like structure)
   */
  static parseOfx(rawContent: string): ParsedBankStatement {
    const lines: ParsedStatementLine[] = [];
    let openingBalanceCents = 0;
    let closingBalanceCents = 0;

    // Parse LEDGERBAL (closing balance)
    const balAmtMatch = rawContent.match(/<BALAMT>([-\d.,]+)/i);
    if (balAmtMatch && balAmtMatch[1]) {
      closingBalanceCents = Math.round(parseFloat(balAmtMatch[1].replace(",", ".")) * 100);
    }

    // Match each STMTTRN block
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match: RegExpExecArray | null;

    while ((match = trnRegex.exec(rawContent)) !== null) {
      const block = match[1];
      if (!block) continue;

      const dtPostedMatch = block.match(/<DTPOSTED>(\d{8,14})/i);
      const trnAmtMatch = block.match(/<TRNAMT>([-\d.,]+)/i);
      const fitidMatch = block.match(/<FITID>([^<\r\n]+)/i);
      const nameMatch = block.match(/<NAME>([^<\r\n]+)/i);
      const memoMatch = block.match(/<MEMO>([^<\r\n]+)/i);

      if (dtPostedMatch && dtPostedMatch[1] && trnAmtMatch && trnAmtMatch[1]) {
        const rawDate = dtPostedMatch[1];
        const year = parseInt(rawDate.substring(0, 4), 10);
        const month = parseInt(rawDate.substring(4, 6), 10) - 1;
        const day = parseInt(rawDate.substring(6, 8), 10);
        const transactionDate = new Date(year, month, day);

        const rawAmount = parseFloat(trnAmtMatch[1].replace(",", "."));
        const amountCents = Math.round(Math.abs(rawAmount) * 100);
        const direction: "IN" | "OUT" = rawAmount >= 0 ? "IN" : "OUT";

        const nameStr = nameMatch && nameMatch[1] ? nameMatch[1].trim() : "";
        const memoStr = memoMatch && memoMatch[1] ? memoMatch[1].trim() : "";
        const description = (nameStr + (memoStr ? " " + memoStr : "")).trim() || "Movimento Bancário";
        const fitid = fitidMatch && fitidMatch[1] ? fitidMatch[1].trim() : undefined;

        lines.push({
          transactionDate,
          description,
          amountCents,
          direction,
          fitid,
          reference: fitid,
        });
      }
    }

    const netFlow = lines.reduce((acc, l) => acc + (l.direction === "IN" ? l.amountCents : -l.amountCents), 0);
    openingBalanceCents = closingBalanceCents - netFlow;

    return {
      statementDate: lines.length > 0 && lines[lines.length - 1] ? lines[lines.length - 1]!.transactionDate : new Date(),
      openingBalanceCents,
      closingBalanceCents,
      lines,
    };
  }

  /**
   * Parse SWIFT MT940 bank statement format
   */
  static parseMt940(rawContent: string): ParsedBankStatement {
    const lines: ParsedStatementLine[] = [];
    let openingBalanceCents = 0;
    let closingBalanceCents = 0;
    let statementDate = new Date();

    const textLines = rawContent.split(/\r?\n/);
    let currentLine: Partial<ParsedStatementLine> | null = null;

    for (let i = 0; i < textLines.length; i++) {
      const line = (textLines[i] ?? "").trim();

      // :60F: or :60M: Opening Balance: :60F:C260101AOA1000000,00
      if (line.startsWith(":60F:") || line.startsWith(":60M:")) {
        const dOrC = line.substring(5, 6);
        const valStr = line.substring(15).replace(",", ".");
        const val = parseFloat(valStr) || 0;
        openingBalanceCents = Math.round(val * 100) * (dOrC === "D" ? -1 : 1);
      }

      // :61: Statement Line
      if (line.startsWith(":61:")) {
        if (currentLine && currentLine.amountCents !== undefined) {
          lines.push(currentLine as ParsedStatementLine);
        }

        const sub = line.substring(4);
        const match61 = sub.match(/^(\d{2})(\d{2})(\d{2})(?:\d{4})?(CR|DR|C|D|RC|RD)([0-9]+(?:[.,][0-9]{2})?)/i);
        let transactionDate = new Date();
        let dOrC: "IN" | "OUT" = "IN";
        let amt = 0;

        if (match61 && match61[1] && match61[2] && match61[3] && match61[4] && match61[5]) {
          const year = 2000 + parseInt(match61[1], 10);
          const month = parseInt(match61[2], 10) - 1;
          const day = parseInt(match61[3], 10);
          transactionDate = new Date(year, month, day);
          dOrC = match61[4].toUpperCase().includes("D") ? "OUT" : "IN";
          amt = parseFloat(match61[5].replace(",", "."));
        } else {
          const year = 2000 + parseInt(sub.substring(0, 2), 10);
          const month = parseInt(sub.substring(2, 4), 10) - 1;
          const day = parseInt(sub.substring(4, 6), 10);
          transactionDate = new Date(year, month, day);
          const amtMatch = sub.match(/([0-9]+,[0-9]{2})/);
          amt = amtMatch && amtMatch[1] ? parseFloat(amtMatch[1].replace(",", ".")) : 0;
          dOrC = sub.includes("DR") ? "OUT" : "IN";
        }

        currentLine = {
          transactionDate,
          direction: dOrC,
          amountCents: Math.round(amt * 100),
          description: "Movimento MT940",
          reference: sub.includes("//") ? sub.split("//")[1] : undefined,
        };
      }

      // :86: Information to Account Owner
      if (line.startsWith(":86:") && currentLine) {
        currentLine.description = line.substring(4).trim();
      }

      // :62F: Closing Balance
      if (line.startsWith(":62F:") || line.startsWith(":62M:")) {
        const dOrC = line.substring(5, 6);
        const valStr = line.substring(15).replace(",", ".");
        const val = parseFloat(valStr) || 0;
        closingBalanceCents = Math.round(val * 100) * (dOrC === "D" ? -1 : 1);
        statementDate = new Date();
      }
    }

    if (currentLine && currentLine.amountCents !== undefined) {
      lines.push(currentLine as ParsedStatementLine);
    }

    return {
      statementDate,
      openingBalanceCents,
      closingBalanceCents,
      lines,
    };
  }

  /**
   * Parse generic Excel/CSV rows
   */
  static parseTabular(
    rows: Array<{ date: string; description: string; amount: number | string; reference?: string; direction?: string }>
  ): ParsedBankStatement {
    const lines: ParsedStatementLine[] = [];
    let net = 0;

    for (const r of rows) {
      const numAmount = typeof r.amount === "string" ? parseFloat(r.amount.replace(",", ".")) : r.amount;
      const absAmount = Math.abs(numAmount || 0);
      const amountCents = Math.round(absAmount * 100);
      const dir: "IN" | "OUT" = r.direction === "OUT" || numAmount < 0 ? "OUT" : "IN";
      const date = new Date(r.date);

      lines.push({
        transactionDate: isNaN(date.getTime()) ? new Date() : date,
        description: r.description || "Transação Bancária",
        amountCents,
        direction: dir,
        reference: r.reference,
        fitid: r.reference || `TAB-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      });

      net += dir === "IN" ? amountCents : -amountCents;
    }

    return {
      statementDate: lines.length > 0 && lines[lines.length - 1] ? lines[lines.length - 1]!.transactionDate : new Date(),
      openingBalanceCents: 0,
      closingBalanceCents: net,
      lines,
    };
  }

  /**
   * Import bank statement into database
   */
  static async importStatement(
    bankAccountId: string,
    filename: string,
    fileFormat: "OFX" | "MT940" | "EXCEL" | "CSV",
    rawContent: string | Array<any>,
    companyId?: string
  ) {
    let parsed: ParsedBankStatement;
    if (fileFormat === "OFX") {
      parsed = this.parseOfx(typeof rawContent === "string" ? rawContent : "");
    } else if (fileFormat === "MT940") {
      parsed = this.parseMt940(typeof rawContent === "string" ? rawContent : "");
    } else {
      parsed = this.parseTabular(Array.isArray(rawContent) ? rawContent : []);
    }

    const refHash = `STMT-${bankAccountId.substring(0, 8)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const statement = await prisma.bankStatement.create({
      data: {
        bankAccountId,
        referenceHash: refHash,
        statementDate: parsed.statementDate,
        openingBalanceCents: parsed.openingBalanceCents,
        closingBalanceCents: parsed.closingBalanceCents,
        filename,
        fileFormat,
        status: "IMPORTED",
        lines: {
          create: parsed.lines.map((l) => ({
            lineHash: l.fitid || `LINE-${Math.random().toString(36).substring(2, 10)}`,
            occurredAt: l.transactionDate,
            description: l.description,
            amountCents: l.amountCents,
            direction: l.direction,
            fitid: l.fitid,
            reference: l.reference,
            reconciled: false,
          })),
        },
      },
      include: { lines: true },
    });

    await EnterpriseAuditService.record({
      action: "BANK_STATEMENT_IMPORTED",
      module: "FINANCE",
      entity: "BankStatement",
      entityId: statement.id,
      companyId,
      newValue: { filename, lineCount: statement.lines.length, closingBalanceCents: parsed.closingBalanceCents },
    });

    return statement;
  }

  /**
   * Run automatic reconciliation engine on an imported statement
   */
  static async autoReconcile(reconciliationId: string, companyId?: string) {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: {
        bankAccount: true,
      },
    });

    if (!reconciliation) throw new Error("Processo de reconciliação não encontrado.");

    const statementLines = await prisma.bankStatementLine.findMany({
      where: {
        statement: { bankAccountId: reconciliation.bankAccountId },
        occurredAt: { gte: reconciliation.periodFrom, lte: reconciliation.periodTo },
        reconciled: false,
      },
    });

    const [receivablePayments, payablePayments, sales] = await Promise.all([
      prisma.receivablePayment.findMany({
        where: {
          receivedAt: { gte: reconciliation.periodFrom, lte: reconciliation.periodTo },
          ...(companyId ? { customer: { companyId } } : {}),
        },
      }),
      prisma.payablePayment.findMany({
        where: {
          paidAt: { gte: reconciliation.periodFrom, lte: reconciliation.periodTo },
          ...(companyId ? { payable: { purchase: { companyId } } } : {}),
        },
      }),
      prisma.sale.findMany({
        where: {
          createdAt: { gte: reconciliation.periodFrom, lte: reconciliation.periodTo },
          paymentMethod: { in: ["CARD", "TRANSFER"] },
          status: { not: "CANCELLED" },
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, number: true, createdAt: true, totalCents: true, cardCents: true, transferCents: true },
      }),
    ]);

    let matchedCount = 0;
    const matchesCreated = [];

    for (const stmtLine of statementLines) {
      if (stmtLine.direction === "IN") {
        const foundRec = receivablePayments.find(
          (rp) =>
            rp.amountCents === stmtLine.amountCents &&
            Math.abs(rp.receivedAt.getTime() - stmtLine.occurredAt.getTime()) <= 3 * 86400000
        );

        if (foundRec) {
          const match = await prisma.bankReconciliationMatch.create({
            data: {
              reconciliationId,
              statementLineId: stmtLine.id,
              matchType: "AUTO_EXACT",
              confidenceScore: 0.95,
              matchedEntity: "RECEIVABLE_PAYMENT",
              matchedEntityId: foundRec.id,
              matchedAmountCents: foundRec.amountCents,
            },
          });

          await prisma.bankStatementLine.update({
            where: { id: stmtLine.id },
            data: { reconciled: true },
          });

          matchedCount++;
          matchesCreated.push(match);
          continue;
        }

        const foundSale = sales.find(
          (s) =>
            (s.transferCents === stmtLine.amountCents || s.cardCents === stmtLine.amountCents) &&
            Math.abs(s.createdAt.getTime() - stmtLine.occurredAt.getTime()) <= 3 * 86400000
        );

        if (foundSale) {
          const match = await prisma.bankReconciliationMatch.create({
            data: {
              reconciliationId,
              statementLineId: stmtLine.id,
              matchType: "AUTO_SUGGESTED",
              confidenceScore: 0.9,
              matchedEntity: "SALE",
              matchedEntityId: foundSale.id,
              matchedAmountCents: stmtLine.amountCents,
            },
          });

          await prisma.bankStatementLine.update({
            where: { id: stmtLine.id },
            data: { reconciled: true },
          });

          matchedCount++;
          matchesCreated.push(match);
          continue;
        }
      }

      if (stmtLine.direction === "OUT") {
        const foundPay = payablePayments.find(
          (pp) =>
            pp.amountCents === stmtLine.amountCents &&
            Math.abs(pp.paidAt.getTime() - stmtLine.occurredAt.getTime()) <= 3 * 86400000
        );

        if (foundPay) {
          const match = await prisma.bankReconciliationMatch.create({
            data: {
              reconciliationId,
              statementLineId: stmtLine.id,
              matchType: "AUTO_EXACT",
              confidenceScore: 0.95,
              matchedEntity: "PAYABLE_PAYMENT",
              matchedEntityId: foundPay.id,
              matchedAmountCents: foundPay.amountCents,
            },
          });

          await prisma.bankStatementLine.update({
            where: { id: stmtLine.id },
            data: { reconciled: true },
          });

          matchedCount++;
          matchesCreated.push(match);
          continue;
        }
      }
    }

    logger.info("FINANCE", "BANK_RECONCILIATION_COMPLETED", "Automatic bank reconciliation completed", {
      metadata: { reconciliationId, matchedCount, totalLines: statementLines.length },
    });

    return {
      reconciliationId,
      matchedCount,
      totalLines: statementLines.length,
      matches: matchesCreated,
    };
  }

  /**
   * Generates comprehensive bank reconciliation report
   */
  static async getReconciliationReport(reconciliationId: string) {
    const rec = await prisma.bankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: {
        bankAccount: true,
        matches: {
          include: {
            statementLine: true,
          },
        },
      },
    });

    if (!rec) throw new Error("Reconciliação não encontrada.");

    const unmatchedStatementLines = await prisma.bankStatementLine.findMany({
      where: {
        statement: { bankAccountId: rec.bankAccountId },
        occurredAt: { gte: rec.periodFrom, lte: rec.periodTo },
        reconciled: false,
      },
    });

    const matchedTotalCents = rec.matches.reduce((sum, m) => sum + m.matchedAmountCents, 0);
    const unmatchedStmtTotalCents = unmatchedStatementLines.reduce((sum, l) => sum + l.amountCents, 0);

    return {
      reconciliation: {
        id: rec.id,
        bankAccountName: rec.bankAccount.name,
        bankName: rec.bankAccount.bankName,
        accountNumber: rec.bankAccount.accountNumber,
        iban: rec.bankAccount.iban,
        currency: rec.bankAccount.currency,
        periodFrom: rec.periodFrom,
        periodTo: rec.periodTo,
        status: rec.status,
      },
      balances: {
        statementBalanceCents: rec.statementBalanceCents,
        ledgerBalanceCents: rec.ledgerBalanceCents,
        differenceCents: rec.differenceCents,
      },
      summary: {
        matchedCount: rec.matches.length,
        matchedTotalCents,
        unmatchedStatementCount: unmatchedStatementLines.length,
        unmatchedStatementTotalCents: unmatchedStmtTotalCents,
      },
      matches: rec.matches,
      unmatchedStatementLines,
    };
  }
}
