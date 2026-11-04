import { formatKwanza } from "@angola/shared";
import type { MobileCartLine, PaymentExecutionPlan } from "./cart-manager";
import type { TenantContext } from "./types";

export interface ProvisionalReceiptData {
  correlationId: string;
  idempotencyKey: string;
  occurredAt: string;
  tenant: TenantContext;
  operatorName: string;
  customerName?: string;
  customerNif?: string;
  lines: MobileCartLine[];
  paymentPlan: PaymentExecutionPlan;
}

export function generateProvisionalReceiptHtml(data: ProvisionalReceiptData): string {
  const lineRows = data.lines
    .map(
      (line) => `
    <tr>
      <td style="padding: 4px 0; text-align: left;">${line.name}</td>
      <td style="padding: 4px 0; text-align: center;">${line.quantity}</td>
      <td style="padding: 4px 0; text-align: right;">${formatKwanza(line.unitPriceCents)}</td>
      <td style="padding: 4px 0; text-align: right; font-weight: 600;">${formatKwanza(line.lineTotalCents)}</td>
    </tr>
  `
    )
    .join("");

  return `
    <div style="font-family: 'Courier New', Courier, monospace; max-width: 320px; margin: 0 auto; padding: 14px; background: #ffffff; color: #000000; border: 1px dashed #666; font-size: 12px; line-height: 1.4;">
      <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
        <div style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${data.tenant.companyName}</div>
        <div>Filial: ${data.tenant.branchName || "Sede"}</div>
        <div>Terminal: #${data.tenant.terminalId}</div>
      </div>

      <!-- AVISO FISCAL OBRIGATÓRIO -->
      <div style="border: 2px solid #000; padding: 6px; text-align: center; margin: 8px 0; font-weight: bold; background: #f0f0f0;">
        ⚠️ COMPROVATIVO PROVISÓRIO / NÃO FISCAL<br>
        AGUARDA VALIDAÇÃO CENTRAL
      </div>

      <div style="margin-bottom: 8px; font-size: 11px;">
        <div><strong>Ref. Local:</strong> ${data.correlationId}</div>
        <div><strong>Data/Hora:</strong> ${new Date(data.occurredAt).toLocaleString("pt-AO")}</div>
        <div><strong>Operador:</strong> ${data.operatorName}</div>
        ${data.customerName ? `<div><strong>Cliente:</strong> ${data.customerName}</div>` : ""}
        ${data.customerNif ? `<div><strong>NIF Cliente:</strong> ${data.customerNif}</div>` : ""}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; border-top: 1px dashed #000; border-bottom: 1px dashed #000;">
        <thead>
          <tr style="border-bottom: 1px solid #000;">
            <th style="text-align: left; padding: 4px 0;">Item</th>
            <th style="text-align: center; padding: 4px 0;">Qtd</th>
            <th style="text-align: right; padding: 4px 0;">Preço</th>
            <th style="text-align: right; padding: 4px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>

      <div style="text-align: right; font-size: 12px; margin-bottom: 8px;">
        <div style="font-size: 13px; font-weight: bold; margin-top: 4px;">
          ${data.paymentPlan.hasTaxPolicy ? "TOTAL INDICATIVO:" : "TOTAL PROVISÓRIO SUJEITO A VALIDAÇÃO CENTRAL:"} ${formatKwanza(data.paymentPlan.totalCents)}
        </div>
        ${
          !data.paymentPlan.hasTaxPolicy
            ? `<div style="font-size: 10px; color: #b45309; font-weight: bold; margin-top: 2px;">⚠️ Impostos sujeitos a validação central (taxCents=0 não é imposto final)</div>`
            : ""
        }
        <div style="font-size: 11px; color: #333; margin-top: 2px;">
          Método de Pagamento: ${data.paymentPlan.paymentMethod}
        </div>
        ${
          data.paymentPlan.paymentMethod === "CASH"
            ? `
          <div style="font-size: 11px;">Entregue: ${formatKwanza(data.paymentPlan.tenderedCents)}</div>
          <div style="font-size: 11px; font-weight: bold;">Troco: ${formatKwanza(data.paymentPlan.changeCents)}</div>
        `
            : ""
        }
        ${
          data.paymentPlan.tpaAuthorizationCode
            ? `<div style="font-size: 10px;">Aut. TPA: ${data.paymentPlan.tpaAuthorizationCode}</div>`
            : ""
        }
      </div>

      <div style="border-top: 1px dashed #000; padding-top: 6px; text-align: center; font-size: 10px; color: #555;">
        Este documento é uma intenção de venda retida na fila offline.<br>
        Não substitui a Fatura/Recibo fiscal definitiva validada pelo servidor.<br>
        Estado: <strong>PENDENTE DE CONFIRMAÇÃO</strong>
      </div>
    </div>
  `;
}
