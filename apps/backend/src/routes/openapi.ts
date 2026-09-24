import { Router } from "express";

export const openapiRouter = Router();
openapiRouter.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.3",
    info: { title: "VendaJá Angola API", version: "4.0.0" },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    paths: {
      "/platform/context": { get: { summary: "Contextos autorizados do utilizador", responses: { "200": { description: "Memberships" } } } },
      "/platform/cash-registers": { get: { summary: "Caixas do contexto ativo", responses: { "200": { description: "Caixas" } } }, post: { summary: "Criar caixa", responses: { "201": { description: "Caixa criada" } } } },
      "/platform/cash-registers/{id}/shifts": { post: { summary: "Abrir turno", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "201": { description: "Turno aberto" } } } },
      "/platform/shifts/{id}/close": { post: { summary: "Fechar turno e calcular divergência", responses: { "200": { description: "Turno fechado" } } } },
      "/platform/bank-accounts": { get: { summary: "Contas bancárias do contexto", responses: { "200": { description: "Contas" } } } },
      "/platform/bank-accounts/{id}/statements": { post: { summary: "Importar extrato idempotente", responses: { "201": { description: "Extrato" } } } },
      "/platform/payment-terminals/{id}/transactions": { post: { summary: "Criar transação de terminal idempotente", responses: { "201": { description: "Transação pendente" } } } },
      "/platform/reprints": { post: { summary: "Registar reimpressão autorizada", responses: { "201": { description: "Registo de auditoria" } } } },
    },
  });
});
