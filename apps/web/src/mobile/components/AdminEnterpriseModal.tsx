import React, { useState, useEffect } from "react";
import {
  AdminEnterpriseManager,
  ManagedUser,
  CashRegisterTerminal,
  LicenseStatus,
  AuditLogEntry,
  EmployeeSummary,
  BiKpiSummary,
  HeadquartersCockpit,
  ProtectedApiConfig,
} from "../admin-enterprise-manager.js";

interface AdminEnterpriseModalProps {
  serverUrl: string;
  token: string | null;
  companyId: string;
  branchId?: string | null;
  terminalId: string;
  userRole: string;
  isOnline: boolean;
  pendingOutboxCount: number;
  onClose: () => void;
}

export const AdminEnterpriseModal: React.FC<AdminEnterpriseModalProps> = ({
  serverUrl,
  token,
  companyId,
  branchId,
  terminalId,
  userRole,
  isOnline,
  pendingOutboxCount,
  onClose,
}) => {
  const manager = AdminEnterpriseManager.getInstance();
  const [activeTab, setActiveTab] = useState<"admin" | "enterprise">("admin");

  // Admin state
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [terminals, setTerminals] = useState<CashRegisterTerminal[]>([]);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [apiConfig, setApiConfig] = useState<ProtectedApiConfig>(() =>
    manager.getProtectedApiConfig(serverUrl, companyId, branchId, terminalId, token, pendingOutboxCount)
  );

  // Enterprise state
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [biKpis, setBiKpis] = useState<BiKpiSummary | null>(null);
  const [hqCockpit, setHqCockpit] = useState<HeadquartersCockpit | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [integrations] = useState(() => manager.getIntegrationsStatus());

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTabContent();
  }, [activeTab]);

  const loadTabContent = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === "admin") {
        const [termList, licStatus] = await Promise.all([
          manager.getTerminals(serverUrl, token, companyId, branchId).catch(() => []),
          manager.getLicenseStatus(serverUrl, token, companyId),
        ]);
        setTerminals(termList);
        setLicense(licStatus);

        if (["ADMIN", "ROLE_ADMIN"].includes(userRole.toUpperCase())) {
          try {
            const [uList, logs] = await Promise.all([
              manager.getUsers(serverUrl, token, companyId, branchId, userRole),
              manager.getAuditLogs(serverUrl, token, companyId, branchId, userRole, 20),
            ]);
            setUsers(uList);
            setAuditLogs(logs);
          } catch (e: any) {
            console.warn("[AdminEnterprise] Erro ao carregar gestão de utilizadores:", e);
          }
        }
      } else {
        const [empList, kpis, hq] = await Promise.all([
          manager.getEmployees(serverUrl, token, companyId, branchId).catch(() => []),
          manager.getBiKpis(serverUrl, token, companyId, branchId).catch(() => null),
          manager.getHeadquartersCockpit(serverUrl, token, companyId, companyId).catch(() => null),
        ]);
        setEmployees(empList);
        setBiKpis(kpis);
        setHqCockpit(hq);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados administrativos.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAiAsk = async () => {
    if (!aiQuery.trim()) return;
    setIsLoading(true);
    setError(null);
    setAiResponse(null);
    try {
      const res = await manager.queryAiCopilot(serverUrl, token, companyId, aiQuery, isOnline);
      setAiResponse(res.answer);
      setAiQuery("");
    } catch (err: any) {
      setError(err.message || "Falha na consulta ao Copilot.");
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
        maxWidth: 760,
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
              Administração & Módulos Corporativos ERP
            </h2>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Gestão de acessos, terminais, licença, auditoria, RH, BI, HQ e IA
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

        {/* Regulatory Notice Banner */}
        <div style={{
          background: "#fffbeb",
          padding: "8px 16px",
          borderBottom: "1px solid #fef3c7",
          fontSize: 12,
          color: "#b45309",
          textAlign: "center",
          fontWeight: 600,
        }}>
          ⚠️ Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>
          <button
            onClick={() => setActiveTab("admin")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: activeTab === "admin" ? "#ffffff" : "transparent",
              borderBottom: activeTab === "admin" ? "2px solid #0284c7" : "none",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "admin" ? "#0284c7" : "#64748b",
              cursor: "pointer",
            }}
          >
            🛡️ Gestão & Segurança
          </button>
          <button
            onClick={() => setActiveTab("enterprise")}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: activeTab === "enterprise" ? "#ffffff" : "transparent",
              borderBottom: activeTab === "enterprise" ? "2px solid #0284c7" : "none",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "enterprise" ? "#0284c7" : "#64748b",
              cursor: "pointer",
            }}
          >
            🏢 RH, BI, HQ & IA Copilot
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "10px 16px", fontSize: 13, borderBottom: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              A carregar informações administrativas...
            </div>
          ) : activeTab === "admin" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Protected API Settings */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  Configuração de Ligação Protegida
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                  <div><strong>Servidor:</strong> {apiConfig.serverUrl}</div>
                  <div><strong>Empresa:</strong> {apiConfig.companyId}</div>
                  <div><strong>Filial:</strong> {apiConfig.branchId || "Sede"}</div>
                  <div><strong>Terminal:</strong> {apiConfig.terminalId}</div>
                  <div><strong>Outbox Pendente:</strong> {apiConfig.offlineOutboxPendingCount} mutações</div>
                  <div><strong>Sessão:</strong> {apiConfig.hasActiveSession ? "Ativa (Token protegido)" : "Sem sessão"}</div>
                </div>
              </div>

              {/* License Status */}
              {license && (
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Estado Criptográfico da Licença
                  </h3>
                  <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span>Estado:</span>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: license.valid ? "#dcfce7" : "#fee2e2",
                      color: license.valid ? "#166534" : "#991b1b",
                    }}>
                      {license.valid ? "VÁLIDA / ASSINADA" : "NÃO CERTIFICADA / DEMO"}
                    </span>
                  </div>
                  {license.message && <div style={{ fontSize: 12, color: "#64748b" }}>{license.message}</div>}
                  {license.expiresAt && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Validade: {new Date(license.expiresAt).toLocaleDateString()}</div>}
                </div>
              )}

              {/* Users & Memberships */}
              {["ADMIN", "ROLE_ADMIN"].includes(userRole.toUpperCase()) && (
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Utilizadores & Perfis Autorizados
                  </h3>
                  {users.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#64748b" }}>Nenhum utilizador listado.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {users.map((u) => (
                        <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
                          <div>
                            <strong>{u.displayName}</strong> ({u.username})
                            <div style={{ fontSize: 11, color: "#64748b" }}>{u.email}</div>
                          </div>
                          <span style={{ padding: "2px 8px", background: "#f1f5f9", borderRadius: 6, fontSize: 11, fontWeight: 700, alignSelf: "center" }}>
                            {u.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Audit Logs */}
              {["ADMIN", "ROLE_ADMIN"].includes(userRole.toUpperCase()) && (
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Registo de Auditoria Empresarial
                  </h3>
                  {auditLogs.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#64748b" }}>Nenhum evento recente de auditoria.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {auditLogs.slice(0, 8).map((log) => (
                        <div key={log.id} style={{ padding: 8, background: "#ffffff", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                            <span>{log.action}</span>
                            <span style={{ fontSize: 11, color: "#64748b" }}>{new Date(log.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                            Entidade: {log.entity} {log.entityId ? `(#${log.entityId.slice(0, 8)})` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* AI Copilot Card */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  🤖 VendaJá AI Copilot (Online)
                </h3>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  Assistente analítico corporativo. Exige sessão autenticada e conexão de rede.
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder={isOnline ? "Pergunte sobre vendas, stocks ou regras fiscais..." : "Copilot indisponível offline"}
                    value={aiQuery}
                    disabled={!isOnline || isLoading}
                    onChange={(e) => setAiQuery(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                    }}
                  />
                  <button
                    onClick={handleAiAsk}
                    disabled={!isOnline || isLoading || !aiQuery.trim()}
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
                    Perguntar
                  </button>
                </div>

                {aiResponse && (
                  <div style={{ background: "#ffffff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#1e293b" }}>
                    <strong>Copilot:</strong> {aiResponse}
                  </div>
                )}
              </div>

              {/* BI KPIs */}
              {biKpis && (
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Indicadores de Business Intelligence (BI)
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                    <div><strong>Total Vendas:</strong> {(biKpis.salesTotalCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                    <div><strong>Margem Bruta:</strong> {biKpis.grossMarginPercent.toFixed(1)}%</div>
                    <div><strong>Volume de Encomendas:</strong> {biKpis.ordersCount}</div>
                    <div><strong>Ticket Médio:</strong> {(biKpis.averageTicketCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                  </div>
                </div>
              )}

              {/* Headquarters Multi-Store Cockpit */}
              {hqCockpit && (
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Corporate Headquarters (Consolidação Central)
                  </h3>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    Lojas e filiais consolidadas pertencentes estritamente à empresa autorizada ({hqCockpit.storesCount} lojas).
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {hqCockpit.stores.map((s) => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
                        <span><strong>{s.name}</strong> ({s.code})</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.isHeadquarters ? "#0284c7" : "#166534" }}>
                          {s.isHeadquarters ? "SEDE CORPORATIVA" : "FILIAL OPERACIONAL"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HR Overview */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  Recursos Humanos (RH)
                </h3>
                {employees.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#64748b" }}>Nenhum funcionário cadastrado nesta filial.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {employees.map((e) => (
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
                        <div>
                          <strong>{e.fullName}</strong>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{e.position} {e.department ? `• ${e.department}` : ""}</div>
                        </div>
                        <span style={{ fontSize: 11, color: e.active ? "#16a34a" : "#ef4444", fontWeight: 700, alignSelf: "center" }}>
                          {e.active ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Integrations Status Card */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  Estado de Integrações Externas
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {integrations.map((item, idx) => (
                    <div key={idx} style={{ padding: 10, background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                        <span>{item.name}</span>
                        <span style={{ color: item.configured ? "#166534" : "#b45309" }}>
                          {item.configured ? "CONFIGURADO" : "INDISPONÍVEL"}
                        </span>
                      </div>
                      <div style={{ color: "#64748b", marginTop: 4 }}>{item.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
