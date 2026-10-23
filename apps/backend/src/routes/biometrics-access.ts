import { Router } from "express";
import {
  EnterpriseBiometricsAccessService,
  AccessVerificationRequest,
  AccessPersonDto,
  BiometricCredentialDto,
  AccessDeviceDto,
} from "../services/enterprise/biometrics-access.service.js";

export const biometricsAccessRouter = Router();

// 1. Process Access Event (Biometric & Access Engine)
biometricsAccessRouter.post("/verify", async (req, res) => {
  try {
    const { companyId, deviceId, authMethod, identifier, biometricProbe, snapshotPhoto, directionOverride } = req.body;
    if (!companyId || !deviceId || !authMethod) {
      return res.status(400).json({ error: "Parâmetros obrigatórios em falta (companyId, deviceId, authMethod)." });
    }

    const payload: AccessVerificationRequest = {
      companyId,
      deviceId,
      authMethod,
      identifier,
      biometricProbe,
      snapshotPhoto,
      directionOverride,
    };

    const result = await EnterpriseBiometricsAccessService.processAccessEvent(payload);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao processar validação de acesso." });
  }
});

// 2. Real-Time Dashboard Metrics
biometricsAccessRouter.get("/dashboard", (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "default-company";
    const metrics = EnterpriseBiometricsAccessService.getDashboardMetrics(companyId);
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao obter métricas de acessos." });
  }
});

// 3. Persons Management
biometricsAccessRouter.get("/persons", async (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "default-company";
    const category = req.query.category as any;
    const status = req.query.status as any;
    const search = req.query.search as string;

    const list = await EnterpriseBiometricsAccessService.listPersons({ companyId, category, status, search });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao listar pessoas." });
  }
});

biometricsAccessRouter.post("/persons", async (req, res) => {
  try {
    const dto: AccessPersonDto = req.body;
    if (!dto.companyId || !dto.internalCode || !dto.fullName || !dto.category) {
      return res.status(400).json({ error: "Campos obrigatórios: companyId, internalCode, fullName, category." });
    }
    const created = await EnterpriseBiometricsAccessService.registerPerson(dto);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao registar pessoa." });
  }
});

biometricsAccessRouter.get("/persons/:id", async (req, res) => {
  try {
    const person = await EnterpriseBiometricsAccessService.getPersonById(req.params.id);
    if (!person) return res.status(404).json({ error: "Pessoa não encontrada." });
    const credentials = await EnterpriseBiometricsAccessService.listCredentialsByPerson(person.id!);
    const subscription = EnterpriseBiometricsAccessService.getPersonSubscription(person.id!);
    res.json({ person, credentials, subscription });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao carregar detalhes da pessoa." });
  }
});

// 4. Biometric Credential Enrollment
biometricsAccessRouter.post("/credentials/enroll", async (req, res) => {
  try {
    const dto: BiometricCredentialDto = req.body;
    if (!dto.personId || !dto.type) {
      return res.status(400).json({ error: "Campos obrigatórios: personId, type." });
    }
    const enrolled = await EnterpriseBiometricsAccessService.enrollCredential(dto);
    res.status(201).json(enrolled);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao associar credencial biométrica." });
  }
});

// 5. Dynamic QR Code Generation and Validation
biometricsAccessRouter.post("/qr/generate", (req, res) => {
  try {
    const { personId, validitySeconds } = req.body;
    if (!personId) return res.status(400).json({ error: "personId é obrigatório." });
    const qr = EnterpriseBiometricsAccessService.generateDynamicQrCode(personId, validitySeconds ?? 60);
    res.json(qr);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao gerar QR Code dinâmico." });
  }
});

biometricsAccessRouter.post("/qr/validate", (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token é obrigatório." });
    const result = EnterpriseBiometricsAccessService.validateDynamicQrCode(token);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao validar QR Code." });
  }
});

// 6. Devices and Turnstiles
biometricsAccessRouter.get("/devices", (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || (req.headers["x-company-id"] as string) || "default-company";
    const devices = EnterpriseBiometricsAccessService.listDevices(companyId);
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao listar dispositivos." });
  }
});

biometricsAccessRouter.post("/devices", (req, res) => {
  try {
    const dto: AccessDeviceDto = req.body;
    if (!dto.companyId || !dto.name) {
      return res.status(400).json({ error: "companyId e name são obrigatórios." });
    }
    const created = EnterpriseBiometricsAccessService.registerDevice(dto);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao registar dispositivo." });
  }
});

biometricsAccessRouter.post("/devices/:id/command", (req, res) => {
  try {
    const { id } = req.params;
    const { command } = req.body; // "UNLOCK", "LOCK"
    const companyId = (req.body.companyId as string) || "default-company";
    const devices = EnterpriseBiometricsAccessService.listDevices(companyId);
    const device = devices.find((d) => d.id === id);

    if (!device) return res.status(404).json({ error: "Dispositivo não encontrado." });
    const triggered = EnterpriseBiometricsAccessService.triggerHardwareActuator(device);
    res.json({ success: triggered, deviceId: id, command: command ?? "UNLOCK" });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao enviar comando ao dispositivo." });
  }
});

// 7. Gym & Member Subscriptions
biometricsAccessRouter.post("/gym/subscriptions", (req, res) => {
  try {
    const { companyId, personId, planName, durationMonths, amountCents, isPaid, startDate } = req.body;
    if (!companyId || !personId || !planName || !durationMonths) {
      return res.status(400).json({ error: "Campos obrigatórios: companyId, personId, planName, durationMonths." });
    }
    const sub = EnterpriseBiometricsAccessService.createSubscription({
      companyId,
      personId,
      planName,
      durationMonths: Number(durationMonths),
      amountCents: Number(amountCents ?? 0),
      isPaid: isPaid ?? true,
      startDate,
    });
    res.status(201).json(sub);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao subscrever plano de ginásio." });
  }
});

// 8. Time & Attendance (RH)
biometricsAccessRouter.get("/attendance", (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || "default-company";
    const dateStr = req.query.date as string;
    const records = EnterpriseBiometricsAccessService.getAttendanceRecords(companyId, dateStr);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao carregar picagens de ponto." });
  }
});

// 9. Visitors (VMS)
biometricsAccessRouter.post("/visitors", (req, res) => {
  try {
    const { companyId, fullName, nif, phone, hostEmployeeName, hostDepartment, purpose, validHours, idDocNumber, photoUrl } = req.body;
    if (!companyId || !fullName || !hostEmployeeName || !purpose) {
      return res.status(400).json({ error: "Campos obrigatórios: companyId, fullName, hostEmployeeName, purpose." });
    }
    const pass = EnterpriseBiometricsAccessService.registerVisitor({
      companyId,
      fullName,
      nif,
      phone,
      hostEmployeeName,
      hostDepartment,
      purpose,
      validHours: validHours ? Number(validHours) : 8,
      idDocNumber,
      photoUrl,
    });
    res.status(201).json(pass);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao registar visitante." });
  }
});

// 10. Health Check Endpoints
biometricsAccessRouter.get("/health", (_req, res) => {
  const companyId = (_req.query.companyId as string) || "default-company";
  const devices = EnterpriseBiometricsAccessService.listDevices(companyId);
  res.json({
    status: "ok",
    service: "EnterpriseBiometricsAccessService",
    engine: "FaceID / RFID / Fingerprint Production Engine",
    turnstilesConfigured: devices.length,
    timestamp: new Date().toISOString(),
  });
});

biometricsAccessRouter.get("/health/cameras", (_req, res) => {
  res.json({
    status: "ok",
    supportedProtocols: ["WEBCAM_USB", "ONVIF_PROFILE_T", "RTSP_H264", "HIKVISION_ISAPI"],
    matchingThreshold: 0.85,
    livenessDetection: "ACTIVE",
    timestamp: new Date().toISOString(),
  });
});

biometricsAccessRouter.get("/health/rfid", (_req, res) => {
  res.json({
    status: "ok",
    supportedFrequencies: ["125KHZ_EM4100", "13.56MHZ_MIFARE"],
    readerProtocols: ["USB_HID_KEYBOARD_WEDGE", "WEBHID", "SERIAL_RS485", "WIEGAND_TCP"],
    timestamp: new Date().toISOString(),
  });
});

biometricsAccessRouter.get("/health/fingerprint", (_req, res) => {
  res.json({
    status: "ok",
    supportedVendors: ["ZKTECO", "DIGITAL_PERSONA", "SUPREMA", "NITGEN", "FUTRONIC"],
    supportedStandards: ["ISO_IEC_19794_2", "ANSI_378", "RAW_MINUTIAE"],
    matchingThreshold: 70,
    timestamp: new Date().toISOString(),
  });
});

biometricsAccessRouter.get("/health/access", (_req, res) => {
  res.json({
    status: "ok",
    decisionEngine: "REAL_TIME_RULES_EVALUATION",
    timestamp: new Date().toISOString(),
  });
});

biometricsAccessRouter.get("/health/devices", (_req, res) => {
  const companyId = (_req.query.companyId as string) || "default-company";
  const devices = EnterpriseBiometricsAccessService.listDevices(companyId);
  res.json({
    status: "ok",
    totalConfigured: devices.length,
    onlineCount: devices.filter((d) => d.status === "ONLINE").length,
    protocols: ["ZKTECO_TCP", "HIKVISION_ISAPI", "MQTT_IOT", "RELAY_HTTP", "USB_READER"],
    timestamp: new Date().toISOString(),
  });
});
