import crypto from "node:crypto";
import fsSync from "node:fs";
import path from "node:path";

export type MigrationStatus = "PARTIAL" | "COMPLETED" | "FAILED";

export interface MigrationFailedItem {
  item: string;
  reason: string;
}

export interface MigrationMarker {
  version: 1;
  status: MigrationStatus;
  migratedAt: string;
  sourceDir: string;
  targetDir: string;
  migratedFiles: string[];
  skippedFiles: string[];
  failedFiles: MigrationFailedItem[];
}

export interface MigrationResult {
  migrated: boolean;
  legacyFound: boolean;
  status: MigrationStatus;
  sourceDir?: string;
  targetDir: string;
  migratedFiles: string[];
  skippedFiles: string[];
  failedFiles: MigrationFailedItem[];
  versionMarkerPath?: string;
  error?: string;
}

export interface MachineSeedResult {
  seed: string;
  source: "legacy-system" | "mutshima-system" | "legacy-userdata" | "mutshima-userdata" | "fresh-generated" | "default-fallback";
  pathUsed?: string;
}

export const LEGACY_DIR_NAMES = [
  "VendaJá Angola",
  "VendaJa Angola",
  "vendaja-angola",
  "vendaja",
  "ao.commerce.desktop",
] as const;

/**
 * Escopo estrito e controlado de itens operacionais cuja migração é explicitamente autorizada.
 * Ficheiros desconhecidos, logs, dumps, temporários ou artefactos arbitrários são estritamente ignorados.
 */
export const AUTHORIZED_MIGRATION_ENTRIES = [
  "server-config.json",
  "license-state.json",
  "machine-id",
  "outbox",
  "outbox.json",
  "cache",
  "IndexedDB",
  "Local Storage",
  "Session Storage",
  "print-dumps",
] as const;

// Alias de retrocompatibilidade
export const KNOWN_OPERATIONAL_FILES = AUTHORIZED_MIGRATION_ENTRIES;

/**
 * Calcula o tamanho e hash criptográfico SHA-256 de um ficheiro em disco.
 */
export function computeFileSha256(filePath: string): { sha256: string; size: number } {
  const content = fsSync.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return { sha256: hash, size: content.length };
}

/**
 * Remove com segurança diretórios ou ficheiros de staging temporários antigos abandonados.
 */
export function cleanLeftoverStaging(targetDir: string): void {
  try {
    if (!fsSync.existsSync(targetDir)) return;
    const items = fsSync.readdirSync(targetDir);
    for (const item of items) {
      if (item.startsWith(".tmp-staging-") || item.startsWith(".tmp-file-") || item.startsWith(".tmp-marker-")) {
        const fullPath = path.join(targetDir, item);
        try {
          fsSync.rmSync(fullPath, { recursive: true, force: true });
        } catch {
          // Ignora falhas pontuais de lock temporário
        }
      }
    }
  } catch {
    // Diretório pode ainda não ser legível
  }
}

/**
 * Migra transacionalmente um ficheiro individual com cópia temporária e validação estrita de integridade.
 */
export function transactionalMigrateFile(
  srcFile: string,
  dstFile: string,
  stagingParentDir: string
): { success: boolean; error?: string } {
  if (fsSync.existsSync(dstFile)) {
    return { success: false, error: "DESTINATION_ALREADY_EXISTS" };
  }

  const tmpDst = path.join(stagingParentDir, `.tmp-file-${path.basename(dstFile)}-${crypto.randomUUID()}`);

  try {
    const srcMeta = computeFileSha256(srcFile);
    fsSync.copyFileSync(srcFile, tmpDst, fsSync.constants.COPYFILE_EXCL);
    const tmpMeta = computeFileSha256(tmpDst);

    if (tmpMeta.size !== srcMeta.size || tmpMeta.sha256 !== srcMeta.sha256) {
      throw new Error(`Divergência de integridade SHA-256 no staging temporário de ${path.basename(srcFile)}`);
    }

    // Promoção atómica para o destino definitivo no mesmo volume
    fsSync.renameSync(tmpDst, dstFile);
    return { success: true };
  } catch (err) {
    try {
      if (fsSync.existsSync(tmpDst)) {
        fsSync.rmSync(tmpDst, { force: true });
      }
    } catch {
      // Ignora erro de limpeza
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Migra transacionalmente um diretório completo utilizando staging isolado e validação recursiva.
 * A árvore só é promovida para o destino final se 100% dos ficheiros forem validados com sucesso.
 */
export function transactionalMigrateDirectory(
  srcDir: string,
  dstDir: string,
  stagingParentDir: string
): { success: boolean; error?: string } {
  if (fsSync.existsSync(dstDir)) {
    return { success: false, error: "DESTINATION_ALREADY_EXISTS" };
  }

  const stagingDir = path.join(stagingParentDir, `.tmp-staging-${path.basename(dstDir)}-${crypto.randomUUID()}`);

  try {
    fsSync.mkdirSync(stagingDir, { recursive: true });

    const filePairs: Array<{ src: string; staged: string }> = [];

    function copyTreeRecursive(currentSrc: string, currentStaged: string) {
      const entries = fsSync.readdirSync(currentSrc, { withFileTypes: true });
      for (const entry of entries) {
        // Ignora ficheiros temporários ou artefactos no interior da árvore
        if (entry.name.startsWith(".tmp") || entry.name === ".rebranding-migration.json") continue;

        const subSrc = path.join(currentSrc, entry.name);
        const subStaged = path.join(currentStaged, entry.name);

        if (entry.isDirectory()) {
          fsSync.mkdirSync(subStaged, { recursive: true });
          copyTreeRecursive(subSrc, subStaged);
        } else if (entry.isFile()) {
          fsSync.copyFileSync(subSrc, subStaged, fsSync.constants.COPYFILE_EXCL);
          filePairs.push({ src: subSrc, staged: subStaged });
        }
      }
    }

    copyTreeRecursive(srcDir, stagingDir);

    // Validação estrita de cada ficheiro da árvore encenada contra a origem
    for (const pair of filePairs) {
      const srcMeta = computeFileSha256(pair.src);
      const stagedMeta = computeFileSha256(pair.staged);
      if (srcMeta.size !== stagedMeta.size || srcMeta.sha256 !== stagedMeta.sha256) {
        throw new Error(`Divergência de integridade SHA-256 no ficheiro ${path.basename(pair.src)} da pasta ${path.basename(srcDir)}`);
      }
    }

    // Promoção atómica do diretório completo validado para o destino definitivo
    fsSync.renameSync(stagingDir, dstDir);
    return { success: true };
  } catch (err) {
    try {
      if (fsSync.existsSync(stagingDir)) {
        fsSync.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch {
      // Ignora erro de limpeza
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Migra dados locais legados do VendaJá para o diretório de dados do Mutshima.
 * Executada antes de qualquer leitura ou escrita crítica de configuração/licença.
 *
 * Propriedades essenciais:
 * 1. Idempotente e Retomável: execuções parciais anteriores são retomadas completando apenas itens em falta.
 * 2. Transacional e Atómica: cada item é preparado e validado em staging temporário antes da promoção definitiva.
 * 3. Preservação estrita: os ficheiros de origem legados NUNCA são eliminados nem alterados.
 * 4. Não sobrescrita: dados Mutshima já existentes no destino nunca são sobrescritos por dados legados.
 * 5. Escopo controlado: apenas itens estritamente autorizados em AUTHORIZED_MIGRATION_ENTRIES são processados.
 * 6. Marcador explícito: regista o estado auditável (PARTIAL, COMPLETED, FAILED) sem expor segredos.
 */
export function ensureDesktopDataMigration(options?: {
  appDataDir?: string;
  targetUserDataDir?: string;
  targetDirName?: string;
  legacyDirNames?: readonly string[];
  authorizedEntries?: readonly string[];
  _simulateFailureOnItem?: string;
}): MigrationResult {
  let appDataDir = options?.appDataDir;
  let targetDir = options?.targetUserDataDir;

  // Em runtime Electron, deteta dinamicamente appData se não fornecido
  if (!appDataDir || !targetDir) {
    try {
      const { app } = require("electron");
      if (app && typeof app.getPath === "function") {
        if (!appDataDir) appDataDir = app.getPath("appData");
        if (!targetDir) targetDir = app.getPath("userData");
      }
    } catch {
      // Ambiente Node.js de teste isolado
    }
  }

  // Fallback padrão se Electron não estiver disponível e opções não foram passadas
  if (!appDataDir) {
    appDataDir = process.env.APPDATA || (process.platform === "darwin"
      ? path.join(process.env.HOME || "", "Library", "Application Support")
      : path.join(process.env.HOME || "", ".config"));
  }

  const targetDirName = options?.targetDirName || "Mutshima";
  if (!targetDir) {
    targetDir = path.join(appDataDir, targetDirName);
  }

  const legacyNames = options?.legacyDirNames || LEGACY_DIR_NAMES;
  const authorized = options?.authorizedEntries || AUTHORIZED_MIGRATION_ENTRIES;

  const migratedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const failedFiles: MigrationFailedItem[] = [];

  // Localiza o primeiro diretório legado existente
  let sourceDir: string | undefined;
  for (const name of legacyNames) {
    const candidate = path.join(appDataDir, name);
    if (candidate !== targetDir && fsSync.existsSync(candidate)) {
      sourceDir = candidate;
      break;
    }
  }

  if (!sourceDir) {
    return {
      migrated: false,
      legacyFound: false,
      status: "COMPLETED",
      targetDir,
      migratedFiles,
      skippedFiles,
      failedFiles,
    };
  }

  const markerPath = path.join(targetDir, ".rebranding-migration.json");

  try {
    fsSync.mkdirSync(targetDir, { recursive: true });
    cleanLeftoverStaging(targetDir);

    // Verifica se todos os itens autorizados que existem na origem já existem no destino
    let allAuthorizedExistInTarget = true;
    for (const item of authorized) {
      const srcPath = path.join(sourceDir, item);
      const dstPath = path.join(targetDir, item);
      if (fsSync.existsSync(srcPath) && !fsSync.existsSync(dstPath)) {
        allAuthorizedExistInTarget = false;
        break;
      }
    }

    // Se houver marcador COMPLETED existente e todos os itens autorizados da origem estiverem no destino, não migra novamente
    if (fsSync.existsSync(markerPath)) {
      try {
        const existingMarker = JSON.parse(fsSync.readFileSync(markerPath, "utf8")) as MigrationMarker;
        if (existingMarker.status === "COMPLETED" && allAuthorizedExistInTarget) {
          // Coleta os itens já presentes como skippedFiles
          for (const item of authorized) {
            const dstPath = path.join(targetDir, item);
            if (fsSync.existsSync(dstPath)) {
              const isDir = fsSync.statSync(dstPath).isDirectory();
              skippedFiles.push(isDir ? `${item}/` : item);
            }
          }
          return {
            migrated: false,
            legacyFound: true,
            status: "COMPLETED",
            sourceDir,
            targetDir,
            migratedFiles,
            skippedFiles,
            failedFiles,
            versionMarkerPath: markerPath,
          };
        }
      } catch {
        // Marcador inválido ou corrompido; prossegue para revalidação/migração
      }
    }

    // Itera estritamente sobre os itens autorizados (escopo controlado)
    for (const item of authorized) {
      const srcPath = path.join(sourceDir, item);
      const dstPath = path.join(targetDir, item);

      // Item não existe na origem legada: ignora
      if (!fsSync.existsSync(srcPath)) continue;

      let srcStat: fsSync.Stats;
      try {
        srcStat = fsSync.statSync(srcPath);
      } catch (err) {
        failedFiles.push({ item, reason: `Não foi possível aceder ao item legado: ${String(err)}` });
        continue;
      }

      const isDir = srcStat.isDirectory();
      const displayName = isDir ? `${item}/` : item;

      // REGRA DE OURO: Nunca sobrescrever ficheiros ou pastas Mutshima existentes
      if (fsSync.existsSync(dstPath)) {
        skippedFiles.push(displayName);
        continue;
      }

      // Gancho de teste: simulação de falha controlada para validação atómica e não-corrupção
      if (options?._simulateFailureOnItem && (options._simulateFailureOnItem === item || options._simulateFailureOnItem === displayName)) {
        failedFiles.push({ item: displayName, reason: "Simulação controlada de falha de I/O em staging" });
        continue;
      }

      if (isDir) {
        const op = transactionalMigrateDirectory(srcPath, dstPath, targetDir);
        if (op.success) {
          migratedFiles.push(displayName);
        } else {
          failedFiles.push({ item: displayName, reason: op.error || "Falha na cópia atómica do diretório" });
        }
      } else if (srcStat.isFile()) {
        const op = transactionalMigrateFile(srcPath, dstPath, targetDir);
        if (op.success) {
          migratedFiles.push(displayName);
        } else {
          failedFiles.push({ item: displayName, reason: op.error || "Falha na cópia atómica do ficheiro" });
        }
      }
    }

    // Determina o estado rigoroso da migração
    let status: MigrationStatus = "COMPLETED";
    if (failedFiles.length > 0) {
      status = (migratedFiles.length > 0 || skippedFiles.length > 0) ? "PARTIAL" : "FAILED";
    }

    // Registo auditável do marcador atómico sem dados sensíveis
    const markerData: MigrationMarker = {
      version: 1,
      status,
      migratedAt: new Date().toISOString(),
      sourceDir,
      targetDir,
      migratedFiles,
      skippedFiles,
      failedFiles,
    };

    const tmpMarkerPath = path.join(targetDir, `.tmp-marker-${crypto.randomUUID()}`);
    try {
      fsSync.writeFileSync(tmpMarkerPath, JSON.stringify(markerData, null, 2), "utf8");
      fsSync.renameSync(tmpMarkerPath, markerPath);
    } catch {
      try {
        fsSync.writeFileSync(markerPath, JSON.stringify(markerData, null, 2), "utf8");
      } catch {
        // Falha não crítica de escrita do marcador
      }
    }

    cleanLeftoverStaging(targetDir);

    return {
      migrated: migratedFiles.length > 0,
      legacyFound: true,
      status,
      sourceDir,
      targetDir,
      migratedFiles,
      skippedFiles,
      failedFiles,
      versionMarkerPath: markerPath,
      error: failedFiles.length > 0 ? `Migração incompleta: ${failedFiles.length} item(ns) falharam.` : undefined,
    };
  } catch (err) {
    cleanLeftoverStaging(targetDir);
    const fatalError = err instanceof Error ? err.message : String(err);
    return {
      migrated: migratedFiles.length > 0,
      legacyFound: true,
      status: "FAILED",
      sourceDir,
      targetDir,
      migratedFiles,
      skippedFiles,
      failedFiles: [{ item: "migration-process", reason: fatalError }],
      error: fatalError,
    };
  }
}

/**
 * Obtém a seed persistente do Hardware ID com prioridade estrita aos identificadores legados.
 *
 * Ordem estrita de resolução:
 * 1. %ProgramData%/VendaJa/machine-id (ou /var/lib/vendaja/machine-id no Linux) -> PRESERVA SE EXISTIR
 * 2. %ProgramData%/Mutshima/machine-id (ou /var/lib/mutshima/machine-id no Linux)
 * 3. <legacyUserData>/machine-id
 * 4. <targetUserData>/machine-id
 * 5. Geração limpa e persistência no caminho Mutshima
 */
export function resolveMachineSeed(options?: {
  programDataDir?: string;
  targetUserDataDir?: string;
  legacyUserDataDirs?: readonly string[];
  linuxVarDir?: string;
}): MachineSeedResult {
  const isWin = process.platform === "win32";
  const useProgramData = options?.programDataDir ? true : (options?.linuxVarDir ? false : isWin);

  // 1. Prioridade absoluta: identificador legado de sistema
  const legacySystemPath = useProgramData
    ? path.join(options?.programDataDir || process.env.ProgramData || "C:\\ProgramData", "VendaJa", "machine-id")
    : path.join(options?.linuxVarDir || "/var/lib", "vendaja", "machine-id");

  const mutshimaSystemPath = useProgramData
    ? path.join(options?.programDataDir || process.env.ProgramData || "C:\\ProgramData", "Mutshima", "machine-id")
    : path.join(options?.linuxVarDir || "/var/lib", "mutshima", "machine-id");

  try {
    if (fsSync.existsSync(legacySystemPath)) {
      const val = fsSync.readFileSync(legacySystemPath, "utf8").trim();
      if (val.length >= 16) {
        // Assegura caminho Mutshima para sincronismo futuro sem apagar legado
        try {
          if (!fsSync.existsSync(mutshimaSystemPath)) {
            fsSync.mkdirSync(path.dirname(mutshimaSystemPath), { recursive: true });
            fsSync.writeFileSync(mutshimaSystemPath, val, "utf8");
          }
        } catch {
          // Permissão restrita; não impede uso do valor lido
        }
        return { seed: val, source: "legacy-system", pathUsed: legacySystemPath };
      }
    }
  } catch {
    // Continua para o próximo nível
  }

  // 2. Identificador de sistema Mutshima existente
  try {
    if (fsSync.existsSync(mutshimaSystemPath)) {
      const val = fsSync.readFileSync(mutshimaSystemPath, "utf8").trim();
      if (val.length >= 16) {
        return { seed: val, source: "mutshima-system", pathUsed: mutshimaSystemPath };
      }
    }
  } catch {
    // Continua
  }

  // 3. Identificador legado em diretórios userData anteriores
  const legacyUserDirs = options?.legacyUserDataDirs || [];
  for (const dir of legacyUserDirs) {
    const candidate = path.join(dir, "machine-id");
    try {
      if (fsSync.existsSync(candidate)) {
        const val = fsSync.readFileSync(candidate, "utf8").trim();
        if (val.length >= 16) {
          return { seed: val, source: "legacy-userdata", pathUsed: candidate };
        }
      }
    } catch {
      // Ignora e continua
    }
  }

  // 4. Identificador em targetUserData
  if (options?.targetUserDataDir) {
    const candidate = path.join(options.targetUserDataDir, "machine-id");
    try {
      if (fsSync.existsSync(candidate)) {
        const val = fsSync.readFileSync(candidate, "utf8").trim();
        if (val.length >= 16) {
          return { seed: val, source: "mutshima-userdata", pathUsed: candidate };
        }
      }
    } catch {
      // Continua
    }
  }

  // 5. Instalação limpa: gera novo UUID persistente no caminho Mutshima
  const freshId = crypto.randomUUID();

  // Tenta persistir no nível de sistema Mutshima
  try {
    fsSync.mkdirSync(path.dirname(mutshimaSystemPath), { recursive: true });
    fsSync.writeFileSync(mutshimaSystemPath, freshId, "utf8");
    return { seed: freshId, source: "fresh-generated", pathUsed: mutshimaSystemPath };
  } catch {
    // Fallback no userData Mutshima
  }

  if (options?.targetUserDataDir) {
    try {
      const fallback = path.join(options.targetUserDataDir, "machine-id");
      fsSync.mkdirSync(path.dirname(fallback), { recursive: true });
      fsSync.writeFileSync(fallback, freshId, "utf8");
      return { seed: freshId, source: "fresh-generated", pathUsed: fallback };
    } catch {
      // Continua
    }
  }

  return { seed: freshId, source: "fresh-generated" };
}

/**
 * Sanitiza mensagens de erro de rede para nunca expor erros técnicos
 * (como "Failed to fetch", ECONNREFUSED, ENOTFOUND, stack traces ou URLs internas).
 */
export function sanitizeNetworkError(error: unknown, fallbackMessage = "Serviço central indisponível ou inacessível."): string {
  if (!error) return fallbackMessage;

  const raw = error instanceof Error ? error.message : String(error);

  if (/abort|timeout/i.test(raw)) {
    return "Tempo limite de resposta do servidor central excedido.";
  }
  if (/econnrefused|failed to fetch|enotfound|ehostunreach|econnreset|networkerror|load failed/i.test(raw)) {
    return "Não foi possível estabelecer ligação ao servidor central configurado.";
  }
  if (/url.*inválida|invalid url/i.test(raw)) {
    return "O endereço do servidor configurado é inválido.";
  }
  if (/não configurado|unconfigured/i.test(raw)) {
    return "Servidor central não configurado.";
  }

  return fallbackMessage;
}
