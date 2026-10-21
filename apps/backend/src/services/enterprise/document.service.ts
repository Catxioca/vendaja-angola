import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";

export type DocumentCategory =
  | "CONTRACT"
  | "LICENSE"
  | "INVOICE"
  | "RECEIPT"
  | "CUSTOMER_ATTACHMENT"
  | "SUPPLIER_ATTACHMENT"
  | "HR_DOCUMENT"
  | "LEGAL"
  | "OTHER";

export interface DocumentVersionData {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  checksumSha256: string;
  changeNotes?: string;
  uploadedById?: string;
  createdAt: string;
}

export interface EnterpriseDocumentData {
  id: string;
  companyId?: string;
  branchId?: string;
  code: string;
  title: string;
  description?: string;
  category: DocumentCategory;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number;
  storagePath: string;
  tags?: string[];
  currentVersion: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  status: "ACTIVE" | "ARCHIVED" | "EXPIRED";
  expiryDate?: string;
  checksumSha256: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  versions: DocumentVersionData[];
}

export class EnterpriseDocumentService {
  private static inMemoryDocs: Map<string, EnterpriseDocumentData> = new Map();

  static {
    this.seedDemoDocuments();
  }

  private static seedDemoDocuments(): void {
    const now = new Date().toISOString();
    const doc1: EnterpriseDocumentData = {
      id: "doc-contract-master-01",
      code: "DOC-CTR-2026-001",
      title: "Contrato de Fornecimento de Software & Suporte Nível SLA 1",
      description: "Contrato corporativo anual assinado com cliente chave em Luanda.",
      category: "CONTRACT",
      mimeType: "application/pdf",
      fileExtension: "pdf",
      sizeBytes: 1048576, // 1 MB
      storagePath: "storage/documents/2026/DOC-CTR-2026-001_v1.pdf",
      tags: ["Contrato", "SLA", "Jurídico"],
      currentVersion: 1,
      relatedEntityType: "Customer",
      relatedEntityId: "cust-hiper-sul",
      status: "ACTIVE",
      expiryDate: new Date(Date.now() + 365 * 86400000).toISOString(),
      checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      createdAt: now,
      updatedAt: now,
      versions: [
        {
          id: "ver-doc-1-v1",
          documentId: "doc-contract-master-01",
          versionNumber: 1,
          fileName: "Contrato_Fornecimento_2026.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1048576,
          storagePath: "storage/documents/2026/DOC-CTR-2026-001_v1.pdf",
          checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          changeNotes: "Versão inicial assinada digitalmente.",
          createdAt: now,
        },
      ],
    };

    const doc2: EnterpriseDocumentData = {
      id: "doc-nif-certidao",
      code: "DOC-LEG-2026-002",
      title: "Certidão de Regularidade Fiscal AGT",
      description: "Certidão de não devedor emitida pela Administração Geral Tributária de Angola.",
      category: "LEGAL",
      mimeType: "application/pdf",
      fileExtension: "pdf",
      sizeBytes: 524288,
      storagePath: "storage/documents/2026/DOC-LEG-2026-002_v1.pdf",
      tags: ["AGT", "Fiscal", "Certidão"],
      currentVersion: 1,
      relatedEntityType: "FiscalConfig",
      status: "ACTIVE",
      checksumSha256: "f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2",
      createdAt: now,
      updatedAt: now,
      versions: [],
    };

    this.inMemoryDocs.set(doc1.id, doc1);
    this.inMemoryDocs.set(doc2.id, doc2);
  }

  /**
   * Uploads and registers a new enterprise document
   */
  public static async uploadDocument(data: {
    title: string;
    description?: string;
    category?: DocumentCategory;
    fileName?: string;
    mimeType?: string;
    fileExtension?: string;
    sizeBytes?: number;
    rawContent?: string | Buffer;
    tags?: string[];
    relatedEntityType?: string;
    relatedEntityId?: string;
    expiryDate?: string;
    createdById?: string;
    companyId?: string;
    branchId?: string;
  }): Promise<EnterpriseDocumentData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const code = `DOC-${(data.category || "GEN").slice(0, 3)}-${new Date().getFullYear()}-${String(this.inMemoryDocs.size + 1).padStart(4, "0")}`;

    // Compute SHA-256 checksum
    const content = data.rawContent || `${data.title}-${Date.now()}`;
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    const ext = data.fileExtension || "pdf";
    const mime = data.mimeType || "application/pdf";
    const size = data.sizeBytes || 102400;
    const storagePath = `storage/documents/${new Date().getFullYear()}/${code}_v1.${ext}`;

    const version1: DocumentVersionData = {
      id: crypto.randomUUID(),
      documentId: id,
      versionNumber: 1,
      fileName: data.fileName || `${data.title}.${ext}`,
      mimeType: mime,
      sizeBytes: size,
      storagePath,
      checksumSha256: hash,
      changeNotes: "Carregamento inicial do documento",
      uploadedById: data.createdById,
      createdAt: now,
    };

    const doc: EnterpriseDocumentData = {
      id,
      companyId: data.companyId,
      branchId: data.branchId,
      code,
      title: data.title,
      description: data.description,
      category: data.category ?? "OTHER",
      mimeType: mime,
      fileExtension: ext,
      sizeBytes: size,
      storagePath,
      tags: data.tags,
      currentVersion: 1,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      status: "ACTIVE",
      expiryDate: data.expiryDate,
      checksumSha256: hash,
      createdById: data.createdById,
      createdAt: now,
      updatedAt: now,
      versions: [version1],
    };

    this.inMemoryDocs.set(id, doc);

    try {
      await prisma.enterpriseDocument.create({
        data: {
          id: doc.id,
          companyId: doc.companyId ?? null,
          branchId: doc.branchId ?? null,
          code: doc.code,
          title: doc.title,
          description: doc.description ?? null,
          category: doc.category,
          mimeType: doc.mimeType,
          fileExtension: doc.fileExtension,
          sizeBytes: doc.sizeBytes,
          storagePath: doc.storagePath,
          tags: doc.tags ? JSON.parse(JSON.stringify(doc.tags)) : undefined,
          currentVersion: 1,
          relatedEntityType: doc.relatedEntityType ?? null,
          relatedEntityId: doc.relatedEntityId ?? null,
          status: doc.status,
          expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : null,
          checksumSha256: doc.checksumSha256,
          createdById: doc.createdById ?? null,
        },
      });

      await prisma.documentVersion.create({
        data: {
          id: version1.id,
          documentId: doc.id,
          versionNumber: 1,
          fileName: version1.fileName,
          mimeType: version1.mimeType,
          sizeBytes: version1.sizeBytes,
          storagePath: version1.storagePath,
          checksumSha256: version1.checksumSha256,
          changeNotes: version1.changeNotes ?? null,
          uploadedById: version1.uploadedById ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    EnterpriseAuditService.record({
      action: "DOCUMENT_UPLOADED",
      module: "DOCUMENTS",
      entity: "EnterpriseDocument",
      entityId: id,
      userId: data.createdById,
      companyId: data.companyId,
      metadata: { code, category: doc.category, checksum: hash },
    }).catch(() => {});

    return doc;
  }

  /**
   * Uploads and links a new version of an existing document
   */
  public static async uploadNewVersion(
    documentId: string,
    data: {
      fileName: string;
      rawContent?: string | Buffer;
      sizeBytes?: number;
      mimeType?: string;
      changeNotes?: string;
      uploadedById?: string;
    }
  ): Promise<DocumentVersionData> {
    const doc = this.inMemoryDocs.get(documentId);
    if (!doc) throw new Error(`Documento não encontrado: ${documentId}`);

    const newVersionNumber = doc.currentVersion + 1;
    const now = new Date().toISOString();

    const content = data.rawContent || `${doc.title}-v${newVersionNumber}-${Date.now()}`;
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const storagePath = `storage/documents/${new Date().getFullYear()}/${doc.code}_v${newVersionNumber}.${doc.fileExtension}`;

    const version: DocumentVersionData = {
      id: crypto.randomUUID(),
      documentId,
      versionNumber: newVersionNumber,
      fileName: data.fileName,
      mimeType: data.mimeType || doc.mimeType,
      sizeBytes: data.sizeBytes || doc.sizeBytes,
      storagePath,
      checksumSha256: hash,
      changeNotes: data.changeNotes,
      uploadedById: data.uploadedById,
      createdAt: now,
    };

    doc.currentVersion = newVersionNumber;
    doc.checksumSha256 = hash;
    doc.sizeBytes = version.sizeBytes;
    doc.storagePath = storagePath;
    doc.updatedAt = now;
    doc.versions.unshift(version);

    try {
      await prisma.documentVersion.create({
        data: {
          id: version.id,
          documentId,
          versionNumber: newVersionNumber,
          fileName: version.fileName,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
          storagePath: version.storagePath,
          checksumSha256: version.checksumSha256,
          changeNotes: version.changeNotes ?? null,
          uploadedById: version.uploadedById ?? null,
        },
      });

      await prisma.enterpriseDocument.update({
        where: { id: documentId },
        data: {
          currentVersion: newVersionNumber,
          checksumSha256: hash,
          sizeBytes: version.sizeBytes,
          storagePath,
        },
      });
    } catch {
      // In-memory fallback
    }

    EnterpriseAuditService.record({
      action: "DOCUMENT_VERSION_ADDED",
      module: "DOCUMENTS",
      entity: "EnterpriseDocument",
      entityId: documentId,
      userId: data.uploadedById,
      newValue: { version: newVersionNumber, checksum: hash },
    }).catch(() => {});

    return version;
  }

  public static getDocument(id: string): EnterpriseDocumentData | undefined {
    return this.inMemoryDocs.get(id);
  }

  public static listDocuments(filters: {
    companyId?: string;
    category?: DocumentCategory;
    status?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  } = {}): EnterpriseDocumentData[] {
    let list = Array.from(this.inMemoryDocs.values());
    if (filters.companyId) list = list.filter((d) => !d.companyId || d.companyId === filters.companyId);
    if (filters.category) list = list.filter((d) => d.category === filters.category);
    if (filters.status) list = list.filter((d) => d.status === filters.status);
    if (filters.relatedEntityType) list = list.filter((d) => d.relatedEntityType === filters.relatedEntityType);
    if (filters.relatedEntityId) list = list.filter((d) => d.relatedEntityId === filters.relatedEntityId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static archiveDocument(id: string): EnterpriseDocumentData {
    const doc = this.inMemoryDocs.get(id);
    if (!doc) throw new Error(`Documento não encontrado: ${id}`);
    doc.status = "ARCHIVED";
    doc.updatedAt = new Date().toISOString();
    return doc;
  }
}
