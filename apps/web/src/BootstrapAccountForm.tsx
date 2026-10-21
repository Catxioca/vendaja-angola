import { useState, type FormEvent } from "react";

type BootstrapResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; username: string; displayName?: string; role: string };
  context: { companyId: string; branchId: string };
};

export function BootstrapAccountForm({ apiUrl, onComplete, onCancel }: { apiUrl: string; onComplete: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ legalName: "", nif: "", branchCode: "MAIN", branchName: "Sede", displayName: "", username: "", email: "", password: "", confirmPassword: "", pin: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) { setError("As passwords não coincidem."); return; }
    if (form.password.length < 12) { setError("A password deve ter pelo menos 12 caracteres."); return; }
    setSaving(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/bootstrap`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: { legalName: form.legalName, nif: form.nif || undefined, branchCode: form.branchCode, branchName: form.branchName }, admin: { displayName: form.displayName, username: form.username, email: form.email, password: form.password, pin: form.pin || undefined } }),
      });
      const data = await response.json().catch(() => ({})) as Partial<BootstrapResponse> & { error?: string };
      if (!response.ok || !data.accessToken || !data.context) {
        setError(data.error === "bootstrap_unavailable" ? "A instalação já foi inicializada. Inicie sessão com uma conta existente." : "Não foi possível criar a conta inicial. Confirme os dados e a ligação ao servidor.");
        return;
      }
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken ?? "");
      localStorage.setItem("posUser", JSON.stringify(data.user));
      localStorage.setItem("vendaja-company-id", data.context.companyId);
      localStorage.setItem("vendaja-branch-id", data.context.branchId);
      onComplete();
    } catch { setError("Não foi possível contactar o servidor para criar a conta inicial."); }
    finally { setSaving(false); }
  }
  return <form className="bootstrap-form" onSubmit={submit}>
    <header><p className="eyebrow">CONFIGURAÇÃO INICIAL</p><h2>Criar Conta de Administrador</h2><p>Este passo cria a primeira empresa, filial e conta administradora. Só pode ser executado uma vez por instalação.</p></header>
    <fieldset><legend>Empresa e filial</legend><label>Nome legal<input required value={form.legalName} onChange={(e) => change("legalName", e.target.value)} /></label><label>NIF <small>(opcional durante bootstrap)</small><input value={form.nif} onChange={(e) => change("nif", e.target.value)} /></label><label>Código da filial<input required value={form.branchCode} onChange={(e) => change("branchCode", e.target.value)} /></label><label>Nome da filial<input required value={form.branchName} onChange={(e) => change("branchName", e.target.value)} /></label></fieldset>
    <fieldset><legend>Administrador</legend><label>Nome completo<input required value={form.displayName} onChange={(e) => change("displayName", e.target.value)} /></label><label>Utilizador<input required minLength={3} value={form.username} onChange={(e) => change("username", e.target.value)} /></label><label>E-mail<input required type="email" value={form.email} onChange={(e) => change("email", e.target.value)} /></label><label>Password forte<input required type="password" minLength={12} value={form.password} onChange={(e) => change("password", e.target.value)} /></label><label>Confirmar password<input required type="password" minLength={12} value={form.confirmPassword} onChange={(e) => change("confirmPassword", e.target.value)} /></label><label>PIN administrativo <small>(4–6 dígitos, opcional)</small><input inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} value={form.pin} onChange={(e) => change("pin", e.target.value.replace(/\D/g, ""))} /></label></fieldset>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="bootstrap-actions"><button type="submit" disabled={saving}>{saving ? "A criar…" : "Criar empresa e administrador"}</button><button type="button" onClick={onCancel} disabled={saving}>Voltar ao login</button></div>
  </form>;
}
