import { Router, type Request, type Response } from "express";
import {
  EnterpriseCorporateHeadquartersService,
  type CorporateRole,
  type PatchCategory,
} from "../services/enterprise/corporate-headquarters.service.js";

export const corporateHeadquartersRouter = Router();

function getCompanyId(req: Request): string {
  return (
    (req.headers["x-company-id"] as string) ||
    (req.query.companyId as string) ||
    "default-company-angola"
  );
}

function getActorName(req: Request): string {
  return (
    (req.headers["x-actor-name"] as string) ||
    (req as any).user?.displayName ||
    (req as any).user?.username ||
    "Administração Central"
  );
}

/**
 * GET /api/v1/corporate/cockpit
 * Consolidated real-time multi-store headquarters cockpit
 */
corporateHeadquartersRouter.get("/cockpit", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const cockpit = await EnterpriseCorporateHeadquartersService.getHeadquartersCockpit(companyId);
    res.json(cockpit);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao carregar cockpit corporativo.", details: error.message });
  }
});

/**
 * GET /api/v1/corporate/stores
 * List stores and branches
 */
corporateHeadquartersRouter.get("/stores", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const cockpit = await EnterpriseCorporateHeadquartersService.getHeadquartersCockpit(companyId);
    res.json(cockpit.stores);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao listar filiais.", details: error.message });
  }
});

/**
 * POST /api/v1/corporate/stores
 * Register or update store
 */
corporateHeadquartersRouter.post("/stores", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const actorName = getActorName(req);
    const { code, name, isHeadquarters, active } = req.body || {};

    if (!code || !name) {
      res.status(400).json({ error: "Código e nome da loja são obrigatórios." });
      return;
    }

    const branch = await EnterpriseCorporateHeadquartersService.registerOrUpdateStore(
      companyId,
      { code, name, isHeadquarters, active },
      actorName
    );
    res.status(201).json(branch);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao registar filial.", details: error.message });
  }
});

/**
 * POST /api/v1/corporate/stores/heartbeat
 * Store telemetry heartbeat ingestion
 */
corporateHeadquartersRouter.post("/stores/heartbeat", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const body = req.body || {};

    if (!body.branchId || !body.branchCode) {
      res.status(400).json({ error: "branchId e branchCode são obrigatórios." });
      return;
    }

    await EnterpriseCorporateHeadquartersService.heartbeatStoreStatus(companyId, body);
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao processar telemetria.", details: error.message });
  }
});

/**
 * POST /api/v1/corporate/users
 * Centralized User Creation from Headquarters
 */
corporateHeadquartersRouter.post("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const actorName = getActorName(req);
    const { email, username, displayName, password, role, branchId, department, phone, nif, modules } = req.body || {};

    if (!email || !username || !displayName || !role) {
      res.status(400).json({ error: "email, username, displayName e role são obrigatórios." });
      return;
    }

    const user = await EnterpriseCorporateHeadquartersService.createCorporateUser(
      companyId,
      {
        email,
        username,
        displayName,
        password,
        role: role as CorporateRole,
        branchId,
        department,
        phone,
        nif,
        modules,
      },
      actorName
    );

    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao criar utilizador corporativo.", details: error.message });
  }
});

/**
 * POST /api/v1/corporate/users/:id/suspend
 * Immediate user suspension across all branches
 */
corporateHeadquartersRouter.post("/users/:id/suspend", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const actorName = getActorName(req);
    const userId = String(req.params.id);
    const { reason } = req.body || {};

    if (!userId) {
      res.status(400).json({ error: "userId obrigatório." });
      return;
    }

    const result = await EnterpriseCorporateHeadquartersService.suspendCorporateUser(
      companyId,
      userId,
      reason || "Suspensão preventiva pela sede.",
      actorName
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao suspender utilizador.", details: error.message });
  }
});

/**
 * PUT /api/v1/corporate/users/:id/role
 * Reassign store and role
 */
corporateHeadquartersRouter.put("/users/:id/role", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const actorName = getActorName(req);
    const userId = String(req.params.id);
    const { role, branchId, modules } = req.body || {};

    if (!userId || !role) {
      res.status(400).json({ error: "userId e role são obrigatórios." });
      return;
    }

    const result = await EnterpriseCorporateHeadquartersService.assignStoreAndRole(
      companyId,
      userId,
      { role: role as CorporateRole, branchId, modules },
      actorName
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao atualizar função do utilizador.", details: error.message });
  }
});

/**
 * POST /api/v1/corporate/modules/control
 * Remote module activation/deactivation per branch
 */
corporateHeadquartersRouter.post("/modules/control", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const actorName = getActorName(req);
    const { branchId, moduleCode, status } = req.body || {};

    if (!branchId || !moduleCode || !status) {
      res.status(400).json({ error: "branchId, moduleCode e status são obrigatórios." });
      return;
    }

    const result = await EnterpriseCorporateHeadquartersService.setStoreModuleStatus(
      companyId,
      branchId,
      moduleCode,
      status,
      actorName
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao controlar módulo da filial.", details: error.message });
  }
});

/**
 * POST /api/v1/corporate/live-updates/publish
 * Publish live patch / module component without new installer
 */
corporateHeadquartersRouter.post("/live-updates/publish", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const actorName = getActorName(req);
    const { patchVersion, title, description, category, targetModules, targetBranches, payloadJson, isCritical } = req.body || {};

    if (!patchVersion || !title || !payloadJson) {
      res.status(400).json({ error: "patchVersion, title e payloadJson são obrigatórios." });
      return;
    }

    const result = await EnterpriseCorporateHeadquartersService.publishLivePatch(
      companyId,
      {
        patchVersion,
        title,
        description: description || "",
        category: (category as PatchCategory) || "HOTFIX",
        targetModules,
        targetBranches,
        payloadJson,
        isCritical,
      },
      actorName
    );

    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao publicar atualização live.", details: error.message });
  }
});

/**
 * GET /api/v1/corporate/live-updates/check
 * Check pending live patches for branch
 */
corporateHeadquartersRouter.get("/live-updates/check", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const branchId = String(req.query.branchId || "HQ");
    const currentVersion = String(req.query.currentVersion || "2.2.4");

    const patches = await EnterpriseCorporateHeadquartersService.checkPendingPatches(
      companyId,
      branchId,
      currentVersion
    );

    res.json({
      branchId,
      patchesAvailable: patches.length > 0,
      count: patches.length,
      patches,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao verificar atualizações pendentes.", details: error.message });
  }
});

/**
 * POST /api/v1/corporate/broadcasts
 * Issue corporate circular / notice to stores
 */
corporateHeadquartersRouter.post("/broadcasts", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const actorName = getActorName(req);
    const { title, content, priority, targetBranches, senderUserId } = req.body || {};

    if (!title || !content) {
      res.status(400).json({ error: "Título e conteúdo são obrigatórios." });
      return;
    }

    const result = await EnterpriseCorporateHeadquartersService.sendBroadcast(
      companyId,
      {
        title,
        content,
        priority,
        targetBranches,
        senderUserId: senderUserId || "admin-hq",
      },
      actorName
    );

    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao emitir comunicado.", details: error.message });
  }
});

/**
 * GET /api/v1/corporate/events
 * Real-time event stream
 */
corporateHeadquartersRouter.get("/events", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const limit = parseInt(String(req.query.limit || "50"), 10);
    const events = await EnterpriseCorporateHeadquartersService.getEventStream(companyId, limit);
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao obter stream de eventos.", details: error.message });
  }
});
