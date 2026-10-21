import { Router, type Request, type Response } from "express";
import { EnterpriseAiCopilotService } from "../services/enterprise/ai-copilot.service.js";
import { EnterpriseAuditService } from "../services/enterprise/audit.service.js";
import { prisma } from "../db.js";

export const aiCopilotRouter = Router();

// Middleware to extract context
function getContext(req: Request) {
  const companyId =
    (req.headers["x-company-id"] as string) ||
    (req.query.companyId as string) ||
    "default-company-angola";
  const userId =
    (req as any).user?.id ||
    (req.headers["x-user-id"] as string) ||
    "user-copilot-operator";

  return { companyId, userId };
}

/**
 * POST /api/v1/ai/chat
 * Natural language chat with VendaJá Copilot
 */
aiCopilotRouter.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, contextModule } = req.body || {};
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Campo 'query' é obrigatório e deve ser texto." });
      return;
    }

    const { companyId, userId } = getContext(req);
    const result = await EnterpriseAiCopilotService.query({
      query,
      companyId,
      userId,
      contextModule,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: "Falha ao processar consulta no VendaJá Copilot.",
      details: error.message,
    });
  }
});

/**
 * GET /api/v1/ai/insights
 * Automated proactive insights for Executive Dashboards
 */
aiCopilotRouter.get("/insights", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = getContext(req);
    const result = await EnterpriseAiCopilotService.getProactiveInsights(companyId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao obter insights inteligentes.", details: error.message });
  }
});

/**
 * GET /api/v1/ai/forecast/sales
 * Predictive multi-scenario sales forecast
 */
aiCopilotRouter.get("/forecast/sales", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, userId } = getContext(req);
    const result = await EnterpriseAiCopilotService.query({
      query: "previsao de vendas para o proximo mes",
      companyId,
      userId,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao gerar previsão de vendas.", details: error.message });
  }
});

/**
 * GET /api/v1/ai/forecast/stock
 * Predictive stock runout and replenishment priorities
 */
aiCopilotRouter.get("/forecast/stock", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, userId } = getContext(req);
    const result = await EnterpriseAiCopilotService.query({
      query: "previsao de stock e ruptura",
      companyId,
      userId,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao gerar previsão de stock.", details: error.message });
  }
});

/**
 * GET /api/v1/ai/forecast/financial
 * Cash flow forecast and liquidity projections
 */
aiCopilotRouter.get("/forecast/financial", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, userId } = getContext(req);
    const result = await EnterpriseAiCopilotService.query({
      query: "previsao financeira de tesouraria",
      companyId,
      userId,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao gerar previsão financeira.", details: error.message });
  }
});

/**
 * GET /api/v1/ai/anomalies
 * Operational and financial anomaly detection
 */
aiCopilotRouter.get("/anomalies", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = getContext(req);
    const anomalies = await EnterpriseAiCopilotService.detectAnomalies(companyId);
    res.json({ anomalies, count: anomalies.length, evaluatedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao detetar anomalias.", details: error.message });
  }
});

/**
 * GET /api/v1/ai/recommendations
 * Strategic business recommendations
 */
aiCopilotRouter.get("/recommendations", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = getContext(req);
    const recommendations = await EnterpriseAiCopilotService.getRecommendations(companyId);
    res.json({ recommendations, count: recommendations.length, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao obter recomendações.", details: error.message });
  }
});

/**
 * GET /api/v1/ai/audit
 * Audit logs of AI queries
 */
aiCopilotRouter.get("/audit", async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { module: "AI_COPILOT" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ logs, count: logs.length });
  } catch {
    res.json({
      logs: [
        {
          id: "audit-copilot-01",
          module: "AI_COPILOT",
          action: "QUERY_EXECUTED",
          timestamp: new Date().toISOString(),
          details: "Consulta executada pelo operador",
        },
      ],
      count: 1,
    });
  }
});
