import { Router, type Request, type Response } from "express";
import {
  ApiKeyService,
  OAuthService,
  EnterpriseWebhookService,
  IntegrationHubService,
  EnterpriseBiService,
  DataExchangeService,
  EnterpriseEmailService,
  EnterpriseWhatsAppService,
  PluginService,
  ApiMonitoringService,
} from "../services/enterprise/index.js";
import { requireApiAuth } from "../middleware/api-security.js";

export const integrationsRouter = Router();

// ==========================================
// 1. OAUTH2 ENDPOINTS
// ==========================================
integrationsRouter.post("/oauth/token", async (req: Request, res: Response) => {
  const { grant_type, client_id, client_secret, scope } = req.body;
  if (grant_type !== "client_credentials") {
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Apenas 'client_credentials' é suportado atualmente.",
    });
    return;
  }

  if (!client_id || !client_secret) {
    res.status(400).json({
      error: "invalid_client",
      error_description: "client_id e client_secret são obrigatórios.",
    });
    return;
  }

  const result = await OAuthService.generateClientCredentialsToken(client_id, client_secret, scope);
  if (!result.success) {
    res.status(401).json({
      error: "invalid_client",
      error_description: result.error,
    });
    return;
  }

  res.json({
    access_token: result.accessToken,
    token_type: "Bearer",
    expires_in: result.expiresIn,
    scope: scope || "api:all",
  });
});

integrationsRouter.post("/oauth/introspect", async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: "missing_token", error_description: "Token é obrigatório para introspecção." });
    return;
  }

  const introspection = await OAuthService.introspectToken(token);
  res.json(introspection);
});

integrationsRouter.post("/oauth/revoke", async (req: Request, res: Response) => {
  const { token, reason } = req.body;
  if (!token) {
    res.status(400).json({ error: "missing_token", error_description: "Token é obrigatório para revogação." });
    return;
  }

  const success = await OAuthService.revokeToken(token, reason || "user_revoked");
  res.json({ revoked: success });
});

// ==========================================
// 2. API KEYS MANAGEMENT
// ==========================================
integrationsRouter.get("/keys", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const keys = await ApiKeyService.listApiKeys(companyId);
  res.json({ data: keys });
});

integrationsRouter.post("/keys", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const { name, scopes, rateLimitRpm, expiresAt, companyId } = req.body;
  const targetCompany = companyId || (req.headers["x-company-id"] as string) || "comp-default";

  if (!name || !scopes || !Array.isArray(scopes)) {
    res.status(400).json({ error: "invalid_payload", message: "name e array de scopes são obrigatórios" });
    return;
  }

  const result = await ApiKeyService.generateApiKey(targetCompany, name, scopes, rateLimitRpm, expiresAt ? new Date(expiresAt) : undefined);
  res.status(201).json({
    message: "API Key gerada com sucesso. Guarde o segredo 'rawKey', ele não será mostrado novamente.",
    data: result,
  });
});

integrationsRouter.delete("/keys/:id", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const success = await ApiKeyService.revokeApiKey(String(req.params.id), companyId);
  res.json({ success, message: success ? "API Key revogada com sucesso" : "API Key não encontrada" });
});

// ==========================================
// 3. CORPORATE WEBHOOKS
// ==========================================
integrationsRouter.get("/webhooks", requireApiAuth("API.Webhooks.Manage"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const webhooks = await EnterpriseWebhookService.listSubscriptions(companyId);
  res.json({ data: webhooks });
});

integrationsRouter.post("/webhooks", requireApiAuth("API.Webhooks.Manage"), async (req: Request, res: Response) => {
  const { url, events, secret, companyId } = req.body;
  const targetCompany = companyId || (req.headers["x-company-id"] as string) || "comp-default";

  if (!url || !events || !Array.isArray(events)) {
    res.status(400).json({ error: "invalid_payload", message: "url e array de events são obrigatórios." });
    return;
  }

  const sub = await EnterpriseWebhookService.registerSubscription({
    companyId: targetCompany,
    url,
    events,
    secret,
  });

  res.status(201).json({ message: "Webhook registado com sucesso", data: sub });
});

integrationsRouter.delete("/webhooks/:id", requireApiAuth("API.Webhooks.Manage"), async (req: Request, res: Response) => {
  const success = await EnterpriseWebhookService.deleteSubscription(String(req.params.id));
  res.json({ success, message: success ? "Webhook removido com sucesso" : "Webhook não encontrado" });
});

integrationsRouter.post("/webhooks/test", requireApiAuth("API.Webhooks.Manage"), async (req: Request, res: Response) => {
  const { event, payload, companyId } = req.body;
  const result = await EnterpriseWebhookService.dispatch(
    event || "ping.test",
    payload || { test: true, timestamp: new Date().toISOString() },
    companyId
  );
  res.json({ message: "Webhook disparado para assinantes", deliveries: result });
});

integrationsRouter.get("/webhooks/deliveries", requireApiAuth("API.Webhooks.Manage"), async (req: Request, res: Response) => {
  const subscriptionId = req.query.subscriptionId as string;
  const deliveries = await EnterpriseWebhookService.listDeliveries(subscriptionId);
  res.json({ data: deliveries });
});

// ==========================================
// 4. CENTRAL DE INTEGRAÇÕES (CONNECTORS)
// ==========================================
integrationsRouter.get("/connectors", requireApiAuth("API.Integrations.Manage"), async (_req: Request, res: Response) => {
  const connectors = await IntegrationHubService.listConnectors();
  res.json({ data: connectors });
});

integrationsRouter.post("/connectors/:provider/config", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const provider = String(req.params.provider);
  const { config, credentials, enabled, companyId } = req.body;
  const targetCompany = companyId || (req.headers["x-company-id"] as string) || "comp-default";

  const updated = await IntegrationHubService.saveConnectorConfig(targetCompany, provider, {
    config,
    credentials,
    enabled,
  });
  res.json({ message: "Configuração de conector salva", data: updated });
});

integrationsRouter.post("/connectors/:provider/test", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const provider = String(req.params.provider);
  const result = await IntegrationHubService.testConnection(provider);
  res.json(result);
});

integrationsRouter.post("/connectors/:provider/sync", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const provider = String(req.params.provider);
  const { mode, companyId } = req.body;
  const targetCompany = companyId || (req.headers["x-company-id"] as string) || "comp-default";

  const syncResult = await IntegrationHubService.triggerSync(targetCompany, provider, mode || "incremental");
  res.json(syncResult);
});

integrationsRouter.get("/connectors/logs", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const provider = req.query.provider as string;
  const logs = await IntegrationHubService.listSyncLogs(provider);
  res.json({ data: logs });
});

// ==========================================
// 5. POWER BI & ANALYTICS DATASETS
// ==========================================
integrationsRouter.get("/bi/sales", requireApiAuth("API.Sales.Read"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const since = req.query.since ? new Date(String(req.query.since)) : undefined;
  const data = await EnterpriseBiService.getSalesDataset(companyId, since);
  res.json({ dataset: "VendaJá_Sales_Analytics", count: data.length, records: data });
});

integrationsRouter.get("/bi/purchases", requireApiAuth("API.Purchases.Read"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const since = req.query.since ? new Date(String(req.query.since)) : undefined;
  const data = await EnterpriseBiService.getPurchasesDataset(companyId, since);
  res.json({ dataset: "VendaJá_Purchases_Analytics", count: data.length, records: data });
});

integrationsRouter.get("/bi/inventory", requireApiAuth("API.Products.Read"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const data = await EnterpriseBiService.getInventoryDataset(companyId);
  res.json({ dataset: "VendaJá_Inventory_Analytics", count: data.length, records: data });
});

integrationsRouter.get("/bi/cashflow", requireApiAuth("API.Accounting.Read"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const data = await EnterpriseBiService.getCashflowDataset(companyId);
  res.json({ dataset: "VendaJá_Cashflow_Analytics", count: data.length, records: data });
});

integrationsRouter.get("/bi/payroll", requireApiAuth("API.Accounting.Read"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const data = await EnterpriseBiService.getHrDataset(companyId);
  res.json({ dataset: "VendaJá_Payroll_Analytics", count: data.length, records: data });
});

// ==========================================
// 6. IMPORTAÇÃO & EXPORTAÇÃO UNIVERSAL
// ==========================================
integrationsRouter.post("/exchange/export", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const { entity, format, filter } = req.body;
  if (!entity || !format) {
    res.status(400).json({ error: "missing_parameters", message: "entity e format (csv, json, xml, excel) são obrigatórios." });
    return;
  }

  const result = await DataExchangeService.exportData(entity, format, filter);
  if (!result.success) {
    res.status(400).json({ error: "export_failed", message: result.error });
    return;
  }

  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("Content-Type", result.contentType || "application/octet-stream");
  res.send(result.content);
});

integrationsRouter.post("/exchange/import", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const { entity, format, rawContent } = req.body;
  if (!entity || !format || !rawContent) {
    res.status(400).json({ error: "missing_parameters", message: "entity, format e rawContent são obrigatórios." });
    return;
  }

  const result = await DataExchangeService.importData(entity, format, rawContent);
  res.json(result);
});

// ==========================================
// 7. MENSAGENS OMNICANAL (EMAIL & WHATSAPP)
// ==========================================
integrationsRouter.post("/email/send", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const { to, subject, body, templateId, templateVariables, companyId } = req.body;
  const targetCompany = companyId || (req.headers["x-company-id"] as string) || "comp-default";

  if (!to || (!body && !templateId)) {
    res.status(400).json({ error: "missing_fields", message: "to e body/templateId são obrigatórios." });
    return;
  }

  const result = await EnterpriseEmailService.sendEmail({
    companyId: targetCompany,
    to,
    subject: subject || "Notificação VendaJá Angola",
    body: body || "",
    templateId,
    templateVariables,
  });

  res.json(result);
});

integrationsRouter.get("/email/logs", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const logs = await EnterpriseEmailService.listOutbox(companyId);
  res.json({ data: logs });
});

integrationsRouter.post("/whatsapp/send", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const { toPhone, message, templateId, templateVariables, documentUrl, companyId } = req.body;
  const targetCompany = companyId || (req.headers["x-company-id"] as string) || "comp-default";

  if (!toPhone || (!message && !templateId)) {
    res.status(400).json({ error: "missing_fields", message: "toPhone e message/templateId são obrigatórios." });
    return;
  }

  const result = await EnterpriseWhatsAppService.sendWhatsApp({
    companyId: targetCompany,
    toPhone,
    message: message || "",
    templateId,
    templateVariables,
    documentUrl,
  });

  res.json(result);
});

integrationsRouter.get("/whatsapp/logs", requireApiAuth("API.Integrations.Manage"), async (req: Request, res: Response) => {
  const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "comp-default";
  const logs = await EnterpriseWhatsAppService.listOutbox(companyId);
  res.json({ data: logs });
});

// ==========================================
// 8. MARKETPLACE & PLUGINS
// ==========================================
integrationsRouter.get("/plugins", requireApiAuth("API.Plugins.Manage"), async (_req: Request, res: Response) => {
  const plugins = await PluginService.listPlugins();
  res.json({ data: plugins });
});

integrationsRouter.post("/plugins/:id/install", requireApiAuth("API.Plugins.Manage"), async (req: Request, res: Response) => {
  const result = await PluginService.installPlugin(String(req.params.id));
  res.json(result);
});

integrationsRouter.post("/plugins/:id/toggle", requireApiAuth("API.Plugins.Manage"), async (req: Request, res: Response) => {
  const { enabled } = req.body;
  const result = await PluginService.togglePlugin(String(req.params.id), Boolean(enabled));
  res.json(result);
});

integrationsRouter.delete("/plugins/:id", requireApiAuth("API.Plugins.Manage"), async (req: Request, res: Response) => {
  const result = await PluginService.uninstallPlugin(String(req.params.id));
  res.json(result);
});

// ==========================================
// 9. TELEMETRIA & MONITORIZAÇÃO DA API
// ==========================================
integrationsRouter.get("/telemetry/metrics", requireApiAuth("API.Integrations.Manage"), async (_req: Request, res: Response) => {
  const snapshot = ApiMonitoringService.getTelemetrySnapshot();
  res.json({ telemetry: snapshot });
});

integrationsRouter.get("/telemetry/alerts", requireApiAuth("API.Integrations.Manage"), async (_req: Request, res: Response) => {
  const alerts = ApiMonitoringService.getActiveAlerts();
  res.json({ alerts });
});
