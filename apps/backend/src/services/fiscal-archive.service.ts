import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db.js";

export interface FiscalArchiveMetadata {
  generatorVersion: string;
  softwareVersion: string;
  certificationReference: string;
  exportTimestamp: string;
  exportedBy: string;
  periodStart: string;
  periodEnd: string;
  documentCount: number;
  totalDebitCents: number;
  totalCreditCents: number;
  exportType: "SAFT_AO" | "MONTHLY_BILLING" | "AUDIT_EXTRACT";
  declaration: string;
}

export interface ArchiveFiscalExportInput {
  companyId: string;
  branchId?: string | null;
  exportType: "SAFT_AO" | "MONTHLY_BILLING" | "AUDIT_EXTRACT";
  periodStart: Date;
  periodEnd: Date;
  content: string | Buffer;
  exportedBy: string;
  softwareVersion?: string;
  certificationReference?: string;
  documentCount?: number;
  totalDebitCents?: number;
  totalCreditCents?: number;
}

export interface FiscalArchiveVerificationResult {
  archiveId: string;
  code: string;
  status: "INTACT" | "TAMPERED" | "CORRUPTED";
  storedChecksum: string;
  computedChecksum: string;
  byteLength: number;
  retentionExpiresAt: Date | null;
  withinMandatoryRetention: boolean;
  verifiedAt: Date;
}

export class FiscalArchiveService {
  constructor(private readonly prisma: PrismaClient | typeof defaultPrisma = defaultPrisma) {}

  /**
   * Archives a generated fiscal file (e.g. SAF-T AO structural export)
   * with immutable SHA-256 checksum, metadata and configurable legal retention period.
   */
  async archiveFiscalExport(input: ArchiveFiscalExportInput) {
    const buffer = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
    const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const byteLength = buffer.length;

    // Fetch tenant fiscal config to determine retention policy
    const fiscalConfig = await this.prisma.fiscalConfig.findUnique({
      where: { companyId: input.companyId },
    });

    const retentionYears = fiscalConfig?.fiscalArchiveRetentionYears ?? 10; // Default 10 years legal retention
    const retentionExpiresAt = new Date();
    retentionExpiresAt.setFullYear(retentionExpiresAt.getFullYear() + retentionYears);

    const archiveCode = `FA-${input.companyId.slice(0, 8)}-${Date.now()}`;
    const storagePath = `archives/${input.companyId}/${archiveCode}.xml`;

    const metadata: FiscalArchiveMetadata = {
      generatorVersion: "3.2.1-rc.4",
      softwareVersion: input.softwareVersion ?? fiscalConfig?.softwareVersion ?? "3.2.1-rc.4",
      certificationReference: input.certificationReference ?? fiscalConfig?.softwareCertificationNumber ?? "PROVISIONAL",
      exportTimestamp: new Date().toISOString(),
      exportedBy: input.exportedBy,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      documentCount: input.documentCount ?? 0,
      totalDebitCents: input.totalDebitCents ?? 0,
      totalCreditCents: input.totalCreditCents ?? 0,
      exportType: input.exportType,
      declaration: "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.",
    };

    // Store in EnterpriseDocument table
    const doc = await this.prisma.enterpriseDocument.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId,
        code: archiveCode,
        title: `Arquivo Fiscal ${input.exportType} - ${input.periodStart.toISOString().slice(0, 7)}`,
        description: `Exportação fiscal estrutural arquivada com retenção de ${retentionYears} anos.`,
        category: "FISCAL_ARCHIVE",
        mimeType: "application/xml",
        fileExtension: "xml",
        sizeBytes: byteLength,
        storagePath,
        checksumSha256,
        expiryDate: retentionExpiresAt,
        status: "ACTIVE",
        createdById: input.exportedBy,
        tags: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      archiveId: doc.id,
      archiveCode: doc.code,
      checksumSha256,
      sizeBytes: byteLength,
      retentionYears,
      retentionExpiresAt,
      metadata,
    };
  }

  /**
   * Verifies the cryptographic integrity of an archived fiscal file.
   */
  async verifyFiscalArchiveIntegrity(
    archiveId: string,
    currentContent: string | Buffer
  ): Promise<FiscalArchiveVerificationResult> {
    const doc = await this.prisma.enterpriseDocument.findUnique({
      where: { id: archiveId },
    });
    if (!doc) throw new Error("fiscal_archive_not_found");

    const buffer = Buffer.isBuffer(currentContent) ? currentContent : Buffer.from(currentContent, "utf8");
    const computedChecksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const isIntact = computedChecksum === doc.checksumSha256;

    const now = new Date();
    const withinMandatoryRetention = doc.expiryDate ? now < doc.expiryDate : true;

    return {
      archiveId: doc.id,
      code: doc.code,
      status: isIntact ? "INTACT" : "TAMPERED",
      storedChecksum: doc.checksumSha256,
      computedChecksum,
      byteLength: buffer.length,
      retentionExpiresAt: doc.expiryDate,
      withinMandatoryRetention,
      verifiedAt: now,
    };
  }

  /**
   * Lists archived fiscal exports with full traceability.
   */
  async listFiscalArchives(companyId: string) {
    return this.prisma.enterpriseDocument.findMany({
      where: {
        companyId,
        category: "FISCAL_ARCHIVE",
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Audits archive retention period.
   * Throws if an attempt is made to purge an archive that is still within legal retention.
   */
  async assertCanPurgeArchive(archiveId: string, asOfDate = new Date()): Promise<boolean> {
    const doc = await this.prisma.enterpriseDocument.findUnique({
      where: { id: archiveId },
    });
    if (!doc) throw new Error("fiscal_archive_not_found");

    if (doc.expiryDate && asOfDate < doc.expiryDate) {
      throw new Error(
        `fiscal_archive_retention_active: archive cannot be deleted before legal retention expiration date (${doc.expiryDate.toISOString()})`
      );
    }
    return true;
  }
}
