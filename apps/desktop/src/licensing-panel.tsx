import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  MODULE_CATALOG,
  OPERATIONAL_MODULES,
  PLAN_METADATA,
  type AppModule,
  type CommercialPlan,
  type ModuleInfo,
} from "./modules.js";
import type { LicenseStatus, LicenseTierType, LicenseAuditLogEntry } from "./license.js";

interface LicensingCenterPanelProps {
  licenseStatus: LicenseStatus | null;
  onActivateLicense: (token: string, targetType?: LicenseTierType | "AUTO") => Promise<{ success: boolean; message: string }>;
  onRefreshStatus: () => Promise<void>;
  onNavigateView?: (view: string) => void;
  isAdmin: boolean;
}

export function LicensingCenterPanel({
  licenseStatus,
  onActivateLicense,
  onRefreshStatus,
  onNavigateView,
  isAdmin,
}: LicensingCenterPanelProps) {
  const [activeTab, setActiveTab] = useState<"PRODUCT" | "MODULAR" | "AUDIT">("PRODUCT");
  const [productTokenInput, setProductTokenInput] = useState("");
  const [moduleTokenInput, setModuleTokenInput] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [activating, setActivating] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [moduleFilter, setModuleFilter] = useState<"ALL" | "LICENSED" | "LOCKED">("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const hardwareId = licenseStatus?.hardwareId || "A carregar...";
  const productLicense = licenseStatus?.productLicense;
  const modularLicense = licenseStatus?.modularLicense;
  const auditLogs = licenseStatus?.auditLog || [];

  const isProductActive = Boolean(productLicense?.active ?? licenseStatus?.valid);
  const daysRemaining = productLicense?.daysRemaining ?? licenseStatus?.daysRemaining ?? 0;

  const handleCopyHardwareId = async () => {
    try {
      await navigator.clipboard.writeText(hardwareId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2500);
    } catch {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2500);
    }
  };

  const handleProductFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || "").trim();
      if (content) {
        setProductTokenInput(content);
        setActionMessage({ type: "success", text: `Ficheiro de produto "${file.name}" carregado. Clique em Ativar Licença do Produto.` });
      }
    };
    reader.onerror = () => {
      setActionMessage({ type: "error", text: "Erro ao ler ficheiro de licença." });
    };
    reader.readAsText(file);
  };

  const handleModuleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || "").trim();
      if (content) {
        setModuleTokenInput(content);
        setActionMessage({ type: "success", text: `Ficheiro modular "${file.name}" carregado. Clique em Desbloquear Módulo(s).` });
      }
    };
    reader.onerror = () => {
      setActionMessage({ type: "error", text: "Erro ao ler ficheiro de licença." });
    };
    reader.readAsText(file);
  };

  const handleActivateProductSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!productTokenInput.trim()) {
      setActionMessage({ type: "error", text: "Introduza uma chave de licença de produto válida." });
      return;
    }
    setActivating(true);
    setActionMessage(null);
    try {
      const result = await onActivateLicense(productTokenInput.trim(), "PRODUCT");
      if (result.success) {
        setActionMessage({ type: "success", text: result.message || "Licença do Produto ativada com sucesso!" });
        setProductTokenInput("");
        await onRefreshStatus();
      } else {
        setActionMessage({ type: "error", text: result.message || "Falha ao validar licença do produto." });
      }
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao ativar licença do produto." });
    } finally {
      setActivating(false);
    }
  };

  const handleActivateModuleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!moduleTokenInput.trim()) {
      setActionMessage({ type: "error", text: "Introduza uma chave de licença modular válida." });
      return;
    }
    setActivating(true);
    setActionMessage(null);
    try {
      const result = await onActivateLicense(moduleTokenInput.trim(), "MODULAR");
      if (result.success) {
        setActionMessage({ type: "success", text: result.message || "Módulo(s) ativado(s) com sucesso!" });
        setModuleTokenInput("");
        await onRefreshStatus();
      } else {
        setActionMessage({ type: "error", text: result.message || "Falha ao validar licença modular." });
      }
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao ativar licença modular." });
    } finally {
      setActivating(false);
    }
  };

  // Modular items table data
  const moduleDetailsMap = new Map((modularLicense?.modules || []).map((m) => [m.code, m]));
  const operationalModulesList = OPERATIONAL_MODULES.map((code) => {
    const detail = moduleDetailsMap.get(code);
    const cat = MODULE_CATALOG.find((c) => c.code === code);
    return {
      code,
      name: detail?.name || cat?.name || code,
      category: detail?.category || cat?.category || "Operacional",
      icon: cat?.icon || "📦",
      description: cat?.description || "",
      licensed: Boolean(detail?.licensed),
      activatedAt: detail?.activatedAt,
      expiresAt: detail?.expiresAt,
      daysRemaining: detail?.daysRemaining,
      source: detail?.source || "—",
    };
  });

  const filteredOperationalModules = operationalModulesList.filter((mod) => {
    if (moduleFilter === "LICENSED" && !mod.licensed) return false;
    if (moduleFilter === "LOCKED" && mod.licensed) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        mod.name.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q) ||
        mod.category.toLowerCase().includes(q) ||
        mod.code.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const viewNavigationMap: Partial<Record<AppModule, string>> = {
    DASHBOARD: "dashboard",
    POS: "pdv",
    STOCK: "products",
    PURCHASES: "operations",
    TREASURY: "cashflow",
    ACCOUNTING: "accounting",
    HR: "hr",
    CRM: "crm",
    DOCUMENTS: "documents",
    BI: "bi",
    REPORTS: "reports",
    AUTOMATION: "automation",
    GOVERNANCE: "governance",
    INTEGRATIONS: "integrations",
    CLOUD: "cloud",
    SETTINGS: "fiscal",
  };

  const getProductStatusBadge = () => {
    if (!licenseStatus) return <span className="erp-badge erp-badge-warn">A carregar...</span>;
    if (!isProductActive) {
      if (licenseStatus.reason === "clock_tampering") {
        return <span className="erp-badge erp-badge-danger">🚨 Relógio Adulterado</span>;
      }
      if (licenseStatus.reason === "expired") {
        return <span className="erp-badge erp-badge-danger">❌ Licença de Produto Expirada</span>;
      }
      return <span className="erp-badge erp-badge-danger">🔒 Produto Não Ativado</span>;
    }
    if (licenseStatus.expiryTier === "urgent") {
      return <span className="erp-badge erp-badge-danger">⚠️ Expira em {daysRemaining} dias</span>;
    }
    if (licenseStatus.expiryTier === "critical") {
      return <span className="erp-badge erp-badge-warn">⚠️ Expira em {daysRemaining} dias</span>;
    }
    if (licenseStatus.expiryTier === "expiring_soon") {
      return <span className="erp-badge erp-badge-info">ℹ️ Expira em {daysRemaining} dias</span>;
    }
    return <span className="erp-badge erp-badge-success">✅ Licença de Produto Ativa</span>;
  };

  return (
    <div className="licensing-center-container">
      {/* Hero Header */}
      <div className="licensing-hero">
        <div className="licensing-hero-content">
          <div className="licensing-title-row">
            <span className="licensing-hero-icon">🔐</span>
            <div>
              <h2>Centro de Licenciamento Empresarial & DRM</h2>
              <p className="licensing-subtitle">
                Arquitetura de Dois Níveis: Licença do Produto (Execução) e Licenças Modulares Independentes.
              </p>
            </div>
          </div>
          <div className="licensing-hero-badges">
            {getProductStatusBadge()}
            <span className="erp-badge erp-badge-plan">
              {modularLicense?.licensedModulesCount ?? 0} de {OPERATIONAL_MODULES.length} Módulos Ativos
            </span>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className={`licensing-alert alert-${actionMessage.type}`} style={{ margin: "1rem 0" }}>
          <span>{actionMessage.type === "success" ? "✅" : "⚠️"}</span>
          <span>{actionMessage.text}</span>
          <button type="button" onClick={() => setActionMessage(null)} className="alert-close">×</button>
        </div>
      )}

      {/* Licensing Navigation Tabs */}
      <div className="licensing-tabs" style={{ display: "flex", gap: "0.5rem", borderBottom: "2px solid #e2e8f0", margin: "1.5rem 0" }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === "PRODUCT" ? "active" : ""}`}
          onClick={() => setActiveTab("PRODUCT")}
          style={{
            padding: "0.75rem 1.5rem",
            background: activeTab === "PRODUCT" ? "#1e293b" : "#f1f5f9",
            color: activeTab === "PRODUCT" ? "#ffffff" : "#475569",
            fontWeight: "600",
            border: "none",
            borderRadius: "6px 6px 0 0",
            cursor: "pointer",
          }}
        >
          🏢 Secção A — Licença do Produto
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "MODULAR" ? "active" : ""}`}
          onClick={() => setActiveTab("MODULAR")}
          style={{
            padding: "0.75rem 1.5rem",
            background: activeTab === "MODULAR" ? "#1e293b" : "#f1f5f9",
            color: activeTab === "MODULAR" ? "#ffffff" : "#475569",
            fontWeight: "600",
            border: "none",
            borderRadius: "6px 6px 0 0",
            cursor: "pointer",
          }}
        >
          📦 Secção B — Licença dos Módulos ({modularLicense?.licensedModulesCount ?? 0}/{OPERATIONAL_MODULES.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "AUDIT" ? "active" : ""}`}
          onClick={() => setActiveTab("AUDIT")}
          style={{
            padding: "0.75rem 1.5rem",
            background: activeTab === "AUDIT" ? "#1e293b" : "#f1f5f9",
            color: activeTab === "AUDIT" ? "#ffffff" : "#475569",
            fontWeight: "600",
            border: "none",
            borderRadius: "6px 6px 0 0",
            cursor: "pointer",
          }}
        >
          🛡️ Auditoria & Segurança ({auditLogs.length})
        </button>
      </div>

      {/* TAB A: PRODUCT LICENSE */}
      {activeTab === "PRODUCT" && (
        <div className="tab-pane-product">
          <div className="erp-alert erp-alert-info" style={{ marginBottom: "1.5rem", padding: "1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", color: "#1e40af" }}>
            ℹ️ <b>Âmbito da Licença do Produto:</b> Autoriza unicamente a execução da plataforma ERP, Login, Utilizadores, Administração, Definições e Licenciamento. <b>Nenhum módulo operacional é ativado por esta licença.</b>
          </div>

          <div className="licensing-grid-cards">
            {/* Card 1: Estado e Empresa */}
            <div className="licensing-card">
              <div className="card-header">
                <span className="card-icon">🏢</span>
                <h3>Empresa Titular do ERP</h3>
              </div>
              <div className="card-body">
                <div className="entity-row">
                  <span className="entity-label">Razão Social:</span>
                  <strong className="entity-value">{productLicense?.company || licenseStatus?.company || "Empresa Licenciada"}</strong>
                </div>
                <div className="entity-row">
                  <span className="entity-label">NIF Contribuinte:</span>
                  <strong className="entity-value">{productLicense?.nif || licenseStatus?.nif || "999999999"}</strong>
                </div>
                <div className="entity-row">
                  <span className="entity-label">Edição da Plataforma:</span>
                  <span className="entity-value">{productLicense?.edition || licenseStatus?.plan || "ENTERPRISE"}</span>
                </div>
                <div className="entity-row">
                  <span className="entity-label">Estado de Execução:</span>
                  <span className="entity-value">
                    {isProductActive ? <b style={{ color: "#16a34a" }}>✅ Autorizado</b> : <b style={{ color: "#dc2626" }}>❌ Bloqueado</b>}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Validade e Caducidade */}
            <div className="licensing-card">
              <div className="card-header">
                <span className="card-icon">⏳</span>
                <h3>Validade da Licença do Produto</h3>
              </div>
              <div className="card-body">
                <div className="entity-row">
                  <span className="entity-label">Início de Validade:</span>
                  <span className="entity-value">
                    {productLicense?.startsAt ? new Date(productLicense.startsAt).toLocaleDateString("pt-PT") : "Conforme instalação"}
                  </span>
                </div>
                <div className="entity-row">
                  <span className="entity-label">Data de Caducidade:</span>
                  <span className="entity-value">
                    {productLicense?.expiresAt ? new Date(productLicense.expiresAt).toLocaleDateString("pt-PT") : "Subscrição contínua"}
                  </span>
                </div>
                <div className="entity-row">
                  <span className="entity-label">Dias Restantes:</span>
                  <strong className="entity-value">{daysRemaining} dias</strong>
                </div>
                <div className="expiry-progress-box" style={{ marginTop: "1rem" }}>
                  <div className="progress-track" style={{ height: "8px", background: "#e2e8f0", borderRadius: "4px" }}>
                    <div
                      className="progress-fill"
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(5, (daysRemaining / 365) * 100))}%`,
                        background: daysRemaining <= 15 ? "#ef4444" : daysRemaining <= 30 ? "#f59e0b" : "#10b981",
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Hardware Fingerprint */}
            <div className="licensing-card">
              <div className="card-header">
                <span className="card-icon">💻</span>
                <h3>Hardware ID da Máquina</h3>
              </div>
              <div className="card-body">
                <p className="card-note" style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "0.75rem" }}>
                  Identificador criptográfico exclusivo deste posto de trabalho para emissão de chaves.
                </p>
                <div className="hardware-id-box" style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    readOnly
                    value={hardwareId}
                    aria-label="Hardware ID"
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ flex: 1, padding: "0.5rem", fontFamily: "monospace", fontSize: "0.9rem" }}
                  />
                  <button
                    type="button"
                    className={`erp-btn ${copiedId ? "erp-btn-success" : "erp-btn-secondary"}`}
                    onClick={handleCopyHardwareId}
                  >
                    {copiedId ? "✓ Copiado" : "📋 Copiar"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Form: Ativar Licença do Produto */}
          <div className="licensing-activation-box" style={{ marginTop: "1.5rem" }}>
            <div className="activation-header">
              <span className="activation-icon">🔑</span>
              <div>
                <h3>Introduzir Nova Licença do Produto</h3>
                <p>Carregue o ficheiro de licença de produto <code>.key</code> ou cole o token assinado.</p>
              </div>
            </div>
            <form onSubmit={handleActivateProductSubmit} className="activation-form">
              <div className="file-upload-row">
                <label className="file-upload-btn">
                  📁 Selecionar Ficheiro de Produto (.key)
                  <input type="file" accept=".key,.txt" onChange={handleProductFileSelect} style={{ display: "none" }} />
                </label>
                <span className="file-upload-hint">ou introduza o token assinado diretamente:</span>
              </div>
              <div className="textarea-wrapper">
                <textarea
                  rows={3}
                  value={productTokenInput}
                  onChange={(e) => setProductTokenInput(e.target.value)}
                  placeholder="Cole aqui o token da Licença do Produto (ex: eyJhbGciOiJSUzI1Ni...)"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="erp-btn erp-btn-primary" disabled={activating}>
                  {activating ? "A validar licença..." : "🔑 Ativar Licença do Produto"}
                </button>
                <button type="button" className="erp-btn erp-btn-secondary" onClick={() => void onRefreshStatus()}>
                  🔄 Atualizar Estado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB B: MODULAR LICENSES */}
      {activeTab === "MODULAR" && (
        <div className="tab-pane-modular">
          <div className="erp-alert erp-alert-warning" style={{ marginBottom: "1.5rem", padding: "1rem", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", color: "#92400e" }}>
            🔒 <b>Licenciamento Modular Independente:</b> Após a instalação limpa, todos os 15 módulos operacionais iniciam bloqueados. Cada módulo requer a respetiva ativação por licença modular emitida pelo fornecedor.
          </div>

          {/* KPI Counters */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ background: "#ffffff", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Total de Módulos Operacionais</span>
              <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#1e293b" }}>{OPERATIONAL_MODULES.length}</div>
            </div>
            <div style={{ background: "#f0fdf4", padding: "1rem", borderRadius: "8px", border: "1px solid #bbf7d0", textAlign: "center" }}>
              <span style={{ fontSize: "0.85rem", color: "#166534" }}>Módulos Licenciados & Ativos</span>
              <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#15803d" }}>
                {modularLicense?.licensedModulesCount ?? 0}
              </div>
            </div>
            <div style={{ background: "#fef2f2", padding: "1rem", borderRadius: "8px", border: "1px solid #fecaca", textAlign: "center" }}>
              <span style={{ fontSize: "0.85rem", color: "#991b1b" }}>Módulos Bloqueados</span>
              <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#b91c1c" }}>
                {modularLicense?.lockedModulesCount ?? OPERATIONAL_MODULES.length}
              </div>
            </div>
          </div>

          {/* Form: Ativar Licença Modular */}
          <div className="licensing-activation-box" style={{ marginBottom: "1.5rem" }}>
            <div className="activation-header">
              <span className="activation-icon">🔓</span>
              <div>
                <h3>Ativar Módulo Individual ou Pacote Modular</h3>
                <p>Introduza uma chave modular para desbloquear funcionalidades operacionais específicas (ex: POS, Stocks, Compras).</p>
              </div>
            </div>
            <form onSubmit={handleActivateModuleSubmit} className="activation-form">
              <div className="file-upload-row">
                <label className="file-upload-btn">
                  📁 Selecionar Ficheiro Modular (.key)
                  <input type="file" accept=".key,.txt" onChange={handleModuleFileSelect} style={{ display: "none" }} />
                </label>
                <span className="file-upload-hint">ou cole a chave modular no campo:</span>
              </div>
              <div className="textarea-wrapper">
                <textarea
                  rows={2}
                  value={moduleTokenInput}
                  onChange={(e) => setModuleTokenInput(e.target.value)}
                  placeholder="Cole aqui a chave modular (ex: eyJhbGciOiJSUzI1Ni...)"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="erp-btn erp-btn-primary" disabled={activating}>
                  {activating ? "A validar módulo..." : "🔓 Ativar Módulo(s)"}
                </button>
              </div>
            </form>
          </div>

          {/* Table / Matrix of Modules */}
          <div className="licensing-matrix-section">
            <div className="matrix-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0 }}>Tabela de Módulos Operacionais</h3>
                <p style={{ margin: "0.25rem 0", color: "#64748b", fontSize: "0.85rem" }}>
                  Estado de licenciamento individual dos 15 módulos operacionais do ERP.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="search"
                  placeholder="Pesquisar módulo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
                <button
                  type="button"
                  className={`filter-btn ${moduleFilter === "ALL" ? "active" : ""}`}
                  onClick={() => setModuleFilter("ALL")}
                >
                  Todos ({OPERATIONAL_MODULES.length})
                </button>
                <button
                  type="button"
                  className={`filter-btn ${moduleFilter === "LICENSED" ? "active" : ""}`}
                  onClick={() => setModuleFilter("LICENSED")}
                >
                  ✅ Ativos ({modularLicense?.licensedModulesCount ?? 0})
                </button>
                <button
                  type="button"
                  className={`filter-btn ${moduleFilter === "LOCKED" ? "active" : ""}`}
                  onClick={() => setModuleFilter("LOCKED")}
                >
                  🔒 Bloqueados ({modularLicense?.lockedModulesCount ?? OPERATIONAL_MODULES.length})
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>Módulo</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Categoria</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Estado</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Data de Ativação</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Validade</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Origem da Licença</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOperationalModules.map((mod) => (
                    <tr key={mod.code} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontSize: "1.2rem" }}>{mod.icon}</span>
                          <div>
                            <strong>{mod.name}</strong>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{mod.code}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>{mod.category}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {mod.licensed ? (
                          <span style={{ color: "#16a34a", fontWeight: "600", background: "#f0fdf4", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>
                            ✅ Ativo
                          </span>
                        ) : (
                          <span style={{ color: "#dc2626", fontWeight: "600", background: "#fef2f2", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>
                            🔒 Bloqueado
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#475569" }}>
                        {mod.activatedAt ? new Date(mod.activatedAt).toLocaleDateString("pt-PT") : "—"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#475569" }}>
                        {mod.expiresAt ? (
                          <span>
                            {new Date(mod.expiresAt).toLocaleDateString("pt-PT")}
                            <small style={{ display: "block", color: "#64748b" }}>{mod.daysRemaining} dias</small>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#64748b", fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {mod.source}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                        {mod.licensed ? (
                          <button
                            type="button"
                            className="erp-btn erp-btn-secondary"
                            onClick={() => {
                              const targetView = viewNavigationMap[mod.code];
                              if (targetView && onNavigateView) onNavigateView(targetView);
                            }}
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.85rem" }}
                          >
                            Aceder →
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="erp-btn erp-btn-secondary"
                            onClick={() => {
                              setActionMessage({
                                type: "error",
                                text: `Este módulo (${mod.name}) não está incluído na licença atual. Contacte o fornecedor para adquirir acesso.`,
                              });
                            }}
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.85rem", opacity: 0.8 }}
                          >
                            Desbloquear 🔒
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB C: AUDIT LOGS */}
      {activeTab === "AUDIT" && (
        <div className="tab-pane-audit">
          <div className="erp-alert erp-alert-info" style={{ marginBottom: "1rem", padding: "0.75rem 1rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
            🛡️ <b>Trilha de Auditoria Criptográfica de Licenciamento:</b> Todos os eventos de ativação de produto, ativação modular, tentativas de acesso bloqueado e validações inválidas são registados de forma imutável.
          </div>

          <div style={{ overflowX: "auto", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: "0.6rem 0.8rem" }}>Data / Hora</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>Evento</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>Detalhes</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>Ator</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length ? (
                  [...auditLogs].reverse().map((entry) => {
                    const eventColor =
                      entry.event === "PRODUCT_ACTIVATED" || entry.event === "MODULE_ACTIVATED"
                        ? "#15803d"
                        : entry.event === "MODULE_BLOCKED_ATTEMPT"
                        ? "#b45309"
                        : "#b91c1c";
                    return (
                      <tr key={entry.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.6rem 0.8rem", whiteSpace: "nowrap", color: "#64748b" }}>
                          {new Date(entry.timestamp).toLocaleString("pt-PT")}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", fontWeight: "600", color: eventColor }}>
                          {entry.event}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", color: "#1e293b" }}>{entry.details}</td>
                        <td style={{ padding: "0.6rem 0.8rem", color: "#64748b" }}>{entry.actor || "Local"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                      Nenhum registo de auditoria até ao momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commercial Support Contact Footer */}
      <div className="licensing-support-box" style={{ marginTop: "2rem" }}>
        <div className="support-step">
          <span className="step-num">1</span>
          <div>
            <strong>Copie o Hardware ID</strong>
            <p>O identificador desta máquina é necessário para gerar a chave encriptada.</p>
          </div>
        </div>
        <div className="support-step">
          <span className="step-num">2</span>
          <div>
            <strong>Contacte o Fornecedor Comercial</strong>
            <p>Adquira licenças de módulos específicas por terminal ou empresa.</p>
          </div>
        </div>
        <div className="support-step">
          <span className="step-num">3</span>
          <div>
            <strong>Ative e Opere 100% Offline</strong>
            <p>Os módulos desbloqueados operam com total conformidade fiscal AGT.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LockedModuleView({
  module,
  viewName,
  onOpenLicensing,
}: {
  module: AppModule;
  viewName?: string;
  onOpenLicensing: () => void;
}) {
  const info = MODULE_CATALOG.find((m) => m.code === module);
  return (
    <div
      className="locked-module-view-container"
      style={{
        padding: "3.5rem 1.5rem",
        textAlign: "center",
        maxWidth: "680px",
        margin: "2rem auto",
        background: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🔒</div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: "700", color: "#1e293b", marginBottom: "0.5rem" }}>
        Módulo {info?.name || viewName || module} Bloqueado
      </h2>
      <div
        className="erp-alert erp-alert-warning"
        style={{
          margin: "1.5rem 0",
          padding: "1.2rem",
          background: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          color: "#92400e",
          fontSize: "1.05rem",
          fontWeight: "600",
          lineHeight: "1.5",
        }}
      >
        Este módulo não está incluído na licença atual. Contacte o fornecedor para adquirir acesso.
      </div>
      <p style={{ color: "#64748b", marginBottom: "2rem", lineHeight: "1.6" }}>
        {info?.description ||
          "Para ativar este módulo e iniciar a respetiva operação comercial, adquira a licença modular correspondente junto da equipa de vendas."}
      </p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <button
          type="button"
          className="erp-btn erp-btn-primary checkout"
          onClick={onOpenLicensing}
          style={{ padding: "0.8rem 1.6rem", fontSize: "1rem", fontWeight: "600" }}
        >
          🔑 Abrir Centro de Licenciamento
        </button>
      </div>
    </div>
  );
}

interface LockedModuleModalProps {
  moduleInfo: ModuleInfo;
  currentPlan?: CommercialPlan;
  onOpenLicensing: () => void;
  onClose: () => void;
}

export function LockedModuleModal({
  moduleInfo,
  onOpenLicensing,
  onClose,
}: LockedModuleModalProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="locked-modal-title">
      <div className="modal locked-module-modal">
        <div className="locked-modal-badge">
          <span className="locked-icon">🔒</span>
        </div>
        <h2 id="locked-modal-title">Módulo Não Licenciado</h2>
        <h3 className="locked-module-name">{moduleInfo.icon} {moduleInfo.name}</h3>

        <div className="locked-plan-notice">
          <span style={{ fontWeight: "600", color: "#b45309" }}>
            Este módulo não está incluído na licença atual. Contacte o fornecedor para adquirir acesso.
          </span>
        </div>

        <p className="locked-description">
          {moduleInfo.description}
        </p>

        <div className="locked-features-box">
          <h4>Vantagens ao desbloquear este módulo:</h4>
          <ul>
            <li>Operação 100% em conformidade com o Decreto Presidencial e AGT Angola</li>
            <li>Autonomia completa offline sem perda de registos</li>
            <li>Integração total com os módulos de faturação, caixa e contabilidade</li>
          </ul>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="checkout"
            onClick={() => {
              onClose();
              onOpenLicensing();
            }}
          >
            🔑 Abrir Centro de Licenciamento
          </button>
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

interface LicenseWarningBannerProps {
  licenseStatus: LicenseStatus | null;
  onOpenLicensing: () => void;
}

export function LicenseWarningBanner({
  licenseStatus,
  onOpenLicensing,
}: LicenseWarningBannerProps) {
  if (!licenseStatus) return null;

  if (!licenseStatus.valid) {
    return (
      <div className="license-top-banner banner-danger">
        <div className="banner-content">
          <span className="banner-icon">🚨</span>
          <span>
            <b>Modo Restrito de Licença:</b> {licenseStatus.reason === "expired" ? "A sua licença comercial caducou." : "Sistema não ativado com licença válida."} Apenas as configurações e licenciamento estão acessíveis.
          </span>
        </div>
        <button type="button" className="banner-action-btn" onClick={onOpenLicensing}>
          🔑 Ativar Licença
        </button>
      </div>
    );
  }

  const daysRemaining = licenseStatus.daysRemaining ?? 365;

  if (daysRemaining <= 15) {
    return (
      <div className="license-top-banner banner-danger">
        <div className="banner-content">
          <span className="banner-icon">⚠️</span>
          <span>
            <b>Aviso Urgente de Expiração:</b> A sua licença do plano {licenseStatus.plan} caduca em <b>{daysRemaining} dias</b>. Renove agora para evitar a suspensão da faturação.
          </span>
        </div>
        <button type="button" className="banner-action-btn" onClick={onOpenLicensing}>
          Renovar Agora
        </button>
      </div>
    );
  }

  if (daysRemaining <= 30) {
    return (
      <div className="license-top-banner banner-warning">
        <div className="banner-content">
          <span className="banner-icon">ℹ️</span>
          <span>
            <b>Aviso de Renovação:</b> A licença comercial expira dentro de <b>{daysRemaining} dias</b> ({licenseStatus.expiresAt?.slice(0, 10)}).
          </span>
        </div>
        <button type="button" className="banner-action-btn" onClick={onOpenLicensing}>
          Ver Licença
        </button>
      </div>
    );
  }

  return null;
}
