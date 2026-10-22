import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type BiometricCredentialType = "FACE" | "FINGERPRINT" | "RFID_CARD" | "QR_CODE" | "PIN";
export type PersonCategory = "EMPLOYEE" | "MEMBER" | "STUDENT" | "PATIENT" | "VISITOR" | "CONTRACTOR" | "RESIDENT" | "GUEST";
export type PersonStatus = "ACTIVE" | "BLOCKED" | "SUSPENDED" | "EXPIRED";
export type DeviceType = "TURNSTILE" | "DOOR" | "BARRIER" | "SPEED_GATE" | "ELEVATOR";
export type DeviceDirection = "ENTRY" | "EXIT" | "BIDIRECTIONAL";
export type DeviceProtocol = "ZKTECO_TCP" | "HIKVISION_ISAPI" | "MQTT_IOT" | "RELAY_HTTP" | "USB_READER" | "SIMULATOR";
export type DeviceStatus = "ONLINE" | "OFFLINE" | "FAULT" | "LOCKED_DOWN" | "FREE_PASS";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EARLY_LEAVE" | "HOLIDAY" | "JUSTIFIED";
export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";
export type VisitorStatus = "PENDING_APPROVAL" | "APPROVED" | "CHECKED_IN" | "CHECKED_OUT" | "EXPIRED" | "REJECTED";

export interface AccessPersonDto {
  id?: string;
  companyId: string;
  branchId?: string;
  internalCode: string;
  fullName: string;
  nif?: string;
  phone?: string;
  email?: string;
  photoUrl?: string;
  department?: string;
  category: PersonCategory;
  employeeId?: string;
  customerId?: string;
  status?: PersonStatus;
  notes?: string;
}

export interface BiometricCredentialDto {
  id?: string;
  personId: string;
  type: BiometricCredentialType;
  identifier?: string;
  biometricTemplate?: string; // JSON array of numbers for Face vector or Base64 ISO template for Fingerprint
  qualityScore?: number;
  hardwareVendor?: string;
  active?: boolean;
}

export interface AccessDeviceDto {
  id?: string;
  companyId: string;
  name: string;
  type?: DeviceType;
  direction?: DeviceDirection;
  locationZone?: string;
  ipAddress?: string;
  port?: number;
  protocol?: DeviceProtocol;
  mqttTopic?: string;
  relayPin?: number;
  relayPulseMs?: number;
  status?: DeviceStatus;
}

export interface AccessRuleDto {
  id?: string;
  companyId: string;
  name: string;
  category?: string;
  daysOfWeek?: string; // "MON,TUE,WED,THU,FRI" or "ALL"
  startTime?: string;  // "08:00"
  endTime?: string;    // "18:00"
  allowedZones?: string; // "RECEPTION,OFFICE,GYM" or "ALL"
  requireSubscriptionValid?: boolean;
  active?: boolean;
}

export interface AccessVerificationRequest {
  companyId: string;
  deviceId: string;
  authMethod: BiometricCredentialType | "MANUAL_OVERRIDE";
  identifier?: string;         // Card UID, QR token, or PIN
  biometricProbe?: number[] | string; // Face vector float array or Fingerprint template string
  snapshotPhoto?: string;      // Base64 captured by camera for audit
  directionOverride?: DeviceDirection;
}

export interface AccessDecisionResult {
  granted: boolean;
  decisionCode: "ACCESS_GRANTED" | "ACCESS_DENIED";
  denialReason?: string;
  person?: {
    id: string;
    internalCode: string;
    fullName: string;
    category: PersonCategory;
    department?: string;
    photoUrl?: string;
  };
  device: {
    id: string;
    name: string;
    locationZone: string;
    type: DeviceType;
    direction: DeviceDirection;
  };
  authMethod: string;
  similarityScore?: number;
  timestamp: string;
  actuation: {
    commandSent: "UNLOCK_PULSE" | "NONE" | "BUZZER_DENY";
    protocol: DeviceProtocol;
    pulseDurationMs: number;
    success: boolean;
  };
  membership?: {
    planName: string;
    validUntil: string;
    status: SubscriptionStatus;
  };
  attendance?: {
    punchType: "CHECK_IN" | "BREAK_OUT" | "BREAK_IN" | "CHECK_OUT";
    workedMinutesToday: number;
    delayMinutesToday: number;
  };
}

export interface AccessDashboardMetrics {
  companyId: string;
  timestamp: string;
  presentCount: number;
  absentCount: number;
  todayEntries: number;
  todayExits: number;
  deniedAttempts: number;
  activeVisitors: number;
  internalStaffPresent: number;
  gymMembersPresent: number;
  turnstileUtilizationRate: number;
  devicesOnline: number;
  devicesTotal: number;
  recentLogs: Array<{
    id: string;
    personName: string;
    personCategory?: string;
    deviceName: string;
    zone: string;
    direction: string;
    authMethod: string;
    granted: boolean;
    denialReason?: string;
    timestamp: string;
    snapshotUrl?: string;
  }>;
}

// ==========================================
// ENTERPRISE BIOMETRICS & ACCESS SERVICE
// ==========================================

export class EnterpriseBiometricsAccessService {
  private static readonly QR_SIGNING_SECRET = process.env.ACCESS_QR_SECRET ?? "vendaja-enterprise-biometrics-qr-secret-key-2026";
  private static readonly DEFAULT_FACE_SIMILARITY_THRESHOLD = 0.85; // Cosine similarity threshold (85%)
  private static readonly DEFAULT_FINGERPRINT_SCORE_THRESHOLD = 70; // 0-100 threshold

  // In-memory caches for ultra-fast matching and offline resilience
  private static inMemoryPersons: Map<string, AccessPersonDto> = new Map();
  private static inMemoryCredentials: Map<string, BiometricCredentialDto> = new Map();
  private static inMemoryDevices: Map<string, AccessDeviceDto> = new Map();
  private static inMemoryRules: Map<string, AccessRuleDto> = new Map();
  private static inMemoryLogs: Array<any> = [];
  private static inMemoryAttendance: Map<string, any> = new Map();
  private static inMemoryGymSubscriptions: Map<string, any> = new Map();
  private static inMemoryVisitorPasses: Map<string, any> = new Map();

  static {
    this.seedDefaultHardwareAndRules();
  }

  private static seedDefaultHardwareAndRules(): void {
    const defaultComp = "default-company";
    
    // Default turnstiles & access doors
    const d1: AccessDeviceDto = {
      id: "device-turnstile-main-in",
      companyId: defaultComp,
      name: "Torniquete Entrada Principal",
      type: "TURNSTILE",
      direction: "ENTRY",
      locationZone: "RECEPTION",
      ipAddress: "192.168.1.201",
      port: 4370,
      protocol: "ZKTECO_TCP",
      relayPulseMs: 3000,
      status: "ONLINE",
    };
    const d2: AccessDeviceDto = {
      id: "device-turnstile-main-out",
      companyId: defaultComp,
      name: "Torniquete Saída Principal",
      type: "TURNSTILE",
      direction: "EXIT",
      locationZone: "RECEPTION",
      ipAddress: "192.168.1.202",
      port: 4370,
      protocol: "ZKTECO_TCP",
      relayPulseMs: 3000,
      status: "ONLINE",
    };
    const d3: AccessDeviceDto = {
      id: "device-door-gym-in",
      companyId: defaultComp,
      name: "Torniquete Ginásio & Musculação",
      type: "SPEED_GATE",
      direction: "ENTRY",
      locationZone: "GYM",
      ipAddress: "192.168.1.205",
      port: 8000,
      protocol: "HIKVISION_ISAPI",
      relayPulseMs: 3000,
      status: "ONLINE",
    };
    const d4: AccessDeviceDto = {
      id: "device-door-server-room",
      companyId: defaultComp,
      name: "Porta Blindada Sala de Servidores",
      type: "DOOR",
      direction: "BIDIRECTIONAL",
      locationZone: "SERVER_ROOM",
      ipAddress: "192.168.1.210",
      port: 1883,
      protocol: "MQTT_IOT",
      mqttTopic: "vendaja/access/server-room",
      relayPulseMs: 5000,
      status: "ONLINE",
    };

    this.inMemoryDevices.set(d1.id!, d1);
    this.inMemoryDevices.set(d2.id!, d2);
    this.inMemoryDevices.set(d3.id!, d3);
    this.inMemoryDevices.set(d4.id!, d4);

    // Default Access Rules
    const r1: AccessRuleDto = {
      id: "rule-commercial-hours",
      companyId: defaultComp,
      name: "Horário Geral Comercial",
      category: "ALL",
      daysOfWeek: "MON,TUE,WED,THU,FRI",
      startTime: "07:30",
      endTime: "19:00",
      allowedZones: "RECEPTION,OFFICE,MEETING_ROOM",
      requireSubscriptionValid: false,
      active: true,
    };
    const r2: AccessRuleDto = {
      id: "rule-gym-members",
      companyId: defaultComp,
      name: "Acesso Membros Ginásio",
      category: "MEMBER",
      daysOfWeek: "ALL",
      startTime: "06:00",
      endTime: "22:00",
      allowedZones: "RECEPTION,GYM,LOCKER_ROOM",
      requireSubscriptionValid: true,
      active: true,
    };
    const r3: AccessRuleDto = {
      id: "rule-server-room-it",
      companyId: defaultComp,
      name: "Acesso Restrito Sala de Servidores (TI)",
      category: "EMPLOYEE",
      daysOfWeek: "ALL",
      startTime: "00:00",
      endTime: "23:59",
      allowedZones: "SERVER_ROOM",
      requireSubscriptionValid: false,
      active: true,
    };

    this.inMemoryRules.set(r1.id!, r1);
    this.inMemoryRules.set(r2.id!, r2);
    this.inMemoryRules.set(r3.id!, r3);
  }

  // ==========================================
  // 1. PESSOAS & CADASTRO BIOMÉTRICO
  // ==========================================

  public static async registerPerson(dto: AccessPersonDto): Promise<AccessPersonDto> {
    const id = dto.id ?? `person-${crypto.randomUUID()}`;
    const person: AccessPersonDto = {
      ...dto,
      id,
      status: dto.status ?? "ACTIVE",
    };

    this.inMemoryPersons.set(id, person);

    try {
      if (prisma?.accessPerson) {
        await prisma.accessPerson.upsert({
          where: {
            companyId_internalCode: {
              companyId: dto.companyId,
              internalCode: dto.internalCode,
            },
          },
          update: {
            fullName: dto.fullName,
            nif: dto.nif,
            phone: dto.phone,
            email: dto.email,
            photoUrl: dto.photoUrl,
            department: dto.department,
            category: dto.category,
            status: person.status,
            notes: dto.notes,
          },
          create: {
            id,
            companyId: dto.companyId,
            branchId: dto.branchId,
            internalCode: dto.internalCode,
            fullName: dto.fullName,
            nif: dto.nif,
            phone: dto.phone,
            email: dto.email,
            photoUrl: dto.photoUrl,
            department: dto.department,
            category: dto.category,
            employeeId: dto.employeeId,
            customerId: dto.customerId,
            status: person.status,
            notes: dto.notes,
          },
        });
      }
    } catch (err) {
      logger.warn("BIOMETRICS", "DB_FALLBACK", "AccessPerson DB sync skipped/fallback to memory", { metadata: { error: String(err) } });
    }

    return person;
  }

  public static async getPersonById(id: string): Promise<AccessPersonDto | null> {
    const mem = this.inMemoryPersons.get(id);
    if (mem) return mem;

    try {
      if (prisma?.accessPerson) {
        const db = await prisma.accessPerson.findUnique({ where: { id } });
        if (db) {
          const mapped: AccessPersonDto = {
            id: db.id,
            companyId: db.companyId,
            branchId: db.branchId ?? undefined,
            internalCode: db.internalCode,
            fullName: db.fullName,
            nif: db.nif ?? undefined,
            phone: db.phone ?? undefined,
            email: db.email ?? undefined,
            photoUrl: db.photoUrl ?? undefined,
            department: db.department ?? undefined,
            category: db.category as PersonCategory,
            employeeId: db.employeeId ?? undefined,
            customerId: db.customerId ?? undefined,
            status: db.status as PersonStatus,
            notes: db.notes ?? undefined,
          };
          this.inMemoryPersons.set(db.id, mapped);
          return mapped;
        }
      }
    } catch {
      // fallback
    }
    return null;
  }

  public static async listPersons(filter: {
    companyId: string;
    category?: PersonCategory;
    status?: PersonStatus;
    search?: string;
  }): Promise<AccessPersonDto[]> {
    let list = Array.from(this.inMemoryPersons.values()).filter((p) => p.companyId === filter.companyId);
    if (filter.category) list = list.filter((p) => p.category === filter.category);
    if (filter.status) list = list.filter((p) => p.status === filter.status);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.internalCode.toLowerCase().includes(q) ||
          (p.nif && p.nif.toLowerCase().includes(q)) ||
          (p.phone && p.phone.includes(q))
      );
    }
    return list;
  }

  // ==========================================
  // 2. BIOMETRIC CREDENTIAL ENROLLMENT
  // ==========================================

  public static async enrollCredential(dto: BiometricCredentialDto): Promise<BiometricCredentialDto> {
    const id = dto.id ?? `cred-${crypto.randomUUID()}`;
    const cred: BiometricCredentialDto = {
      ...dto,
      id,
      active: dto.active ?? true,
      qualityScore: dto.qualityScore ?? 100,
    };

    this.inMemoryCredentials.set(id, cred);

    try {
      if (prisma?.biometricCredential) {
        await prisma.biometricCredential.create({
          data: {
            id,
            personId: dto.personId,
            type: dto.type,
            identifier: dto.identifier,
            biometricTemplate: dto.biometricTemplate,
            qualityScore: cred.qualityScore,
            hardwareVendor: dto.hardwareVendor,
            active: cred.active,
          },
        });
      }
    } catch (err) {
      logger.warn("BIOMETRICS", "DB_FALLBACK", "BiometricCredential DB sync skipped/fallback to memory", { metadata: { error: String(err) } });
    }

    return cred;
  }

  public static async listCredentialsByPerson(personId: string): Promise<BiometricCredentialDto[]> {
    return Array.from(this.inMemoryCredentials.values()).filter((c) => c.personId === personId && c.active);
  }

  // ==========================================
  // 3. RECONHECIMENTO FACIAL (EMBEDDINGS & MATCHING)
  // ==========================================

  /**
   * Calculates cosine similarity between two normalized L2 vectors.
   * Returns a value between -1.0 and 1.0 (typically 0.0 to 1.0 for faces).
   */
  public static calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length || vectorA.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      const a = vectorA[i] ?? 0;
      const b = vectorB[i] ?? 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
  }

  /**
   * Compares 1:1 probe face embedding with enrolled template of a specific person
   */
  public static async verifyFace(personId: string, probeVector: number[]): Promise<{
    matched: boolean;
    similarity: number;
    threshold: number;
  }> {
    const creds = await this.listCredentialsByPerson(personId);
    const faceCred = creds.find((c) => c.type === "FACE" && c.biometricTemplate);

    if (!faceCred || !faceCred.biometricTemplate) {
      return { matched: false, similarity: 0, threshold: this.DEFAULT_FACE_SIMILARITY_THRESHOLD };
    }

    try {
      const enrolledVector: number[] = JSON.parse(faceCred.biometricTemplate);
      const similarity = this.calculateCosineSimilarity(probeVector, enrolledVector);
      return {
        matched: similarity >= this.DEFAULT_FACE_SIMILARITY_THRESHOLD,
        similarity: Number(similarity.toFixed(4)),
        threshold: this.DEFAULT_FACE_SIMILARITY_THRESHOLD,
      };
    } catch {
      return { matched: false, similarity: 0, threshold: this.DEFAULT_FACE_SIMILARITY_THRESHOLD };
    }
  }

  /**
   * Identifies 1:N probe face embedding against the gallery of all active persons in company
   */
  public static async identifyFace(companyId: string, probeVector: number[]): Promise<{
    identified: boolean;
    person?: AccessPersonDto;
    similarity: number;
    threshold: number;
  }> {
    let bestSimilarity = -1;
    let matchedPerson: AccessPersonDto | null = null;

    const allCreds = Array.from(this.inMemoryCredentials.values()).filter(
      (c) => c.type === "FACE" && c.active && c.biometricTemplate
    );

    for (const cred of allCreds) {
      const person = await this.getPersonById(cred.personId);
      if (!person || person.companyId !== companyId || person.status !== "ACTIVE") continue;

      try {
        const enrolledVector: number[] = JSON.parse(cred.biometricTemplate!);
        const sim = this.calculateCosineSimilarity(probeVector, enrolledVector);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          matchedPerson = person;
        }
      } catch {
        continue;
      }
    }

    const identified = bestSimilarity >= this.DEFAULT_FACE_SIMILARITY_THRESHOLD;
    return {
      identified,
      person: identified && matchedPerson ? matchedPerson : undefined,
      similarity: Number(Math.max(0, bestSimilarity).toFixed(4)),
      threshold: this.DEFAULT_FACE_SIMILARITY_THRESHOLD,
    };
  }

  // ==========================================
  // 4. IMPRESSÃO DIGITAL (MINUTIAE MATCHING)
  // ==========================================

  public static async identifyFingerprint(companyId: string, probeTemplateBase64: string): Promise<{
    identified: boolean;
    person?: AccessPersonDto;
    score: number;
  }> {
    // In biometric ISO standard, minutiae templates can be verified by score
    // We compute deterministic minutiae overlap score (mock engine for test/runtime)
    let bestScore = 0;
    let matchedPerson: AccessPersonDto | null = null;

    const allCreds = Array.from(this.inMemoryCredentials.values()).filter(
      (c) => c.type === "FINGERPRINT" && c.active && c.biometricTemplate
    );

    for (const cred of allCreds) {
      const person = await this.getPersonById(cred.personId);
      if (!person || person.companyId !== companyId || person.status !== "ACTIVE") continue;

      // Score matching based on template hash/string matching
      let score = 0;
      if (cred.biometricTemplate === probeTemplateBase64) {
        score = 99;
      } else {
        // Levenshtein/Hamming approximation for base64 template similarity
        const minLen = Math.min(cred.biometricTemplate!.length, probeTemplateBase64.length);
        let matchCount = 0;
        for (let i = 0; i < minLen; i++) {
          if (cred.biometricTemplate![i] === probeTemplateBase64[i]) matchCount++;
        }
        score = Math.round((matchCount / minLen) * 100);
      }

      if (score > bestScore) {
        bestScore = score;
        matchedPerson = person;
      }
    }

    const identified = bestScore >= this.DEFAULT_FINGERPRINT_SCORE_THRESHOLD;
    return {
      identified,
      person: identified && matchedPerson ? matchedPerson : undefined,
      score: bestScore,
    };
  }

  // ==========================================
  // 5. RFID / NFC & DYNAMIC QR CODE
  // ==========================================

  public static async identifyByRfid(companyId: string, cardUid: string): Promise<AccessPersonDto | null> {
    const normalizedUid = cardUid.trim().toUpperCase().replace(/[: -]/g, "");
    const cred = Array.from(this.inMemoryCredentials.values()).find(
      (c) => c.type === "RFID_CARD" && c.active && c.identifier?.toUpperCase().replace(/[: -]/g, "") === normalizedUid
    );

    if (!cred) return null;
    const person = await this.getPersonById(cred.personId);
    if (!person || person.companyId !== companyId) return null;
    return person;
  }

  public static generateDynamicQrCode(personId: string, validitySeconds = 60): {
    token: string;
    expiresAt: string;
    personId: string;
  } {
    const timestamp = Date.now();
    const expiresAtMs = timestamp + validitySeconds * 1000;
    const nonce = crypto.randomBytes(8).toString("hex");
    const payload = `${personId}:${expiresAtMs}:${nonce}`;
    const hmac = crypto.createHmac("sha256", this.QR_SIGNING_SECRET).update(payload).digest("hex");
    const token = Buffer.from(`${payload}:${hmac}`).toString("base64url");

    return {
      token,
      expiresAt: new Date(expiresAtMs).toISOString(),
      personId,
    };
  }

  public static validateDynamicQrCode(token: string): {
    valid: boolean;
    personId?: string;
    errorReason?: string;
  } {
    try {
      const decoded = Buffer.from(token, "base64url").toString("utf8");
      const parts = decoded.split(":");
      if (parts.length !== 4) return { valid: false, errorReason: "TOKEN_FORMAT_INVALID" };

      const [personId, expiresAtStr, nonce, receivedHmac] = parts;
      if (!personId || !expiresAtStr || !nonce || !receivedHmac) {
        return { valid: false, errorReason: "TOKEN_FORMAT_INVALID" };
      }
      const expiresAtMs = Number(expiresAtStr);

      if (Date.now() > expiresAtMs) {
        return { valid: false, errorReason: "QR_CODE_EXPIRED" };
      }

      const payload = `${personId}:${expiresAtMs}:${nonce}`;
      const expectedHmac = crypto.createHmac("sha256", this.QR_SIGNING_SECRET).update(payload).digest("hex");

      if (crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac))) {
        return { valid: true, personId };
      }
      return { valid: false, errorReason: "QR_SIGNATURE_INVALID" };
    } catch {
      return { valid: false, errorReason: "DECODE_ERROR" };
    }
  }

  // ==========================================
  // 6. INTELLIGENT ACCESS CONTROL DECISION ENGINE
  // ==========================================

  public static async processAccessEvent(req: AccessVerificationRequest): Promise<AccessDecisionResult> {
    const timestamp = new Date().toISOString();
    const device = this.inMemoryDevices.get(req.deviceId) ?? {
      id: req.deviceId,
      companyId: req.companyId,
      name: "Torniquete Automático",
      type: "TURNSTILE" as DeviceType,
      direction: req.directionOverride ?? ("ENTRY" as DeviceDirection),
      locationZone: "RECEPTION",
      protocol: "SIMULATOR" as DeviceProtocol,
      relayPulseMs: 3000,
      status: "ONLINE" as DeviceStatus,
    };

    let identifiedPerson: AccessPersonDto | null = null;
    let similarityScore: number | undefined = undefined;

    // 1. Identify Credential
    if (req.authMethod === "FACE" && Array.isArray(req.biometricProbe)) {
      const res = await this.identifyFace(req.companyId, req.biometricProbe);
      if (res.identified && res.person) {
        identifiedPerson = res.person;
        similarityScore = res.similarity;
      }
    } else if (req.authMethod === "FINGERPRINT" && typeof req.biometricProbe === "string") {
      const res = await this.identifyFingerprint(req.companyId, req.biometricProbe);
      if (res.identified && res.person) {
        identifiedPerson = res.person;
        similarityScore = res.score;
      }
    } else if (req.authMethod === "RFID_CARD" && req.identifier) {
      identifiedPerson = await this.identifyByRfid(req.companyId, req.identifier);
      similarityScore = 1.0;
    } else if (req.authMethod === "QR_CODE" && req.identifier) {
      const qrCheck = this.validateDynamicQrCode(req.identifier);
      if (qrCheck.valid && qrCheck.personId) {
        identifiedPerson = await this.getPersonById(qrCheck.personId);
        similarityScore = 1.0;
      }
    } else if (req.authMethod === "PIN" && req.identifier) {
      const cred = Array.from(this.inMemoryCredentials.values()).find(
        (c) => c.type === "PIN" && c.active && c.identifier === req.identifier
      );
      if (cred) {
        identifiedPerson = await this.getPersonById(cred.personId);
        similarityScore = 1.0;
      }
    } else if (req.authMethod === "MANUAL_OVERRIDE" && req.identifier) {
      identifiedPerson = await this.getPersonById(req.identifier);
      similarityScore = 1.0;
    }

    // Unidentified Person
    if (!identifiedPerson) {
      const denial: AccessDecisionResult = {
        granted: false,
        decisionCode: "ACCESS_DENIED",
        denialReason: "PESSOA_NAO_RECONHECIDA",
        device: {
          id: device.id!,
          name: device.name,
          locationZone: device.locationZone ?? "RECEPTION",
          type: device.type ?? "TURNSTILE",
          direction: device.direction ?? "ENTRY",
        },
        authMethod: req.authMethod,
        similarityScore,
        timestamp,
        actuation: {
          commandSent: "BUZZER_DENY",
          protocol: device.protocol ?? "SIMULATOR",
          pulseDurationMs: 0,
          success: true,
        },
      };
      this.recordAccessLog(denial, req.snapshotPhoto);
      return denial;
    }

    // 2. Validate Status
    if (identifiedPerson.status !== "ACTIVE") {
      const denial: AccessDecisionResult = {
        granted: false,
        decisionCode: "ACCESS_DENIED",
        denialReason: `CADASTRO_${identifiedPerson.status}`,
        person: {
          id: identifiedPerson.id!,
          internalCode: identifiedPerson.internalCode,
          fullName: identifiedPerson.fullName,
          category: identifiedPerson.category,
          department: identifiedPerson.department,
          photoUrl: identifiedPerson.photoUrl,
        },
        device: {
          id: device.id!,
          name: device.name,
          locationZone: device.locationZone ?? "RECEPTION",
          type: device.type ?? "TURNSTILE",
          direction: device.direction ?? "ENTRY",
        },
        authMethod: req.authMethod,
        similarityScore,
        timestamp,
        actuation: {
          commandSent: "BUZZER_DENY",
          protocol: device.protocol ?? "SIMULATOR",
          pulseDurationMs: 0,
          success: true,
        },
      };
      this.recordAccessLog(denial, req.snapshotPhoto);
      return denial;
    }

    // 3. Gym / Member Subscription Check
    let membershipInfo: any = undefined;
    if (identifiedPerson.category === "MEMBER" || identifiedPerson.category === "STUDENT") {
      const sub = this.getPersonSubscription(identifiedPerson.id!);
      if (!sub || sub.status !== "ACTIVE" || !sub.isPaid || new Date(sub.endDate) < new Date()) {
        const denial: AccessDecisionResult = {
          granted: false,
          decisionCode: "ACCESS_DENIED",
          denialReason: "MENSALIDADE_EXPIRADA",
          person: {
            id: identifiedPerson.id!,
            internalCode: identifiedPerson.internalCode,
            fullName: identifiedPerson.fullName,
            category: identifiedPerson.category,
            department: identifiedPerson.department,
            photoUrl: identifiedPerson.photoUrl,
          },
          device: {
            id: device.id!,
            name: device.name,
            locationZone: device.locationZone ?? "RECEPTION",
            type: device.type ?? "TURNSTILE",
            direction: device.direction ?? "ENTRY",
          },
          authMethod: req.authMethod,
          similarityScore,
          timestamp,
          actuation: {
            commandSent: "BUZZER_DENY",
            protocol: device.protocol ?? "SIMULATOR",
            pulseDurationMs: 0,
            success: true,
          },
          membership: sub
            ? {
                planName: sub.planName,
                validUntil: sub.endDate,
                status: "EXPIRED",
              }
            : undefined,
        };
        this.recordAccessLog(denial, req.snapshotPhoto);
        return denial;
      }
      membershipInfo = {
        planName: sub.planName,
        validUntil: sub.endDate,
        status: sub.status,
      };
    }

    // 4. Time Window and Zone Rules Check
    const ruleMatch = this.checkAccessRules(identifiedPerson, device.locationZone ?? "RECEPTION");
    if (!ruleMatch.allowed) {
      const denial: AccessDecisionResult = {
        granted: false,
        decisionCode: "ACCESS_DENIED",
        denialReason: ruleMatch.reason,
        person: {
          id: identifiedPerson.id!,
          internalCode: identifiedPerson.internalCode,
          fullName: identifiedPerson.fullName,
          category: identifiedPerson.category,
          department: identifiedPerson.department,
          photoUrl: identifiedPerson.photoUrl,
        },
        device: {
          id: device.id!,
          name: device.name,
          locationZone: device.locationZone ?? "RECEPTION",
          type: device.type ?? "TURNSTILE",
          direction: device.direction ?? "ENTRY",
        },
        authMethod: req.authMethod,
        similarityScore,
        timestamp,
        actuation: {
          commandSent: "BUZZER_DENY",
          protocol: device.protocol ?? "SIMULATOR",
          pulseDurationMs: 0,
          success: true,
        },
      };
      this.recordAccessLog(denial, req.snapshotPhoto);
      return denial;
    }

    // 5. Time & Attendance (RH) Logging
    let attendanceInfo: any = undefined;
    if (identifiedPerson.category === "EMPLOYEE") {
      attendanceInfo = this.recordAttendancePunch(identifiedPerson, device.direction ?? "ENTRY", timestamp);
    }

    // 6. Hardware Trigger (Unlock Actuation)
    const actuationResult = this.triggerHardwareActuator(device);

    const grantResult: AccessDecisionResult = {
      granted: true,
      decisionCode: "ACCESS_GRANTED",
      person: {
        id: identifiedPerson.id!,
        internalCode: identifiedPerson.internalCode,
        fullName: identifiedPerson.fullName,
        category: identifiedPerson.category,
        department: identifiedPerson.department,
        photoUrl: identifiedPerson.photoUrl,
      },
      device: {
        id: device.id!,
        name: device.name,
        locationZone: device.locationZone ?? "RECEPTION",
        type: device.type ?? "TURNSTILE",
        direction: device.direction ?? "ENTRY",
      },
      authMethod: req.authMethod,
      similarityScore,
      timestamp,
      actuation: {
        commandSent: "UNLOCK_PULSE",
        protocol: device.protocol ?? "SIMULATOR",
        pulseDurationMs: device.relayPulseMs ?? 3000,
        success: actuationResult,
      },
      membership: membershipInfo,
      attendance: attendanceInfo,
    };

    this.recordAccessLog(grantResult, req.snapshotPhoto);
    return grantResult;
  }

  // ==========================================
  // 7. GINÁSIOS & SUBSCRIPTIONS
  // ==========================================

  public static createSubscription(data: {
    companyId: string;
    personId: string;
    planName: string;
    durationMonths: number;
    amountCents: number;
    isPaid?: boolean;
    startDate?: string;
  }): any {
    const id = `sub-${crypto.randomUUID()}`;
    const start = data.startDate ? new Date(data.startDate) : new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + data.durationMonths);

    const sub = {
      id,
      companyId: data.companyId,
      personId: data.personId,
      planName: data.planName,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      status: "ACTIVE" as SubscriptionStatus,
      amountCents: data.amountCents,
      isPaid: data.isPaid ?? true,
      createdAt: new Date().toISOString(),
    };

    this.inMemoryGymSubscriptions.set(id, sub);
    return sub;
  }

  public static getPersonSubscription(personId: string): any | null {
    const list = Array.from(this.inMemoryGymSubscriptions.values()).filter((s) => s.personId === personId);
    if (!list.length) return null;
    list.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
    return list[0];
  }

  // ==========================================
  // 8. EMPRESAS E RECURSOS HUMANOS (TIME & ATTENDANCE)
  // ==========================================

  private static recordAttendancePunch(
    person: AccessPersonDto,
    direction: DeviceDirection,
    timestamp: string
  ): {
    punchType: "CHECK_IN" | "BREAK_OUT" | "BREAK_IN" | "CHECK_OUT";
    workedMinutesToday: number;
    delayMinutesToday: number;
  } {
    const dateStr = timestamp.slice(0, 10);
    const key = `${person.id!}:${dateStr}`;
    const punchDate = new Date(timestamp);
    let record = this.inMemoryAttendance.get(key);

    if (!record) {
      record = {
        id: `att-${crypto.randomUUID()}`,
        companyId: person.companyId,
        personId: person.id,
        employeeId: person.employeeId ?? person.id,
        date: dateStr,
        checkIn: null,
        breakOut: null,
        breakIn: null,
        checkOut: null,
        workedMinutes: 0,
        delayMinutes: 0,
        overtimeMinutes: 0,
        status: "PRESENT",
      };
      this.inMemoryAttendance.set(key, record);
    }

    let punchType: "CHECK_IN" | "BREAK_OUT" | "BREAK_IN" | "CHECK_OUT" = "CHECK_IN";

    if (direction === "ENTRY" || direction === "BIDIRECTIONAL") {
      if (!record.checkIn) {
        record.checkIn = timestamp;
        punchType = "CHECK_IN";

        // Calculate late arrival against 08:30 standard shift
        const scheduledStart = new Date(timestamp);
        scheduledStart.setHours(8, 30, 0, 0);
        if (punchDate.getTime() > scheduledStart.getTime()) {
          record.delayMinutes = Math.round((punchDate.getTime() - scheduledStart.getTime()) / 60000);
          record.status = "LATE";
        }
      } else if (record.breakOut && !record.breakIn) {
        record.breakIn = timestamp;
        punchType = "BREAK_IN";
      }
    } else {
      // EXIT
      if (!record.breakOut && !record.checkOut) {
        record.breakOut = timestamp;
        punchType = "BREAK_OUT";
      } else {
        record.checkOut = timestamp;
        punchType = "CHECK_OUT";

        if (record.checkIn) {
          const totalMs = punchDate.getTime() - new Date(record.checkIn).getTime();
          record.workedMinutes = Math.max(0, Math.round(totalMs / 60000) - 60); // 1h lunch deduction
          if (record.workedMinutes > 480) {
            record.overtimeMinutes = record.workedMinutes - 480;
          }
        }
      }
    }

    return {
      punchType,
      workedMinutesToday: record.workedMinutes,
      delayMinutesToday: record.delayMinutes,
    };
  }

  public static getAttendanceRecords(companyId: string, dateStr?: string): any[] {
    let list = Array.from(this.inMemoryAttendance.values()).filter((a) => a.companyId === companyId);
    if (dateStr) list = list.filter((a) => a.date === dateStr);
    return list;
  }

  // ==========================================
  // 9. GESTÃO DE VISITANTES (VMS)
  // ==========================================

  public static registerVisitor(data: {
    companyId: string;
    fullName: string;
    nif?: string;
    phone?: string;
    hostEmployeeName: string;
    hostDepartment?: string;
    purpose: string;
    validHours?: number;
    idDocNumber?: string;
    photoUrl?: string;
  }): any {
    const personId = `visitor-p-${crypto.randomUUID()}`;
    const person: AccessPersonDto = {
      id: personId,
      companyId: data.companyId,
      internalCode: `VIS-${Math.floor(1000 + Math.random() * 9000)}`,
      fullName: data.fullName,
      nif: data.nif,
      phone: data.phone,
      photoUrl: data.photoUrl,
      category: "VISITOR",
      department: data.hostDepartment ?? "Geral",
      status: "ACTIVE",
    };
    this.inMemoryPersons.set(personId, person);

    const validFrom = new Date();
    const validUntil = new Date(validFrom);
    validUntil.setHours(validUntil.getHours() + (data.validHours ?? 8));

    const passId = `vpass-${crypto.randomUUID()}`;
    const pass = {
      id: passId,
      companyId: data.companyId,
      personId,
      personName: data.fullName,
      hostEmployeeName: data.hostEmployeeName,
      hostDepartment: data.hostDepartment,
      purpose: data.purpose,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      status: "APPROVED" as VisitorStatus,
      idDocNumber: data.idDocNumber,
      badgeNumber: `CR-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
    };

    this.inMemoryVisitorPasses.set(passId, pass);
    return { person, pass };
  }

  // ==========================================
  // 10. REGRAS DE ACESSO & HORÁRIOS
  // ==========================================

  private static checkAccessRules(
    person: AccessPersonDto,
    zone: string
  ): { allowed: boolean; reason?: string } {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const currentTimeStr = `${hours}:${minutes}`;

    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const currentDay = days[now.getDay()] ?? "MON";

    const rules = Array.from(this.inMemoryRules.values()).filter(
      (r) => r.companyId === person.companyId && r.active
    );

    // Filter rules applicable to person's category or ALL
    const applicableRules = rules.filter(
      (r) => !r.category || r.category === "ALL" || r.category === person.category
    );

    if (!applicableRules.length) {
      // Default allow if no restrictive rules configured
      return { allowed: true };
    }

    let hasZoneMatch = false;
    for (const rule of applicableRules) {
      // Check zone
      const zones = (rule.allowedZones ?? "ALL").split(",").map((z) => z.trim().toUpperCase());
      const zoneAllowed = zones.includes("ALL") || zones.includes(zone.toUpperCase());

      if (!zoneAllowed) continue;
      hasZoneMatch = true;

      // Check day
      const ruleDays = (rule.daysOfWeek ?? "ALL").split(",").map((d) => d.trim().toUpperCase());
      const dayAllowed = ruleDays.includes("ALL") || ruleDays.includes(currentDay);
      if (!dayAllowed) continue;

      // Check time
      const start = rule.startTime ?? "00:00";
      const end = rule.endTime ?? "23:59";
      if (currentTimeStr >= start && currentTimeStr <= end) {
        return { allowed: true };
      }
    }

    if (!hasZoneMatch) {
      return { allowed: false, reason: "ZONA_NAO_AUTORIZADA" };
    }
    return { allowed: false, reason: "FORA_DE_HORARIO" };
  }

  // ==========================================
  // 11. HARDWARE DRIVERS & ACTUATION
  // ==========================================

  public static triggerHardwareActuator(device: AccessDeviceDto): boolean {
    const protocol = device.protocol ?? "SIMULATOR";

    switch (protocol) {
      case "ZKTECO_TCP":
        // Simulated ZKTeco standalone command CMD_AC_UNLOCK
        logger.info("BIOMETRICS", "ZKTECO_CMD", `Sent CMD_AC_UNLOCK to ${device.ipAddress}:${device.port ?? 4370}`);
        return true;

      case "HIKVISION_ISAPI":
        // Simulated Hikvision ISAPI PUT /ISAPI/AccessControl/RemoteControl/door/1?doorCmd=open
        logger.info("BIOMETRICS", "HIKVISION_CMD", `Triggered remote open door at ${device.ipAddress}:${device.port ?? 8000}`);
        return true;

      case "MQTT_IOT":
        // Simulated MQTT publish to topic
        logger.info("BIOMETRICS", "MQTT_PUB", `Published message UNLOCK to ${device.mqttTopic ?? "vendaja/access"}`);
        return true;

      case "RELAY_HTTP":
        // Simulated HTTP Webhook pulse
        logger.info("BIOMETRICS", "RELAY_PULSE", `Sent pulse webhook to ${device.ipAddress}`);
        return true;

      case "SIMULATOR":
      default:
        logger.info("BIOMETRICS", "SIMULATOR_ACTUATION", `Pulsed relay on device ${device.name} for ${device.relayPulseMs ?? 3000}ms`);
        return true;
    }
  }

  // ==========================================
  // 12. AUDITORIA & DASHBOARD EM TEMPO REAL
  // ==========================================

  private static recordAccessLog(result: AccessDecisionResult, snapshotUrl?: string): void {
    const logEntry = {
      id: `log-${crypto.randomUUID()}`,
      personId: result.person?.id,
      personName: result.person?.fullName ?? "Desconhecido",
      personCategory: result.person?.category,
      deviceId: result.device.id,
      deviceName: result.device.name,
      zone: result.device.locationZone,
      direction: result.device.direction,
      authMethod: result.authMethod,
      similarityScore: result.similarityScore,
      granted: result.granted,
      denialReason: result.denialReason,
      snapshotUrl: snapshotUrl ?? (result.person ? `https://ui-avatars.com/api/?name=${encodeURIComponent(result.person.fullName)}` : undefined),
      timestamp: result.timestamp,
    };

    this.inMemoryLogs.unshift(logEntry);
    if (this.inMemoryLogs.length > 500) this.inMemoryLogs.pop();
  }

  public static getDashboardMetrics(companyId: string): AccessDashboardMetrics {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const todayLogs = this.inMemoryLogs.filter((l) => l.timestamp.startsWith(todayStr));
    const todayEntries = todayLogs.filter((l) => l.granted && l.direction === "ENTRY").length;
    const todayExits = todayLogs.filter((l) => l.granted && l.direction === "EXIT").length;
    const deniedAttempts = todayLogs.filter((l) => !l.granted).length;

    // Approximate headcount inside
    const presentCount = Math.max(0, todayEntries - todayExits);

    const allPersons = Array.from(this.inMemoryPersons.values()).filter((p) => p.companyId === companyId);
    const absentCount = Math.max(0, allPersons.length - presentCount);

    const activeVisitors = this.inMemoryLogs.filter(
      (l) => l.granted && l.personCategory === "VISITOR" && l.direction === "ENTRY"
    ).length;

    const staffLogs = todayLogs.filter((l) => l.granted && l.personCategory === "EMPLOYEE");
    const internalStaffPresent = Math.max(0, staffLogs.filter((l) => l.direction === "ENTRY").length - staffLogs.filter((l) => l.direction === "EXIT").length);

    const gymLogs = todayLogs.filter((l) => l.granted && l.personCategory === "MEMBER");
    const gymMembersPresent = Math.max(0, gymLogs.filter((l) => l.direction === "ENTRY").length - gymLogs.filter((l) => l.direction === "EXIT").length);

    let devices = Array.from(this.inMemoryDevices.values()).filter((d) => d.companyId === companyId);
    if (!devices.length) {
      devices = Array.from(this.inMemoryDevices.values());
    }
    const devicesOnline = devices.filter((d) => d.status === "ONLINE").length;

    return {
      companyId,
      timestamp: now.toISOString(),
      presentCount,
      absentCount,
      todayEntries,
      todayExits,
      deniedAttempts,
      activeVisitors,
      internalStaffPresent,
      gymMembersPresent,
      turnstileUtilizationRate: devices.length ? Math.min(100, Math.round(((todayEntries + todayExits) / (devices.length * 50)) * 100)) : 0,
      devicesOnline,
      devicesTotal: devices.length,
      recentLogs: this.inMemoryLogs.slice(0, 25),
    };
  }

  public static listDevices(companyId: string): AccessDeviceDto[] {
    return Array.from(this.inMemoryDevices.values()).filter((d) => d.companyId === companyId);
  }

  public static registerDevice(dto: AccessDeviceDto): AccessDeviceDto {
    const id = dto.id ?? `dev-${crypto.randomUUID()}`;
    const dev = { ...dto, id, status: dto.status ?? "ONLINE" };
    this.inMemoryDevices.set(id, dev);
    return dev;
  }
}
