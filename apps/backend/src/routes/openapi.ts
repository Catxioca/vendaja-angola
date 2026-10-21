import { Router, type Request, type Response } from "express";

export const openapiRouter = Router();

export const openApiSpecification = {
  openapi: "3.0.3",
  info: {
    title: "VendaJá Angola — Enterprise API Gateway",
    version: "5.0.0",
    description:
      "API REST Corporativa, aberta, escalável e segura do ecossistema ERP VendaJá Angola. Suporta autenticação JWT, OAuth2 (Client Credentials), chaves de API ('x-api-key'), Webhooks com assinatura HMAC-SHA256, conectores governamentais (AGT SAF-T AO), conectores financeiros (Multicaixa Express / GPO EMIS), ERPs externos (Primavera BSS, SAP Business One), E-Commerce (Shopify / WooCommerce) e Datasets analíticos para Microsoft Power BI.",
    contact: {
      name: "VendaJá Angola Enterprise Support & Developer Portal",
      email: "developers@vendaja.ao",
      url: "https://vendaja.ao/developers",
    },
    license: {
      name: "Proprietary Commercial Enterprise",
      url: "https://vendaja.ao/legal/terms",
    },
  },
  servers: [
    { url: "http://localhost:4000/api/v1", description: "Ambiente Local de Desenvolvimento / Desktop Bridge" },
    { url: "https://api.vendaja.ao/v1", description: "Produção Corporativa Cloud (Angola Multitenant)" },
    { url: "http://localhost:4000/api/v2", description: "Ambiente Futuro / Próxima Geração (v2)" },
  ],
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Token JWT emitido por /api/v1/auth/login ou OAuth2 Client Credentials via /api/v1/integrations/oauth/token",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Chave de API pré-gerada no portal corporativo (formato vj_live_...)",
      },
      hmacSignature: {
        type: "apiKey",
        in: "header",
        name: "x-vendaja-signature",
        description: "Assinatura HMAC-SHA256 do payload enviado em Webhooks para garantia de integridade",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "unauthorized" },
          message: { type: "string", example: "Credenciais inválidas ou ausentes" },
          correlationId: { type: "string", example: "req-987abc" },
        },
      },
      Customer: {
        type: "object",
        properties: {
          id: { type: "string", example: "cust-001" },
          name: { type: "string", example: "Sonangol EP" },
          nif: { type: "string", example: "5412345678" },
          email: { type: "string", example: "compras@sonangol.co.ao" },
          phone: { type: "string", example: "+244923000000" },
          creditLimitCents: { type: "integer", example: 100000000 },
          active: { type: "boolean", example: true },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string", example: "prod-001" },
          sku: { type: "string", example: "CAF-001" },
          name: { type: "string", example: "Café de Angola 500g" },
          priceCents: { type: "integer", example: 250000 },
          stock: { type: "integer", example: 120 },
          taxRate: { type: "number", example: 0.14 },
          active: { type: "boolean", example: true },
        },
      },
      Sale: {
        type: "object",
        properties: {
          id: { type: "string", example: "sale-001" },
          number: { type: "string", example: "FR A/2026/001" },
          fiscalType: { type: "string", example: "INVOICE_RECEIPT" },
          totalCents: { type: "integer", example: 15000000 },
          status: { type: "string", example: "VALID" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/oauth/token": {
      post: {
        summary: "OAuth2 Client Credentials Grant",
        description: "Emissão de tokens OAuth2 de acesso corporativo máquina-para-máquina (M2M)",
        tags: ["OAuth2 & Segurança"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  grant_type: { type: "string", example: "client_credentials" },
                  client_id: { type: "string", example: "client_vj_enterprise" },
                  client_secret: { type: "string", example: "sec_9876543210" },
                  scope: { type: "string", example: "api:all" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Token de acesso emitido" },
          "400": { description: "Parâmetros inválidos" },
          "401": { description: "Credenciais de cliente inválidas" },
        },
      },
    },
    "/oauth/introspect": {
      post: {
        summary: "OAuth2 Token Introspection (RFC 7662)",
        tags: ["OAuth2 & Segurança"],
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } },
        },
        responses: { "200": { description: "Detalhes de validade e escopos do token" } },
      },
    },
    "/oauth/revoke": {
      post: {
        summary: "OAuth2 Token Revocation (RFC 7009)",
        tags: ["OAuth2 & Segurança"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" }, reason: { type: "string" } } } } },
        },
        responses: { "200": { description: "Token revogado e inserido na blacklist" } },
      },
    },
    "/customers": {
      get: {
        summary: "Listar clientes",
        tags: ["Clientes"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "q", in: "query", schema: { type: "string" }, description: "Busca por Nome ou NIF" },
        ],
        responses: { "200": { description: "Lista paginada de clientes" } },
      },
      post: {
        summary: "Criar novo cliente",
        tags: ["Clientes"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Sonangol EP" },
                  nif: { type: "string", example: "5412345678" },
                  email: { type: "string", example: "compras@sonangol.co.ao" },
                  phone: { type: "string", example: "+244923000000" },
                  creditLimitKz: { type: "number", example: 1000000 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Cliente cadastrado e evento de webhook disparado" } },
      },
    },
    "/customers/{id}": {
      put: { summary: "Atualizar cliente (substituição completa)", tags: ["Clientes"], responses: { "200": { description: "Cliente atualizado" } } },
      patch: { summary: "Atualização parcial de cliente", tags: ["Clientes"], responses: { "200": { description: "Cliente modificado" } } },
      delete: { summary: "Inativar cliente", tags: ["Clientes"], responses: { "200": { description: "Cliente inativado" } } },
    },
    "/products": {
      get: {
        summary: "Listar catálogo de produtos",
        tags: ["Produtos"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { "200": { description: "Lista de produtos com preços e stock" } },
      },
      post: {
        summary: "Criar produto no catálogo",
        tags: ["Produtos"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "sku"],
                properties: {
                  name: { type: "string" },
                  sku: { type: "string" },
                  priceKz: { type: "number" },
                  stock: { type: "integer" },
                  taxRate: { type: "number", default: 0.14 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Produto criado" } },
      },
    },
    "/sales": {
      get: {
        summary: "Listar histórico de vendas fiscais",
        tags: ["Vendas"],
        responses: { "200": { description: "Transações de venda registradas" } },
      },
    },
    "/invoices/{id}": {
      get: {
        summary: "Consultar fatura detalhada com linhas e hash AGT",
        tags: ["Vendas"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Fatura detalhada" } },
      },
    },
    "/integrations/keys": {
      get: { summary: "Listar API Keys ativas da empresa", tags: ["Integrações & API Keys"], responses: { "200": { description: "Lista de chaves de API" } } },
      post: {
        summary: "Gerar nova API Key",
        tags: ["Integrações & API Keys"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "scopes"],
                properties: {
                  name: { type: "string", example: "PowerBI Connector" },
                  scopes: { type: "array", items: { type: "string" }, example: ["API.Sales.Read", "API.Products.Read"] },
                  rateLimitRpm: { type: "integer", default: 120 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "API Key gerada (rawKey exibida apenas uma vez)" } },
      },
    },
    "/integrations/webhooks": {
      get: { summary: "Listar subscrições de Webhooks", tags: ["Webhooks Corporativos"], responses: { "200": { description: "Webhooks configurados" } } },
      post: {
        summary: "Registar subscrição de Webhook",
        tags: ["Webhooks Corporativos"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url", "events"],
                properties: {
                  url: { type: "string", example: "https://erp-externo.exemplo.ao/webhooks/vj" },
                  events: { type: "array", items: { type: "string" }, example: ["sale.created", "customer.created"] },
                  secret: { type: "string", example: "minha-chave-secreta-hmac" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Subscrição criada" } },
      },
    },
    "/integrations/connectors": {
      get: { summary: "Listar conectores corporativos (AGT, Multicaixa, Primavera, SAP, Shopify)", tags: ["Central de Conectores"], responses: { "200": { description: "Status dos conectores" } } },
    },
    "/integrations/bi/sales": {
      get: {
        summary: "Dataset analítico de vendas para Microsoft Power BI",
        tags: ["Power BI Analytics"],
        parameters: [{ name: "since", in: "query", schema: { type: "string", format: "date-time" }, description: "Carga incremental" }],
        responses: { "200": { description: "Dataset formatado para Power BI DirectQuery / Import" } },
      },
    },
    "/integrations/exchange/export": {
      post: {
        summary: "Exportação Universal de Dados (Excel, CSV, JSON, XML)",
        tags: ["Importação & Exportação"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["entity", "format"],
                properties: {
                  entity: { type: "string", enum: ["customers", "products", "sales", "purchases", "accounts"] },
                  format: { type: "string", enum: ["excel", "csv", "json", "xml"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Ficheiro descarregável com o formato solicitado" } },
      },
    },
    "/integrations/telemetry/metrics": {
      get: { summary: "Métricas de telemetria da API (RPM, Latências p50/p95/p99, Taxa de erros)", tags: ["Telemetria & Monitorização"], responses: { "200": { description: "Métricas operacionais" } } },
    },
    "/bi/kpis": {
      get: { summary: "Indicadores Corporativos Centrais (EBITDA, Margens, Liquidez, Rotação, Ticket Médio)", tags: ["Business Intelligence & Analytics"], responses: { "200": { description: "Conjunto de KPIs consolidados" } } },
    },
    "/bi/dashboards/{department}": {
      get: { summary: "Cockpit Executivo Departamental (executive, financial, commercial, procurement, stock, hr)", tags: ["Business Intelligence & Analytics"], parameters: [{ name: "department", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Dados estruturados do cockpit departamental" } } },
    },
    "/bi/forecast": {
      get: { summary: "Motor Preditivo Multi-Cenário (Conservador, Realista, Otimista) a 6 meses", tags: ["Business Intelligence & Analytics"], responses: { "200": { description: "Projeções preditivas e intervalos de confiança" } } },
    },
    "/bi/powerbi/connector.pbids": {
      get: { summary: "Download do Conector Nativo Microsoft Power BI (.pbids) para Desktop", tags: ["Business Intelligence & Analytics"], responses: { "200": { description: "Ficheiro PBIDS pronto a abrir no Power BI Desktop" } } },
    },
    "/bi/consolidation/holding": {
      get: { summary: "Consolidação Executiva Multi-Empresa com Eliminação de Operações Intercompanhia", tags: ["Business Intelligence & Analytics"], responses: { "200": { description: "Cockpit consolidado do grupo/holding" } } },
    },
  },
};

openapiRouter.get("/openapi.json", (_req: Request, res: Response) => {
  res.json(openApiSpecification);
});

openapiRouter.get("/docs", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>VendaJá Angola — Enterprise API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; background-color: #0f172a; color: #f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .topbar { background: #0284c7; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .topbar-brand { font-size: 1.25rem; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px; }
    .topbar-tag { background: #0369a1; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase; font-weight: 600; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
    .swagger-ui .highlight-code { filter: invert(0%); }
    .footer-bar { padding: 16px; text-align: center; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-brand">
      <span>🇦🇴 VendaJá Angola ERP</span>
      <span class="topbar-tag">OpenAPI 3.0.3 Gateway</span>
    </div>
    <div>
      <a href="/api/openapi.json" target="_blank" style="color: white; text-decoration: none; font-weight: 600; font-size: 0.875rem; background: rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 6px;">Baixar JSON OpenAPI</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <div class="footer-bar">
    VendaJá Angola v5.0 — Conectividade Corporativa (Primavera BSS, SAP Business One, EMIS Multicaixa, AGT SAF-T AO, Microsoft Power BI)
  </div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`);
});
