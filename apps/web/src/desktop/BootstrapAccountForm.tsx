import { useState, type FormEvent } from "react";
import { credentialHash } from "./modules.js";

type BootstrapResponse = {
  accessToken: string;
  refreshToken: string;
  user: { email: string; role: string; displayName?: string; username?: string; id?: string };
  context: { companyId: string; branchId: string };
};

export function BootstrapAccountForm({
  apiUrl,
  onComplete,
  onCancel,
}: {
  apiUrl: string;
  onComplete: (token: string, refresh: string, user: { role: string; displayName?: string; email: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    legalName: "",
    nif: "",
    branchCode: "MAIN",
    branchName: "Sede",
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    pin: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  async function provisionLocalOffline(passwordHash: string, pinHash: string) {
    const localAuth = {
      username: form.username.trim(),
      email: form.email.trim(),
      displayName: form.displayName.trim() || form.username.trim(),
      role: "ADMIN",
      passwordHash,
      pinHash,
    };
    localStorage.setItem("vendaja-local-auth", JSON.stringify(localAuth));

    const companyData = {
      name: form.legalName.trim(),
      nif: form.nif.trim() || "—",
      address: form.branchName.trim() || "Angola",
      province: "Luanda",
      phone: "—",
      branchCode: form.branchCode.trim() || "MAIN",
    };
    localStorage.setItem("vendaja-local-company", JSON.stringify(companyData));

    const user = {
      id: "local-admin",
      email: localAuth.email,
      username: localAuth.username,
      displayName: localAuth.displayName,
      role: "ADMIN",
      authMethod: (form.pin ? "pin" : "password") as "password" | "pin",
    };

    localStorage.setItem("accessToken", "offline-local-session");
    localStorage.setItem("refreshToken", "");
    localStorage.setItem("posUser", JSON.stringify(user));
    localStorage.setItem("vendaja-company-id", "local-tenant");
    localStorage.setItem("vendaja-branch-id", form.branchCode.trim() || "MAIN");

    window.dispatchEvent(new CustomEvent("company-updated"));
    onComplete("offline-local-session", "", user);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("As passwords não coincidem.");
      return;
    }
    if (form.password.length < 12) {
      setError("A password deve ter pelo menos 12 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const passwordHash = await credentialHash(form.password);
      const pinHash = form.pin ? await credentialHash(form.pin) : await credentialHash("123456");

      let remoteRegistered = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(`${apiUrl}/api/v1/auth/bootstrap`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            company: {
              legalName: form.legalName.trim(),
              nif: form.nif.trim() || undefined,
              branchCode: form.branchCode.trim(),
              branchName: form.branchName.trim(),
            },
            admin: {
              displayName: form.displayName.trim(),
              username: form.username.trim(),
              email: form.email.trim(),
              password: form.password,
              pin: form.pin.trim() || undefined,
            },
          }),
        });
        clearTimeout(timeout);

        const data = (await response.json().catch(() => ({}))) as Partial<BootstrapResponse> & { error?: string };
        if (response.ok && data.accessToken && data.user && data.context) {
          // Synchronize local offline credentials with remote bootstrap
          const localAuth = {
            username: form.username.trim(),
            email: form.email.trim(),
            displayName: form.displayName.trim() || form.username.trim(),
            role: "ADMIN",
            passwordHash,
            pinHash,
          };
          localStorage.setItem("vendaja-local-auth", JSON.stringify(localAuth));

          const companyData = {
            name: form.legalName.trim(),
            nif: form.nif.trim() || "—",
            address: form.branchName.trim() || "Angola",
            province: "Luanda",
            phone: "—",
            branchCode: form.branchCode.trim() || "MAIN",
          };
          localStorage.setItem("vendaja-local-company", JSON.stringify(companyData));

          localStorage.setItem("accessToken", data.accessToken);
          localStorage.setItem("refreshToken", data.refreshToken ?? "");
          localStorage.setItem("posUser", JSON.stringify(data.user));
          localStorage.setItem("vendaja-company-id", data.context.companyId);
          localStorage.setItem("vendaja-branch-id", data.context.branchId);

          window.dispatchEvent(new CustomEvent("company-updated"));
          onComplete(data.accessToken, data.refreshToken ?? "", data.user);
          remoteRegistered = true;
          return;
        }

        if (data.error === "bootstrap_unavailable") {
          setError("A instalação já foi inicializada no servidor. Inicie sessão com uma conta existente.");
          return;
        }
        throw new Error(data.error ?? "Não foi possível registar no servidor.");
      } catch (networkError) {
        if (remoteRegistered) return;
        // Backend offline or unreachable: initialize offline-first tenant and admin
        console.warn("[bootstrap] backend unreachable; falling back to offline-first local provisioning", networkError);
        await provisionLocalOffline(passwordHash, pinHash);
      }
    } catch {
      setError("Não foi possível inicializar a conta de administrador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="login-card-inner bootstrap-form">
      <header>
        <p className="eyebrow">CONFIGURAÇÃO INICIAL</p>
        <h2>Criar Conta de Administrador</h2>
        <p>Cria a primeira empresa, filial e conta administradora. Funciona online ou em modo offline local.</p>
        <p className="bootstrap-server-hint">
          Destino: <code>{apiUrl || "http://localhost:4000"}</code>
          <span className="offline-mode-tag">● Offline-First Ativo</span>
        </p>
      </header>
      <form onSubmit={submit}>
        <fieldset>
          <legend>Empresa e filial</legend>
          <label className="login-label">
            Nome legal
            <input className="login-input" required value={form.legalName} onChange={(e) => change("legalName", e.target.value)} placeholder="Ex: Minha Empresa Lda" />
          </label>
          <label className="login-label">
            NIF <small>(opcional durante bootstrap)</small>
            <input className="login-input" value={form.nif} onChange={(e) => change("nif", e.target.value)} placeholder="5412345678" />
          </label>
          <label className="login-label">
            Código da filial
            <input className="login-input" required value={form.branchCode} onChange={(e) => change("branchCode", e.target.value)} placeholder="MAIN" />
          </label>
          <label className="login-label">
            Nome da filial
            <input className="login-input" required value={form.branchName} onChange={(e) => change("branchName", e.target.value)} placeholder="Sede" />
          </label>
        </fieldset>
        <fieldset>
          <legend>Administrador</legend>
          <label className="login-label">
            Nome completo
            <input className="login-input" required value={form.displayName} onChange={(e) => change("displayName", e.target.value)} placeholder="Nome do Administrador" />
          </label>
          <label className="login-label">
            Utilizador
            <input className="login-input" required minLength={3} value={form.username} onChange={(e) => change("username", e.target.value)} placeholder="admin" />
          </label>
          <label className="login-label">
            E-mail
            <input className="login-input" required type="email" value={form.email} onChange={(e) => change("email", e.target.value)} placeholder="admin@empresa.ao" />
          </label>
          <label className="login-label">
            Password forte (mín. 12 caracteres)
            <input className="login-input" required type="password" minLength={12} value={form.password} onChange={(e) => change("password", e.target.value)} placeholder="••••••••••••" />
          </label>
          <label className="login-label">
            Confirmar password
            <input className="login-input" required type="password" minLength={12} value={form.confirmPassword} onChange={(e) => change("confirmPassword", e.target.value)} placeholder="••••••••••••" />
          </label>
          <label className="login-label">
            PIN administrativo <small>(opcional, 4-6 dígitos para acesso rápido)</small>
            <input className="login-input" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} value={form.pin} onChange={(e) => change("pin", e.target.value.replace(/\D/g, ""))} placeholder="123456" />
          </label>
        </fieldset>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="checkout" disabled={saving}>
            {saving ? "A criar…" : "Criar empresa e administrador"}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}>
            Voltar ao login
          </button>
        </div>
      </form>
    </section>
  );
}
