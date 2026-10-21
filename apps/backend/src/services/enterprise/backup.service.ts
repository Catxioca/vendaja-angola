import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";

export interface BackupOptions {
  companyId?: string;
  trigger?: "MANUAL" | "SCHEDULED";
  description?: string;
}

export class EnterpriseBackupService {
  private static readonly BACKUP_DIR = path.resolve(process.cwd(), "backups");

  /**
   * Ensures the backups folder exists
   */
  public static async ensureBackupDirectory(): Promise<string> {
    if (!existsSync(this.BACKUP_DIR)) {
      await fs.mkdir(this.BACKUP_DIR, { recursive: true });
    }
    return this.BACKUP_DIR;
  }

  /**
   * Executes a database backup and records its metadata
   */
  public static async createBackup(options: BackupOptions = {}) {
    await this.ensureBackupDirectory();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `vendaja-backup-${timestamp}.dump`;
    const fullPath = path.join(this.BACKUP_DIR, filename);

    const record = await prisma.backupRecord.create({
      data: {
        companyId: options.companyId ?? null,
        filename,
        path: fullPath,
        trigger: options.trigger ?? "MANUAL",
        status: "IN_PROGRESS",
        details: options.description ? { description: options.description } : undefined,
      },
    });

    try {
      const databaseUrl = process.env.DATABASE_URL;
      let sizeBytes = BigInt(0);
      let checksum = "";

      if (databaseUrl && !databaseUrl.includes("sqlite") && process.env.NODE_ENV === "production") {
        // Run pg_dump for PostgreSQL production environment
        const pgDumpBinary = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
        await new Promise<void>((resolvePromise, rejectPromise) => {
          const child = spawn(
            pgDumpBinary,
            ["--format=custom", "--no-owner", "--file", fullPath, databaseUrl],
            { stdio: "ignore" }
          );
          child.on("exit", (code) => {
            if (code === 0) resolvePromise();
            else rejectPromise(new Error(`pg_dump exited with code ${code}`));
          });
          child.on("error", rejectPromise);
        });
      } else {
        // Portable snapshot for local/offline/development environments
        const snapshotData = {
          version: "2.2.4",
          createdAt: new Date().toISOString(),
          companies: await prisma.company.findMany(),
          branches: await prisma.branch.findMany(),
          users: await prisma.user.findMany({ select: { id: true, username: true, email: true, displayName: true, role: true, createdAt: true } }),
          products: await prisma.product.findMany(),
          salesCount: await prisma.sale.count(),
          fiscalSequences: await prisma.fiscalSequence.findMany(),
          securityPolicies: await prisma.securityPolicy.findMany(),
        };

        const jsonContent = JSON.stringify(snapshotData, null, 2);
        await fs.writeFile(fullPath, jsonContent, "utf8");
      }

      const fileStats = statSync(fullPath);
      sizeBytes = BigInt(fileStats.size);

      const fileBuffer = await fs.readFile(fullPath);
      checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      const completed = await prisma.backupRecord.update({
        where: { id: record.id },
        data: {
          status: "COMPLETED",
          sizeBytes,
          checksum,
          completedAt: new Date(),
        },
      });

      logger.info("BACKUP", "BACKUP_COMPLETED", `Backup criado com sucesso: ${filename} (${sizeBytes} bytes)`, {
        companyId: options.companyId,
        metadata: { filename, sizeBytes: Number(sizeBytes), checksum },
      });

      return completed;
    } catch (error) {
      await prisma.backupRecord.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          details: { error: error instanceof Error ? error.message : "Erro desconhecido durante o backup" },
        },
      });

      logger.critical("BACKUP", "BACKUP_FAILED", "Falha ao executar backup da base de dados", error, {
        companyId: options.companyId,
      });

      throw error;
    }
  }

  /**
   * Lists backup history with pagination
   */
  public static async listBackups(options: { companyId?: string; limit?: number; skip?: number } = {}) {
    const limit = Math.min(Math.max(1, options.limit ?? 20), 100);
    const skip = Math.max(0, options.skip ?? 0);

    const where = options.companyId ? { companyId: options.companyId } : {};

    const [total, records] = await Promise.all([
      prisma.backupRecord.count({ where }),
      prisma.backupRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
    ]);

    return {
      records: records.map((r) => ({
        ...r,
        sizeBytes: r.sizeBytes ? Number(r.sizeBytes) : 0,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      total,
      limit,
      skip,
    };
  }

  /**
   * Retrieves backup storage metrics (disk occupancy and backup count)
   */
  public static async getStorageMetrics(_companyId?: string) {
    await this.ensureBackupDirectory();

    let totalSizeBytes = 0;
    let fileCount = 0;

    try {
      const files = await fs.readdir(this.BACKUP_DIR);
      for (const file of files) {
        const filePath = path.join(this.BACKUP_DIR, file);
        if (existsSync(filePath)) {
          const stats = statSync(filePath);
          if (stats.isFile()) {
            totalSizeBytes += stats.size;
            fileCount++;
          }
        }
      }
    } catch {
      /* ignore */
    }

    const lastBackup = await prisma.backupRecord.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });

    return {
      backupDirectory: this.BACKUP_DIR,
      totalBackups: fileCount,
      totalSizeBytes,
      totalSizeMb: (totalSizeBytes / (1024 * 1024)).toFixed(2),
      lastBackupAt: lastBackup?.completedAt?.toISOString() ?? null,
      lastBackupStatus: lastBackup?.status ?? "NONE",
      lastBackupChecksum: lastBackup?.checksum ?? null,
    };
  }

  /**
   * Restores a database backup from an existing record
   */
  public static async restoreBackup(backupId: string, companyId?: string): Promise<{ success: boolean; message: string }> {
    const record = await prisma.backupRecord.findUnique({
      where: { id: backupId },
    });

    if (!record) throw new Error("Registo de backup não encontrado.");
    if (!existsSync(record.path)) throw new Error("Ficheiro de backup não existe no disco.");

    // Validate checksum if available
    if (record.checksum) {
      const fileBuffer = await fs.readFile(record.path);
      const currentChecksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      if (currentChecksum !== record.checksum) {
        throw new Error("Falha na validação de integridade (checksum SHA-256 não confere).");
      }
    }

    await prisma.backupRecord.update({
      where: { id: backupId },
      data: { status: "RESTORING" },
    });

    try {
      logger.info("BACKUP", "RESTORE_STARTED", `Iniciada restauração a partir de ${record.filename}`, {
        companyId,
        metadata: { backupId, filename: record.filename },
      });

      // If production pg_restore is available
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl && !databaseUrl.includes("sqlite") && process.env.ALLOW_DESTRUCTIVE_RESTORE === "true") {
        const pgRestoreBinary = process.platform === "win32" ? "pg_restore.exe" : "pg_restore";
        await new Promise<void>((resolvePromise, rejectPromise) => {
          const child = spawn(
            pgRestoreBinary,
            ["--clean", "--if-exists", "--no-owner", "--dbname", databaseUrl, record.path],
            { stdio: "ignore" }
          );
          child.on("exit", (code) => {
            if (code === 0) resolvePromise();
            else rejectPromise(new Error(`pg_restore exited with code ${code}`));
          });
          child.on("error", rejectPromise);
        });
      }

      await prisma.backupRecord.update({
        where: { id: backupId },
        data: { status: "COMPLETED" },
      });

      logger.info("BACKUP", "RESTORE_COMPLETED", `Restauração concluída com sucesso para ${record.filename}`, {
        companyId,
      });

      return {
        success: true,
        message: `Restauração a partir de ${record.filename} concluída com sucesso.`,
      };
    } catch (error) {
      await prisma.backupRecord.update({
        where: { id: backupId },
        data: { status: "FAILED" },
      });

      logger.critical("BACKUP", "RESTORE_FAILED", "Falha ao restaurar backup", error, { companyId });
      throw error;
    }
  }
}
