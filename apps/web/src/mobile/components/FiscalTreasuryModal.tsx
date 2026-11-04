import React, { useState, useEffect } from "react";
import {
  FiscalTreasuryManager,
  FiscalConfigSummary,
  TreasuryAccount,
  CashflowSummary,
  AccountingPeriod,
  TaxSummary,
  SaftValidationResult,
} from "../fiscal-treasury-manager.js";

interface FiscalTreasuryModalProps {
  serverUrl: string;
  token: string;
  companyId: string;
  branchId?: string | null;
  userRole: string;
  isOnline: boolean;
  onClose: () => void;
}

export const FiscalTreasuryModal: React.FC<FiscalTreasuryModalProps> = ({
  serverUrl,
  token,
  companyId,
  branchId,
  userRole,
  isOnline,
  onClose,
}) => {
  const manager = FiscalTreasuryManager.getInstance();
  const [activeTab, setActiveTab] = useState<"fiscal" | "treasury">("fiscal");

  // Fiscal State
  const [fiscalConfig, setFiscalConfig] = useState<FiscalConfigSummary | null>(null);
  const [saftValidation, setSaftValidation] = useState<SaftValidationResult | null>(null);
  const [saftFromDate, setSaftFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [saftToDate, setSaftToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saftExportStatus, setSaftExportStatus] = useState<string | null>(null);

  // Treasury State
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccount[]>([]);
  const [cashflow, setCashflow] = useState<CashflowSummary | null>(null);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === "fiscal") {
        const val = await manager.getSaftValidationStatus(serverUrl);
        setSaftValidation(val);

        if (["ADMIN", "ROLE_ADMIN"].includes(userRole.toUpperCase())) {
          try {
            const conf = await manager.getFiscalConfig(serverUrl, token, companyId, userRole);
            setFiscalConfig(conf);
          } catch {
            // Se falhar leitura de config (ex: permissões), mantém fallback seguro
          }
        }
      } else {
        const canViewBankAccounts = ["ADMIN", "ROLE_ADMIN", "MANAGER", "ROLE_MANAGER", "ACCOUNTANT", "ROLE_ACCOUNTANT"].includes(userRole.toUpperCase());
        const canViewAccountingPeriods = ["ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"].includes(userRole.toUpperCase());

        const [accs, cf, pers] = await Promise.all([
          canViewBankAccounts ? manager.getTreasuryAccounts(serverUrl, token, companyId, branchId) : Promise.resolve([]),
          manager.getCashflowSummary(serverUrl, token, companyId, branchId),
          canViewAccountingPeriods ? manager.getAccountingPeriods(serverUrl, token, companyId, branchId) : Promise.resolve([]),
        ]);
        setTreasuryAccounts(accs);
        setCashflow(cf);
        setPeriods(pers);

        try {
          const taxes = await manager.getTaxSummary(serverUrl, token, companyId, branchId);
          setTaxSummary(taxes);
        } catch {
          // opcional
        }
      }
    } catch (err: any) {
      setError(err.message || "Falha ao carregar dados operacionais.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportSaft = async () => {
    setError(null);
    setSaftExportStatus(null);
    setIsLoading(true);
    try {
      const xml = await manager.exportSaftXml(
        serverUrl,
        token,
        companyId,
        new Date(saftFromDate).toISOString(),
        new Date(saftToDate).toISOString(),
        userRole,
        isOnline
      );
      setSaftExportStatus(`Ficheiro SAF-T (AO) gerado com sucesso (${(xml.length / 1024).toFixed(1)} KB).`);
    } catch (err: any) {
      setError(err.message || "Erro na geração do ficheiro SAF-T.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(15, 23, 42, 0.75)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 16,
        width: "100%",
        maxWidth: 720,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f8fafc",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              Fiscalidade, Tesouraria & Contabilidade
            </h2>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Painel de conformidade e acompanhamento financeiro
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#e2e8f0",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Fechar
          </button>
        </div>

        {/* Regulatory Banner */}
        <div style={{
          background: "#fffbeb",
          padding: "8px 16px",
          borderBottom: "1px solid #fef3c7",
          fontSize: 12,
          color: "#b45309",
          textAlign: "center",
          fontWeight: 600,
        }}>
          ⚠️ {manager.getRegulatoryDisclaimer()}
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>
          <button
            onClick={() => setActiveTab("fiscal")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: activeTab === "fiscal" ? "#ffffff" : "transparent",
              borderBottom: activeTab === "fiscal" ? "2px solid #0284c7" : "none",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "fiscal" ? "#0284c7" : "#64748b",
              cursor: "pointer",
            }}
          >
            ⚖️ Fiscalidade & SAF-T
          </button>
          <button
            onClick={() => setActiveTab("treasury")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: activeTab === "treasury" ? "#ffffff" : "transparent",
              borderBottom: activeTab === "treasury" ? "2px solid #0284c7" : "none",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "treasury" ? "#0284c7" : "#64748b",
              cursor: "pointer",
            }}
          >
            💰 Tesouraria & Períodos
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "10px 16px", fontSize: 13, borderBottom: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {saftExportStatus && (
          <div style={{ background: "#f0fdf4", color: "#166534", padding: "10px 16px", fontSize: 13, borderBottom: "1px solid #bbf7d0", fontWeight: 600 }}>
            ✓ {saftExportStatus}
          </div>
        )}

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              A carregar informações...
            </div>
          ) : activeTab === "fiscal" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Fiscal Config Card */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  Estado da Configuração Fiscal
                </h3>
                {fiscalConfig ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                    <div><strong>Empresa:</strong> {fiscalConfig.companyName || "Configurada"}</div>
                    <div><strong>NIF:</strong> {fiscalConfig.companyNif || "Não atribuído"}</div>
                    <div><strong>Série Ativa:</strong> {fiscalConfig.invoiceSeries}</div>
                    <div><strong>Moeda Base:</strong> {fiscalConfig.baseCurrency}</div>
                    <div><strong>Arredondamento:</strong> {fiscalConfig.roundingMode}</div>
                    <div><strong>Retenção de Arquivo:</strong> {fiscalConfig.fiscalArchiveRetentionYears ? `${fiscalConfig.fiscalArchiveRetentionYears} anos (política configurável)` : "política de retenção configurável, sujeita a validação legal/fiscal externa"}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    Configuração fiscal sob gestão central do administrador da empresa.
                  </div>
                )}
              </div>

              {/* SAF-T Export Card */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  Exportação de Ficheiro SAF-T (AO)
                </h3>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  A exportação oficial do SAF-T é realizada online e requer perfil autorizado.
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>De:</label>
                    <input
                      type="date"
                      value={saftFromDate}
                      onChange={(e) => setSaftFromDate(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Até:</label>
                    <input
                      type="date"
                      value={saftToDate}
                      onChange={(e) => setSaftToDate(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>

                {saftValidation && (
                  <div style={{ background: "#ffffff", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, color: "#475569", marginBottom: 12 }}>
                    <strong>Validação Estrutural:</strong> {saftValidation.caveat}
                  </div>
                )}

                <button
                  onClick={handleExportSaft}
                  disabled={isLoading || !isOnline}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: isOnline ? "#0284c7" : "#94a3b8",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isOnline ? "pointer" : "not-allowed",
                  }}
                >
                  {isOnline ? "Gerar e Validar SAF-T (AO)" : "Indisponível Offline"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Cashflow Summary */}
              {cashflow && (
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Resumo de Fluxo de Caixa
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                    <div><strong>Vendas Realizadas:</strong> {cashflow.salesCount}</div>
                    <div><strong>Total Vendas:</strong> {(cashflow.totalSalesCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                    <div><strong>Despesas:</strong> {(cashflow.expensesCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                    <div><strong>Saldo Líquido:</strong> {(cashflow.netCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                  </div>
                </div>
              )}

              {/* Tax Summary (IVA) */}
              {taxSummary && (
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Posição Fiscal de IVA
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                    <div><strong>IVA Liquidado (Vendas):</strong> {(taxSummary.outputCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                    <div><strong>IVA Dedutível (Compras):</strong> {(taxSummary.inputCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                    <div style={{ gridColumn: "1 / -1", fontWeight: 700 }}>
                      <strong>IVA a Pagar / (Crédito):</strong> {(taxSummary.payableCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}
                    </div>
                  </div>
                </div>
              )}

              {/* Treasury Accounts */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  Contas de Tesouraria & Saldos
                </h3>
                {["ADMIN", "ROLE_ADMIN", "MANAGER", "ROLE_MANAGER", "ACCOUNTANT", "ROLE_ACCOUNTANT"].includes(userRole.toUpperCase()) ? (
                  treasuryAccounts.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#64748b" }}>Nenhuma conta de tesouraria configurada.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {treasuryAccounts.map((acc) => (
                        <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
                          <span><strong>{acc.name}</strong> ({acc.type})</span>
                          <span style={{ fontWeight: 700 }}>{(acc.balanceCents / 100).toLocaleString("pt-AO", { style: "currency", currency: acc.currency || "AOA" })}</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                    🔒 Consulta de contas de tesouraria restrita a Administrador, Gestor e Contabilista.
                  </div>
                )}
              </div>

              {/* Accounting Periods */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  Períodos Contabilísticos
                </h3>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                  Operações são estritamente bloqueadas em períodos fechados. Lançamentos locais offline são proibidos.
                </div>
                {["ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"].includes(userRole.toUpperCase()) ? (
                  periods.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#64748b" }}>Nenhum período contabilístico registado.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {periods.map((p) => (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
                          <div>
                            <strong>{p.name}</strong>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {new Date(p.startsAt).toLocaleDateString()} - {new Date(p.endsAt).toLocaleDateString()}
                            </div>
                          </div>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: p.status === "OPEN" ? "#dcfce7" : "#fee2e2",
                            color: p.status === "OPEN" ? "#166534" : "#991b1b",
                          }}>
                            {p.status === "OPEN" ? "ABERTO" : "FECHADO"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                    🔒 Consulta de períodos contabilísticos restrita a Administrador e Contabilista.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
