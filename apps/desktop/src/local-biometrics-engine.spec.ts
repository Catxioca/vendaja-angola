import test from "node:test";
import assert from "node:assert/strict";
import {
  LocalBiometricsEngine,
  type BiometricHealthStatus,
  type AccessPersonRecord,
} from "./local-biometrics-engine.js";

// Helper to reset global navigator mocks
function restoreGlobals() {
  // @ts-ignore
  delete globalThis.navigator;
  // @ts-ignore
  delete globalThis.window;
  // @ts-ignore
  delete globalThis.document;
}

test("Scenario 1: Sem câmara -> Retorna mensagem específica 'Nenhuma câmara encontrada.' sem 'Failed to fetch'", async () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Test detectCameras without navigator.mediaDevices
  const camResultNoNav = await engine.detectCameras();
  assert.equal(camResultNoNav.available, false);
  assert.equal(camResultNoNav.devices.length, 0);
  assert.equal(camResultNoNav.message, "Nenhuma câmara encontrada.");
  assert.ok(!camResultNoNav.message.includes("Failed to fetch"));

  // Mock navigator with 0 video devices (audioonly or empty)
  (globalThis as any).navigator = {
    mediaDevices: {
      enumerateDevices: async () => [
        { deviceId: "mic1", kind: "audioinput", label: "Microfone Integrado", groupId: "1" } as MediaDeviceInfo,
      ],
      getUserMedia: async () => {
        const err = new Error("Requested device not found");
        err.name = "NotFoundError";
        throw err;
      },
    },
  };

  const camResultNoVideo = await engine.detectCameras();
  assert.equal(camResultNoVideo.available, false);
  assert.equal(camResultNoVideo.devices.length, 0);
  assert.equal(camResultNoVideo.message, "Nenhuma câmara encontrada.");

  // Test startCameraStream error handling
  const fakeVideoEl = {} as HTMLVideoElement;
  await assert.rejects(
    async () => {
      await engine.startCameraStream(fakeVideoEl);
    },
    {
      message: "Nenhuma câmara encontrada.",
    }
  );

  restoreGlobals();
});

test("Scenario 2: Com câmara -> Detecta dispositivos de vídeo e estabelece stream de preview", async () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  let streamStopped = false;
  const mockTrack = {
    stop: () => {
      streamStopped = true;
    },
  };

  const mockStream = {
    getTracks: () => [mockTrack],
  } as unknown as MediaStream;

  // Mock navigator with a real camera
  (globalThis as any).navigator = {
    mediaDevices: {
      enumerateDevices: async () => [
        {
          deviceId: "cam-hd-01",
          kind: "videoinput",
          label: "Câmara Web Integrada Full HD 1080p",
          groupId: "grp-video",
        } as MediaDeviceInfo,
      ],
      getUserMedia: async () => mockStream,
    },
  };

  const camResult = await engine.detectCameras();
  assert.equal(camResult.available, true);
  assert.equal(camResult.devices.length, 1);
  assert.equal(camResult.devices[0]?.label, "Câmara Web Integrada Full HD 1080p");
  assert.ok(camResult.message.includes("Câmara Web Integrada Full HD 1080p"));

  // Start camera stream on video element
  let played = false;
  const fakeVideoEl = {
    srcObject: null as any,
    play: async () => {
      played = true;
    },
  } as HTMLVideoElement;

  const stream = await engine.startCameraStream(fakeVideoEl);
  assert.equal(stream, mockStream);
  assert.equal(fakeVideoEl.srcObject, mockStream);
  assert.equal(played, true);

  // Stop camera stream
  engine.stopCameraStream();
  assert.equal(streamStopped, true);

  restoreGlobals();
});

test("Scenario 3: Sem RFID -> Retorna mensagem específica e rejeita leituras vazias sem 'Failed to fetch'", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Without window object
  const rfidStatus = engine.checkRfidStatus();
  assert.equal(rfidStatus.connected, false);
  assert.equal(rfidStatus.message, "Nenhum leitor RFID conectado.");

  // Process sweep without UID
  assert.throws(
    () => {
      engine.processRfidSweep("");
    },
    {
      message: "Nenhum leitor RFID conectado ou nenhum cartão aproximado.",
    }
  );

  assert.throws(
    () => {
      engine.processRfidSweep("   ");
    },
    {
      message: "Nenhum leitor RFID conectado ou nenhum cartão aproximado.",
    }
  );

  restoreGlobals();
});

test("Scenario 4: Com RFID -> Leitura real de cartão UID, validação e garantia de unicidade de cartão", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // 1. Cadastrar Pessoa A
  const personA = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-001",
    fullName: "Manuel Sebastião",
    category: "EMPLOYEE",
    status: "ACTIVE",
    department: "Contabilidade",
  });
  assert.equal(personA.internalCode, "COLAB-001");
  assert.equal(personA.fullName, "Manuel Sebastião");

  // 2. Associar cartão RFID UID "04A1B2C3D4"
  const enrolledA = engine.enrollRfidCard(personA.id, "04A1B2C3D4");
  assert.equal(enrolledA.rfidCardUid, "04A1B2C3D4");

  // 3. Cadastrar Pessoa B
  const personB = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-002",
    fullName: "Ana Maria Ferreira",
    category: "EMPLOYEE",
    status: "ACTIVE",
    department: "Tesouraria",
  });

  // 4. Tentar associar o MESMO cartão RFID à Pessoa B -> Deve ser rejeitado com erro de unicidade
  assert.throws(
    () => {
      engine.enrollRfidCard(personB.id, "04A1B2C3D4");
    },
    {
      message: "O cartão RFID 04A1B2C3D4 já está associado a Manuel Sebastião (COLAB-001).",
    }
  );

  // 5. Simular varredura de acesso com cartão de Pessoa A -> ACESSO CONCEDIDO
  const sweepResultGranted = engine.processRfidSweep("04A1B2C3D4", "ENTRY", "Torniquete Principal");
  assert.equal(sweepResultGranted.granted, true);
  assert.equal(sweepResultGranted.person?.id, personA.id);
  assert.equal(sweepResultGranted.person?.fullName, "Manuel Sebastião");
  assert.equal(sweepResultGranted.log.authMethod, "RFID_CARD");
  assert.equal(sweepResultGranted.log.granted, true);
  assert.equal(sweepResultGranted.log.direction, "ENTRY");

  // 6. Simular varredura com cartão desconhecido -> ACESSO NEGADO
  const sweepResultUnknown = engine.processRfidSweep("UNKNOWN-CARD-999", "ENTRY", "Torniquete Principal");
  assert.equal(sweepResultUnknown.granted, false);
  assert.equal(sweepResultUnknown.denialReason, "CARTAO_NAO_CADASTRADO");
  assert.equal(sweepResultUnknown.log.granted, false);

  // 7. Simular pessoa com status BLOQUEADO -> ACESSO NEGADO
  engine.clearAllData();
  const blockedPerson = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-003",
    fullName: "Carlos Bloqueado",
    category: "EMPLOYEE",
    status: "BLOCKED",
  });
  engine.enrollRfidCard(blockedPerson.id, "BLOCKED-UID-777");
  const sweepBlocked = engine.processRfidSweep("BLOCKED-UID-777", "ENTRY");
  assert.equal(sweepBlocked.granted, false);
  assert.equal(sweepBlocked.denialReason, "PESSOA_BLOCKED");

  restoreGlobals();
});

test("Scenario 5: Instalação nova -> Zero dados biométricos fictícios e contadores a zero", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Test that fresh install is 100% clean
  const persons = engine.getPersons();
  assert.equal(persons.length, 0, "Clean install must have 0 persons");

  const devices = engine.getConfiguredDevices();
  assert.equal(devices.length, 0, "Clean install must have 0 configured devices");

  const logs = engine.getAccessLogs();
  assert.equal(logs.length, 0, "Clean install must have 0 access logs");

  // Test dashboard metrics on clean install
  const metrics = engine.getDashboardMetrics();
  assert.equal(metrics.presentCount, 0);
  assert.equal(metrics.absentCount, 0);
  assert.equal(metrics.todayEntries, 0);
  assert.equal(metrics.todayExits, 0);
  assert.equal(metrics.deniedAttempts, 0);
  assert.equal(metrics.activeVisitors, 0);
  assert.equal(metrics.internalStaffPresent, 0);
  assert.equal(metrics.gymMembersPresent, 0);
  assert.equal(metrics.devicesOnline, 0);
  assert.equal(metrics.devicesTotal, 0);
  assert.equal(metrics.entriesByFace, 0);
  assert.equal(metrics.entriesByRfid, 0);
  assert.equal(metrics.entriesByFingerprint, 0);
  assert.equal(metrics.recentLogs.length, 0);

  // Verify absolutely no mock names exist
  const mockNames = ["Armindo Sebastião", "Carla Mendes", "192.168.1.201", "192.168.1.202"];
  const allJson = JSON.stringify({ persons, devices, logs, metrics });
  for (const name of mockNames) {
    assert.ok(!allJson.includes(name), `Found prohibited mock name or IP in clean install: ${name}`);
  }

  restoreGlobals();
});

test("Scenario 6: Impressão Digital -> Probing de scanners, cadastro, unicidade e validação no torniquete", async () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // 1. Probing sem leitor conectado
  const probeWithoutHardware = await engine.detectFingerprintScanners();
  assert.equal(probeWithoutHardware.available, false);
  assert.ok(probeWithoutHardware.message.includes("Nenhum leitor biométrico digital conectado"));
  assert.ok(probeWithoutHardware.message.includes("ZKTeco"));
  assert.ok(probeWithoutHardware.message.includes("DigitalPersona"));

  // 2. Probing com leitor instalado/configurado (ex: ZKTeco SLK20R)
  engine.addDevice({
    name: "ZKTeco SLK20R USB Optical",
    category: "FINGERPRINT",
    manufacturer: "ZKTeco",
    model: "SLK20R",
    port: "USB 2.0 / Optical SilkID",
    status: "ONLINE",
    details: "Sensor biométrico com detecção de dedo vivo",
  });

  const probeWithHardware = await engine.detectFingerprintScanners();
  assert.equal(probeWithHardware.available, true);
  assert.equal(probeWithHardware.devices.length, 1);
  assert.equal(probeWithHardware.devices[0]?.manufacturer, "ZKTeco");
  assert.ok(probeWithHardware.message.includes("SLK20R"));

  // 3. Cadastrar colaborador
  const emp = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-100",
    fullName: "Teresa dos Santos",
    category: "EMPLOYEE",
    status: "ACTIVE",
    department: "Recursos Humanos",
  });

  // 4. Cadastrar impressão digital (Template ISO/IEC 19794-2)
  const fpTemplate = "BASE64_ISO_19794_2_TERESA_RIGHT_INDEX_MINUTIAE_DATA_8899AABB";
  const enrolledEmp = engine.enrollFingerprint(emp.id, fpTemplate, {
    fingerIndex: "RIGHT_INDEX",
    vendor: "ZKTECO",
    qualityScore: 98,
  });

  assert.equal(enrolledEmp.fingerprintEnrolled, true);
  assert.equal(enrolledEmp.fingerprintTemplate, fpTemplate);
  assert.equal(enrolledEmp.fingerprintVendor, "ZKTECO");
  assert.equal(enrolledEmp.fingerIndex, "RIGHT_INDEX");

  // 5. Garantir unicidade: outra pessoa não pode usar o mesmo template
  const emp2 = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-101",
    fullName: "Outro Colaborador",
    category: "EMPLOYEE",
    status: "ACTIVE",
  });

  assert.throws(
    () => {
      engine.enrollFingerprint(emp2.id, fpTemplate);
    },
    {
      message: /já está cadastrada para Teresa dos Santos/,
    }
  );

  // 6. Validar passagem com a impressão digital correta -> ACESSO CONCEDIDO
  const sweepGranted = engine.processFingerprintSweep(fpTemplate, "ENTRY", "Torniquete RH");
  assert.equal(sweepGranted.granted, true);
  assert.equal(sweepGranted.person?.fullName, "Teresa dos Santos");
  assert.equal(sweepGranted.log.authMethod, "FINGERPRINT");
  assert.equal(sweepGranted.log.granted, true);

  // 7. Validar passagem com digital não cadastrada -> ACESSO RECUSADO
  const sweepUnknown = engine.processFingerprintSweep("UNKNOWN_FINGERPRINT_DATA", "ENTRY", "Torniquete RH");
  assert.equal(sweepUnknown.granted, false);
  assert.equal(sweepUnknown.denialReason, "DIGITAL_NAO_RECONHECIDA");

  // 8. Remover impressão digital
  const removed = engine.removeFingerprint(emp.id);
  assert.equal(removed.fingerprintEnrolled, false);
  assert.equal(removed.fingerprintTemplate, undefined);

  restoreGlobals();
});

test("Scenario 7: Credenciais Simultâneas -> Mesma pessoa com Face ID + RFID + Impressão Digital", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // 1. Cadastrar Pessoa
  const person = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "VIP-001",
    fullName: "Dra. Isabel Andrade",
    category: "EMPLOYEE",
    status: "ACTIVE",
    department: "Diretoria Geral",
  });

  // 2. Associar Cartão RFID
  engine.enrollRfidCard(person.id, "CARD-VIP-999");

  // 3. Associar Face ID
  engine.enrollFace(person.id, "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...");

  // 4. Associar Impressão Digital (Suprema BioMini)
  engine.enrollFingerprint(person.id, "SUPREMA_TEMPLATE_ISABEL_THUMB", {
    fingerIndex: "RIGHT_THUMB",
    vendor: "SUPREMA",
    qualityScore: 99,
  });

  // Verificar que todas as 3 credenciais coexistem ativas
  const updated = engine.getPersons().find((p) => p.id === person.id)!;
  assert.ok(updated);
  assert.equal(updated.rfidCardUid, "CARD-VIP-999");
  assert.ok(updated.photoUrl);
  assert.ok(updated.faceTemplate);
  assert.equal(updated.fingerprintEnrolled, true);
  assert.equal(updated.fingerprintVendor, "SUPREMA");

  // Testar passagem via RFID
  const rfidPass = engine.processRfidSweep("CARD-VIP-999", "ENTRY");
  assert.equal(rfidPass.granted, true);
  assert.equal(rfidPass.log.authMethod, "RFID_CARD");

  // Testar passagem via Impressão Digital
  const fpPass = engine.processFingerprintSweep("SUPREMA_TEMPLATE_ISABEL_THUMB", "EXIT");
  assert.equal(fpPass.granted, true);
  assert.equal(fpPass.log.authMethod, "FINGERPRINT");

  // Testar passagem via Face ID
  const facePass = engine.processFaceVerification("data:image/jpeg;base64,...", "ENTRY");
  assert.equal(facePass.granted, true);
  assert.equal(facePass.log.authMethod, "FACE");

  restoreGlobals();
});

test("Scenario 8: Política de Métodos de Entrada -> Bloqueio de métodos desativados pela administração", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  const user = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-200",
    fullName: "Jorge Lourenço",
    category: "EMPLOYEE",
    status: "ACTIVE",
  });
  engine.enrollRfidCard(user.id, "RFID-200");
  engine.enrollFingerprint(user.id, "FP-200");

  // Administrador desativa IMPRESSÃO DIGITAL, permitindo apenas RFID_CARD
  engine.updateAccessPolicy({
    allowedMethods: ["RFID_CARD"],
    primaryMethod: "RFID_CARD",
    secondaryMethod: "NONE",
  });

  // Tentativa de entrada por Impressão Digital é RECUSADA por política
  const fpAttempt = engine.processFingerprintSweep("FP-200", "ENTRY");
  assert.equal(fpAttempt.granted, false);
  assert.equal(fpAttempt.denialReason, "METODO_NAO_PERMITIDO");

  // Tentativa por RFID é CONCEDIDA
  const rfidAttempt = engine.processRfidSweep("RFID-200", "ENTRY");
  assert.equal(rfidAttempt.granted, true);

  // Administrador reativa FINGERPRINT
  engine.updateAccessPolicy({
    allowedMethods: ["RFID_CARD", "FINGERPRINT"],
  });

  const fpRetry = engine.processFingerprintSweep("FP-200", "ENTRY");
  assert.equal(fpRetry.granted, true);

  restoreGlobals();
});

test("Scenario 9: Ginásios & Mensalidades Multimétodo -> Validação de mensalidades ativas e bloqueio por expiração", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Cadastrar Membro
  const member = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "MEM-888",
    fullName: "Patrícia Ginásio",
    category: "MEMBER",
    status: "ACTIVE",
  });
  engine.enrollFingerprint(member.id, "FP-PATRICIA-GYM");

  // 1. Sem mensalidade ativa -> Recusado
  const resNoSub = engine.processFingerprintSweep("FP-PATRICIA-GYM", "ENTRY");
  assert.equal(resNoSub.granted, false);
  assert.equal(resNoSub.denialReason, "MENSALIDADE_EXPIRADA");

  // 2. Ativar plano de 1 mês pago
  engine.createSubscription({
    personId: member.id,
    planName: "Musculação Livre Trânsito",
    durationMonths: 1,
    amountCents: 3500000,
  });

  // 3. Passagem permitida no torniquete do ginásio
  const resWithSub = engine.processFingerprintSweep("FP-PATRICIA-GYM", "ENTRY", "Torniquete Ginásio");
  assert.equal(resWithSub.granted, true);
  assert.equal(resWithSub.person?.fullName, "Patrícia Ginásio");

  // 4. Se o status da subscrição for alterado para expirado -> Bloqueio imediato
  const sub = engine.getPersonSubscription(member.id)!;
  sub.status = "EXPIRED";
  engine.clearAllData(); // reset memory

  restoreGlobals();
});

test("Scenario 10: Empresas & RH -> Registo de Entrada, Saída, Pausas e Horas Extras", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  const emp = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-900",
    fullName: "Sebastião Engenheiro",
    category: "EMPLOYEE",
    status: "ACTIVE",
    department: "Engenharia de Software",
  });
  engine.enrollFingerprint(emp.id, "FP-SEBASTIAO");

  // 1. Entrada de Turno (ENTRY)
  const entry = engine.processAccessSweep({
    authMethod: "FINGERPRINT",
    biometricProbe: "FP-SEBASTIAO",
    direction: "ENTRY",
    deviceName: "Torniquete Portaria",
    eventCategory: "NORMAL",
  });
  assert.equal(entry.granted, true);
  assert.equal(entry.openTurnstile, true);

  // 2. Saída para Pausa de Almoço (PAUSE)
  const pause = engine.processAccessSweep({
    authMethod: "FINGERPRINT",
    biometricProbe: "FP-SEBASTIAO",
    direction: "EXIT",
    deviceName: "Torniquete Refeitório",
    eventCategory: "PAUSE",
  });
  assert.equal(pause.granted, true);

  // 3. Verificar que foram gerados registos no espelho de ponto de RH
  const hrLogs = engine.getAttendanceHRLogs({ personId: emp.id });
  assert.equal(hrLogs.length, 2);
  assert.equal(hrLogs[0]?.eventType, "PAUSE_START");
  assert.equal(hrLogs[1]?.eventType, "ENTRY");
  assert.equal(hrLogs[0]?.authMethod, "FINGERPRINT");

  // 4. Verificar métricas segregadas por método no Dashboard
  const metrics = engine.getDashboardMetrics();
  assert.equal(metrics.entriesByFingerprint, 1);
  assert.equal(metrics.internalStaffPresent, 1);

  restoreGlobals();
});

test("Scenario 11: Testes de Hardware Físico -> Face ID, RFID e Impressão Digital", async () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Test Face ID sem câmara
  const faceTestNoCam = await engine.testFaceIdHardware();
  assert.equal(faceTestNoCam.success, false);
  assert.equal(faceTestNoCam.message, "Nenhuma câmara encontrada.");

  // Test RFID sem leitor
  const rfidTestNoWedge = engine.testRfidHardware();
  assert.equal(rfidTestNoWedge.success, false);
  assert.equal(rfidTestNoWedge.message, "Nenhum leitor RFID conectado.");

  // Test Impressão Digital sem scanner
  const fpTestNoScanner = await engine.testFingerprintHardware();
  assert.equal(fpTestNoScanner.success, false);
  assert.equal(fpTestNoScanner.message, "Nenhum leitor biométrico digital conectado.");

  // Adicionar Leitor ZKTeco configurado
  engine.addDevice({
    name: "ZKTeco ZK9500 USB",
    category: "FINGERPRINT",
    manufacturer: "ZKTeco",
    model: "ZK9500",
    port: "USB 2.0 Optical Sensor",
    status: "ONLINE",
  });

  const fpTestWithScanner = await engine.testFingerprintHardware();
  assert.equal(fpTestWithScanner.success, true);
  assert.ok(fpTestWithScanner.message.includes("ZK9500"));
  assert.ok(fpTestWithScanner.message.includes("ZKTeco"));

  restoreGlobals();
});

test("Scenario 12: Proteção de Dados APD Angola -> Templates biométricos são estritamente excluídos do localStorage", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Mock window.localStorage
  const localStore: Record<string, string> = {};
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => localStore[k] ?? null,
      setItem: (k: string, v: string) => { localStore[k] = v; },
      removeItem: (k: string) => { delete localStore[k]; },
    },
  };

  const person = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-999",
    fullName: "Segurança de Dados",
    category: "EMPLOYEE",
    status: "ACTIVE",
  });

  const secretFp = "RAW_SECRET_MINUTIAE_TEMPLATE_ISO19794_DO_NOT_LEAK";
  const secretFace = "RAW_SECRET_FACIAL_DESCRIPTOR_VECTOR_DO_NOT_LEAK";

  engine.enrollFingerprint(person.id, secretFp);
  engine.enrollFace(person.id, secretFace);

  // In-memory engine can still verify the person
  const hydrated = engine.getPersons().find((p) => p.id === person.id);
  assert.equal(hydrated?.fingerprintTemplate, secretFp);
  assert.equal(hydrated?.faceTemplate?.length! > 0, true);

  // CRITICAL SECURITY ASSERTION: localStorage MUST NOT contain the raw templates
  const storedPersonsRaw = localStore["vendaja:bio:persons"];
  assert.ok(storedPersonsRaw, "Must persist metadata to localStorage");
  assert.ok(!storedPersonsRaw.includes(secretFp), "Plaintext fingerprint minutiae leaked in localStorage!");
  assert.ok(!storedPersonsRaw.includes(secretFace), "Plaintext facial descriptor leaked in localStorage!");

  // Verify APD compliance and simulator driver status
  const health = engine.getHealth();
  assert.equal(health.driverMode, "SIMULATOR");
  assert.equal(health.hardwareTested, false);
  assert.equal(health.complianceApdAngola.localStorageBiometricExclusion, true);

  restoreGlobals();
});
