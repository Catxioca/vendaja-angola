import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompanyContext, requireRole, type AuthRequest } from "../middleware/auth.js";
import { EnterpriseLicensingService } from "../services/enterprise/licensing.service.js";
import { encryptFiscalSecret, decryptFiscalSecret } from "../services/fiscal.js";
import { auditInContext } from "../services/security.js";

export const licenseRouter = Router();

const actor = (req: AuthRequest) => req.user?.id ?? "";
const context = (req: AuthRequest) => req.context!;

/**
 * GET /api/v1/license/status
 * Queries the cryptographic status of the active license for the current company
 */
licenseRouter.get("/status", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.context?.companyId || req.header("x-company-id");

  if (!companyId) {
    // If no specific company context, check if there is any company in DB
    const firstCompany = await prisma.company.findFirst({ select: { id: true } });
    if (!firstCompany) {
      res.json({ valid: false, reason: "company_unconfigured", modules: ["SETTINGS"] });
      return;
    }
  }

  const targetCompanyId = companyId || (await prisma.company.findFirst({ select: { id: true } }))?.id;
  if (!targetCompanyId) {
    res.json({ valid: false, reason: "company_unconfigured", modules: ["SETTINGS"] });
    return;
  }

  try {
    const fiscalConfig = await prisma.fiscalConfig.findUnique({
      where: { companyId: targetCompanyId },
      select: { licenseEncrypted: true, companyName: true, companyNif: true },
    });

    if (!fiscalConfig?.licenseEncrypted) {
      res.json({
        valid: false,
        reason: "no_license_installed",
        modules: ["SETTINGS"],
        message: "Nenhuma licença instalada nesta empresa. É necessária ativação com chave assinada pela VendaJá.",
      });
      return;
    }

    const decryptedToken = decryptFiscalSecret(fiscalConfig.licenseEncrypted);
    const verified = await EnterpriseLicensingService.validateToken(decryptedToken);

    if (!verified.valid) {
      res.json({
        valid: false,
        reason: verified.reason,
        expiresAt: verified.expiresAt,
        modules: ["SETTINGS"],
        message: `Licença inativa ou inválida: ${verified.reason}`,
      });
      return;
    }

    const decoded = EnterpriseLicensingService.decodeToken(decryptedToken);

    res.json({
      valid: true,
      licenseId: decoded.payload.licenseId,
      company: decoded.payload.nif || fiscalConfig.companyName || "Empresa Licenciada",
      nif: decoded.payload.nif || fiscalConfig.companyNif,
      plan: (decoded.payload as any).plan || "ENTERPRISE",
      startsAt: decoded.payload.startsAt,
      expiresAt: verified.expiresAt,
      modules: verified.modules || ["SETTINGS"],
      hardwareId: verified.hardwareId,
    });
  } catch (error) {
    console.error("[license/status] verification failed:", error);
    res.json({
      valid: false,
      reason: "verification_error",
      modules: ["SETTINGS"],
      message: "Falha ao verificar assinatura criptográfica da licença.",
    });
  }
});

/**
 * POST /api/v1/license/activate
 * Submits a vendor-signed RSA license token for cryptographic verification and backend storage
 */
licenseRouter.post("/activate", requireAuth, requireCompanyContext, requireRole("ROLE_ADMIN"), async (req, res: Response) => {
  const authReq = req as AuthRequest;
  const ctx = context(authReq);

  const parsed = z.object({
    licenseToken: z.string().trim().min(20, "O token de licença deve ser um token completo assinado pela VendaJá."),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_license_input",
      message: "Formato de chave de licença inválido. O token deve ser fornecido integralmente.",
    });
    return;
  }

  const token = parsed.data.licenseToken;

  try {
    // 1. Rigorous Cryptographic RSA-SHA256 Validation against vendor public.pem
    const verified = await EnterpriseLicensingService.validateToken(token);

    if (!verified.valid) {
      await auditInContext(
        "LICENSE_ACTIVATION_REJECTED",
        ctx,
        actor(authReq),
        "LICENSE",
        "REJECTED",
        { reason: verified.reason }
      );

      const messages: Record<string, string> = {
        invalid_signature: "A assinatura digital RSA da licença é inválida ou foi adulterada. Chave não emitida pelo fornecedor oficial VendaJá.",
        expired: "Esta licença empresarial atingiu a data de expiração e não é válida.",
        not_started: "Esta licença ainda não atingiu a data inicial de validade.",
        hardware_mismatch: "Esta licença foi emitida para outro identificador de instalação.",
      };

      res.status(400).json({
        error: "license_verification_failed",
        reason: verified.reason,
        message: messages[verified.reason || ""] || "A licença fornecida foi rejeitada pelo servidor de segurança.",
      });
      return;
    }

    const decoded = EnterpriseLicensingService.decodeToken(token);

    // 2. Encrypt token using AES-256-GCM and store in database
    const encrypted = encryptFiscalSecret(token);

    await prisma.fiscalConfig.upsert({
      where: { companyId: ctx.companyId },
      create: {
        id: `fiscal-${ctx.companyId}`,
        companyId: ctx.companyId,
        branchId: ctx.branchId,
        licenseEncrypted: encrypted,
        companyName: (decoded.payload as any).company || undefined,
        companyNif: decoded.payload.nif || undefined,
      },
      update: {
        licenseEncrypted: encrypted,
        ...(decoded.payload.nif ? { companyNif: decoded.payload.nif } : {}),
      },
    });

    // 3. Log audit record
    await auditInContext(
      "LICENSE_ACTIVATED",
      ctx,
      actor(authReq),
      "LICENSE",
      decoded.payload.licenseId || "ENTERPRISE",
      {
        modules: verified.modules,
        expiresAt: verified.expiresAt,
        nif: decoded.payload.nif,
      }
    );

    res.status(200).json({
      success: true,
      message: "Licença empresarial validada criptograficamente com sucesso pela autoridade VendaJá e ativada no servidor.",
      status: {
        valid: true,
        licenseId: decoded.payload.licenseId,
        plan: (decoded.payload as any).plan || "ENTERPRISE",
        expiresAt: verified.expiresAt,
        modules: verified.modules || ["SETTINGS"],
      },
    });
  } catch (error) {
    console.error("[license/activate] execution error:", error);
    res.status(500).json({
      error: "activation_error",
      message: "Ocorreu um erro no servidor ao validar a licença.",
    });
  }
});

/**
 * POST /api/v1/license/revoke
 * Revokes the current company license and locks operational modules
 */
licenseRouter.post("/revoke", requireAuth, requireCompanyContext, requireRole("ROLE_ADMIN"), async (req, res: Response) => {
  const authReq = req as AuthRequest;
  const ctx = context(authReq);

  try {
    await prisma.fiscalConfig.updateMany({
      where: { companyId: ctx.companyId },
      data: { licenseEncrypted: null },
    });

    await auditInContext("LICENSE_REVOKED", ctx, actor(authReq), "LICENSE", "REVOKED");

    res.json({
      success: true,
      message: "Licença revogada com sucesso. Todos os módulos operacionais foram bloqueados.",
    });
  } catch (error) {
    res.status(500).json({ error: "revoke_failed", message: "Falha ao revogar licença." });
  }
});
