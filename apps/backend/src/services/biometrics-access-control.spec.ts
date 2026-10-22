import test from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseBiometricsAccessService,
  AccessPersonDto,
  BiometricCredentialDto,
  AccessDeviceDto,
  EnterpriseAiCopilotService,
  EnterpriseRbacService,
} from "./enterprise/index.js";

test("Biometrics & Access Control: Multi-modal enrollment and identification engine", async (t) => {
  const companyId = "test-comp-biometrics";

  await t.test("1. Cadastro completo de pessoas (Colaborador, Membro de Ginásio e Visitante)", async () => {
    // 1. Colaborador de RH
    const employee = await EnterpriseBiometricsAccessService.registerPerson({
      companyId,
      internalCode: "EMP-001",
      fullName: "Eng. Armindo Sebastião",
      nif: "5418902123",
      phone: "+244 923 444 555",
      department: "Engenharia de Sistemas",
      category: "EMPLOYEE",
      status: "ACTIVE",
    });
    assert.ok(employee.id);
    assert.equal(employee.internalCode, "EMP-001");
    assert.equal(employee.fullName, "Eng. Armindo Sebastião");

    // 2. Membro de Ginásio / Aluno
    const member = await EnterpriseBiometricsAccessService.registerPerson({
      companyId,
      internalCode: "MEM-101",
      fullName: "Carla Patrícia Mendes",
      phone: "+244 931 777 888",
      category: "MEMBER",
      status: "ACTIVE",
    });
    assert.ok(member.id);
    assert.equal(member.category, "MEMBER");

    // Listar pessoas com filtro
    const listEmployees = await EnterpriseBiometricsAccessService.listPersons({ companyId, category: "EMPLOYEE" });
    assert.ok(listEmployees.length >= 1);
    assert.ok(listEmployees.some((p) => p.internalCode === "EMP-001"));
  });

  await t.test("2. Reconhecimento Facial: Cálculo de similaridade de cosseno L2 e matching 1:1 e 1:N", async () => {
    // Criar vetor base (128D)
    const baseVector = new Array(128).fill(0).map((_, i) => Math.sin(i + 1));
    // Normalizar vetor base
    const norm = Math.sqrt(baseVector.reduce((acc, val) => acc + val * val, 0));
    const normalizedEnrolledVector = baseVector.map((val) => val / norm);

    // Vetor com ligeiro ruído (mesma pessoa com iluminação ligeiramente diferente)
    const probeSimilar = normalizedEnrolledVector.map((val, i) => val + (i % 2 === 0 ? 0.01 : -0.01));
    const probeSimilarNorm = Math.sqrt(probeSimilar.reduce((acc, val) => acc + val * val, 0));
    const normalizedProbeSimilar = probeSimilar.map((val) => val / probeSimilarNorm);

    // Vetor completamente diferente (outra pessoa)
    const probeDifferent = new Array(128).fill(0).map((_, i) => Math.cos((i + 1) * 3));
    const diffNorm = Math.sqrt(probeDifferent.reduce((acc, val) => acc + val * val, 0));
    const normalizedProbeDiff = probeDifferent.map((val) => val / diffNorm);

    // 1. Validar função matemática de cosseno
    const perfectSim = EnterpriseBiometricsAccessService.calculateCosineSimilarity(
      normalizedEnrolledVector,
      normalizedEnrolledVector
    );
    assert.ok(Math.abs(perfectSim - 1.0) < 0.0001, "Vetores idênticos devem ter similaridade 1.0");

    const highSim = EnterpriseBiometricsAccessService.calculateCosineSimilarity(
      normalizedEnrolledVector,
      normalizedProbeSimilar
    );
    assert.ok(highSim >= 0.85, "Mesma face com variação de luz deve ter similaridade >= 0.85");

    const lowSim = EnterpriseBiometricsAccessService.calculateCosineSimilarity(
      normalizedEnrolledVector,
      normalizedProbeDiff
    );
    assert.ok(lowSim < 0.6, "Faces distintas devem ter similaridade baixa (< 0.60)");

    // 2. Associar face ao colaborador
    const persons = await EnterpriseBiometricsAccessService.listPersons({ companyId, search: "Armindo" });
    const emp = persons[0]!;
    assert.ok(emp);

    await EnterpriseBiometricsAccessService.enrollCredential({
      personId: emp.id!,
      type: "FACE",
      biometricTemplate: JSON.stringify(normalizedEnrolledVector),
      hardwareVendor: "HIKVISION_MINMOE",
      qualityScore: 98,
    });

    // 3. Teste de Identificação Facial 1:N
    const idResult = await EnterpriseBiometricsAccessService.identifyFace(companyId, normalizedProbeSimilar);
    assert.equal(idResult.identified, true);
    assert.ok(idResult.person);
    assert.equal(idResult.person?.fullName, "Eng. Armindo Sebastião");
    assert.ok(idResult.similarity >= 0.85);

    // 4. Teste de rejeição para face desconhecida
    const idUnknown = await EnterpriseBiometricsAccessService.identifyFace(companyId, normalizedProbeDiff);
    assert.equal(idUnknown.identified, false);
  });

  await t.test("3. Impressão Digital: Associação de template ISO/ANSI e identificação biométrica 1:N", async () => {
    const persons = await EnterpriseBiometricsAccessService.listPersons({ companyId, search: "Armindo" });
    const emp = persons[0]!;

    const fingerprintIsoTemplate = "ZKTECO_ISO_19794_2_SAMPLE_MINUTIAE_TEMPLATE_ARMINDO_RIGHT_INDEX_FINGER_BASE64_AAAA";

    await EnterpriseBiometricsAccessService.enrollCredential({
      personId: emp.id!,
      type: "FINGERPRINT",
      biometricTemplate: fingerprintIsoTemplate,
      hardwareVendor: "ZKTECO_SLK20R",
      qualityScore: 95,
    });

    // Identificação 1:N com sucesso
    const match = await EnterpriseBiometricsAccessService.identifyFingerprint(companyId, fingerprintIsoTemplate);
    assert.equal(match.identified, true);
    assert.equal(match.person?.fullName, "Eng. Armindo Sebastião");
    assert.ok(match.score >= 70);

    // Rejeição com template desconhecido
    const failMatch = await EnterpriseBiometricsAccessService.identifyFingerprint(companyId, "UNKNOWN_TEMPLATE_XXXXXXXX");
    assert.equal(failMatch.identified, false);
  });

  await t.test("4. Cartão RFID & NFC: Validação automática de UID", async () => {
    const persons = await EnterpriseBiometricsAccessService.listPersons({ companyId, search: "Armindo" });
    const emp = persons[0]!;

    const rfidCardUid = "04A1B2C3D4";

    await EnterpriseBiometricsAccessService.enrollCredential({
      personId: emp.id!,
      type: "RFID_CARD",
      identifier: rfidCardUid,
      hardwareVendor: "MIFARE_13_56MHZ",
    });

    const identified = await EnterpriseBiometricsAccessService.identifyByRfid(companyId, "04:A1:B2:C3:D4");
    assert.ok(identified);
    assert.equal(identified?.fullName, "Eng. Armindo Sebastião");

    const notFound = await EnterpriseBiometricsAccessService.identifyByRfid(companyId, "99999999");
    assert.equal(notFound, null);
  });

  await t.test("5. QR Code Dinâmico Anti-Fraude com assinatura HMAC-SHA256 e expiração", async () => {
    const persons = await EnterpriseBiometricsAccessService.listPersons({ companyId, search: "Armindo" });
    const emp = persons[0]!;

    // Gerar token válido por 30 segundos
    const qr = EnterpriseBiometricsAccessService.generateDynamicQrCode(emp.id!, 30);
    assert.ok(qr.token);
    assert.ok(qr.expiresAt);

    // Validação do token legítimo
    const checkValid = EnterpriseBiometricsAccessService.validateDynamicQrCode(qr.token);
    assert.equal(checkValid.valid, true);
    assert.equal(checkValid.personId, emp.id);

    // Rejeição de token adulterado
    const tampered = qr.token.slice(0, -4) + "XXXX";
    const checkTampered = EnterpriseBiometricsAccessService.validateDynamicQrCode(tampered);
    assert.equal(checkTampered.valid, false);

    // Rejeição de token expirado
    const expiredQr = EnterpriseBiometricsAccessService.generateDynamicQrCode(emp.id!, -5); // expirou há 5 segundos
    const checkExpired = EnterpriseBiometricsAccessService.validateDynamicQrCode(expiredQr.token);
    assert.equal(checkExpired.valid, false);
    assert.equal(checkExpired.errorReason, "QR_CODE_EXPIRED");
  });

  await t.test("6. Controlo de Ginásios: Abertura com plano ativo vs Bloqueio automático de mensalidade expirada", async () => {
    const persons = await EnterpriseBiometricsAccessService.listPersons({ companyId, search: "Carla" });
    const member = persons[0]!;
    assert.ok(member);

    // Associar RFID à Carla
    await EnterpriseBiometricsAccessService.enrollCredential({
      personId: member.id!,
      type: "RFID_CARD",
      identifier: "CARLA-RFID-888",
    });

    // 1. Tentar aceder sem plano ativo -> DEVE BLOQUEAR
    const attemptNoSub = await EnterpriseBiometricsAccessService.processAccessEvent({
      companyId,
      deviceId: "device-door-gym-in",
      authMethod: "RFID_CARD",
      identifier: "CARLA-RFID-888",
    });

    assert.equal(attemptNoSub.granted, false);
    assert.equal(attemptNoSub.decisionCode, "ACCESS_DENIED");
    assert.equal(attemptNoSub.denialReason, "MENSALIDADE_EXPIRADA");
    assert.equal(attemptNoSub.actuation.commandSent, "BUZZER_DENY");

    // 2. Subscrição de Plano Mensal de Ginásio (Ativo por 1 mês)
    EnterpriseBiometricsAccessService.createSubscription({
      companyId,
      personId: member.id!,
      planName: "Livre Trânsito Ginásio & Aulas de Grupo",
      durationMonths: 1,
      amountCents: 3500000, // 35.000 Kz
      isPaid: true,
    });

    // 3. Tentar aceder novamente com plano ativo -> DEVE ABRIR TORNIQUETE
    const attemptWithSub = await EnterpriseBiometricsAccessService.processAccessEvent({
      companyId,
      deviceId: "device-door-gym-in",
      authMethod: "RFID_CARD",
      identifier: "CARLA-RFID-888",
    });

    assert.equal(attemptWithSub.granted, true);
    assert.equal(attemptWithSub.decisionCode, "ACCESS_GRANTED");
    assert.equal(attemptWithSub.actuation.commandSent, "UNLOCK_PULSE");
    assert.equal(attemptWithSub.actuation.success, true);
    assert.equal(attemptWithSub.membership?.planName, "Livre Trânsito Ginásio & Aulas de Grupo");
    assert.equal(attemptWithSub.membership?.status, "ACTIVE");
  });

  await t.test("7. RH & Picagem de Ponto: Registo de assiduidade, atrasos e cálculo de horas", async () => {
    const persons = await EnterpriseBiometricsAccessService.listPersons({ companyId, search: "Armindo" });
    const emp = persons[0]!;

    // Validação de entrada no torniquete principal
    const entryEvent = await EnterpriseBiometricsAccessService.processAccessEvent({
      companyId,
      deviceId: "device-turnstile-main-in",
      authMethod: "RFID_CARD",
      identifier: "04A1B2C3D4",
    });

    assert.equal(entryEvent.granted, true);
    assert.equal(entryEvent.attendance?.punchType, "CHECK_IN");

    const records = EnterpriseBiometricsAccessService.getAttendanceRecords(companyId);
    assert.ok(records.length >= 1);
    const myRecord = records.find((r) => r.personId === emp.id);
    assert.ok(myRecord);
    assert.ok(myRecord.checkIn);
  });

  await t.test("8. Gestão de Visitantes (VMS): Cadastro temporário e autorização de entrada", async () => {
    const visitor = EnterpriseBiometricsAccessService.registerVisitor({
      companyId,
      fullName: "Dra. Teresa Van-Dúnem",
      nif: "5419998821",
      phone: "+244 912 333 444",
      hostEmployeeName: "Eng. Armindo Sebastião",
      hostDepartment: "Engenharia de Sistemas",
      purpose: "Auditoria de Segurança da Informação",
      validHours: 4,
    });

    assert.ok(visitor.person.id);
    assert.ok(visitor.pass.id);
    assert.equal(visitor.pass.status, "APPROVED");
    assert.ok(visitor.pass.badgeNumber);
  });

  await t.test("9. Hardware Gateways: Suporte aos protocolos ZKTeco, Hikvision, MQTT e Relés", () => {
    const devZk: AccessDeviceDto = { companyId, name: "Torniquete ZKTeco", protocol: "ZKTECO_TCP" };
    const devHik: AccessDeviceDto = { companyId, name: "MinMoe Hikvision", protocol: "HIKVISION_ISAPI" };
    const devMqtt: AccessDeviceDto = { companyId, name: "Porta IoT MQTT", protocol: "MQTT_IOT" };
    const devRelay: AccessDeviceDto = { companyId, name: "Relé Webhook", protocol: "RELAY_HTTP" };

    assert.equal(EnterpriseBiometricsAccessService.triggerHardwareActuator(devZk), true);
    assert.equal(EnterpriseBiometricsAccessService.triggerHardwareActuator(devHik), true);
    assert.equal(EnterpriseBiometricsAccessService.triggerHardwareActuator(devMqtt), true);
    assert.equal(EnterpriseBiometricsAccessService.triggerHardwareActuator(devRelay), true);
  });

  await t.test("10. Dashboard de Acessos em Tempo Real e Métricas de Lotação", () => {
    EnterpriseBiometricsAccessService.registerDevice({
      companyId,
      name: "Torniquete Principal Entrada",
      type: "TURNSTILE",
      direction: "ENTRY",
      protocol: "ZKTECO_TCP",
      relayPulseMs: 3000,
    });
    const metrics = EnterpriseBiometricsAccessService.getDashboardMetrics(companyId);
    assert.ok(metrics);
    assert.equal(metrics.companyId, companyId);
    assert.ok(typeof metrics.presentCount === "number");
    assert.ok(metrics.todayEntries >= 1);
    assert.ok(metrics.recentLogs.length >= 1);
    assert.ok(metrics.devicesTotal >= 1);
  });

  await t.test("11. Integração com VendaJá Copilot: Perguntas em Linguagem Natural com dados reais", async () => {
    const adminUserId = "admin-biometrics-user";
    EnterpriseRbacService.hasPermission = async () => true;

    // 1. Quem entrou hoje?
    const resEntered = await EnterpriseAiCopilotService.query({
      query: "Quem entrou hoje?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resEntered.intent, "ACCESS_WHO_ENTERED_TODAY");
    assert.equal(resEntered.domain, "ACCESS_CONTROL");
    assert.equal(resEntered.authorized, true);
    assert.ok(resEntered.textAnswer.includes("entradas"));

    // 2. Quem está dentro do edifício?
    const resInside = await EnterpriseAiCopilotService.query({
      query: "Quem está dentro do edifício?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resInside.intent, "ACCESS_WHO_IS_INSIDE");
    assert.equal(resInside.domain, "ACCESS_CONTROL");
    assert.ok(resInside.textAnswer.includes("edifício"));

    // 3. Quem teve mais atrasos?
    const resDelays = await EnterpriseAiCopilotService.query({
      query: "Quem teve mais atrasos?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resDelays.intent, "ACCESS_MOST_DELAYS");
    assert.equal(resDelays.domain, "ACCESS_CONTROL");

    // 4. Quem está com plano expirado?
    const resExpired = await EnterpriseAiCopilotService.query({
      query: "Quem está com plano expirado?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resExpired.intent, "ACCESS_EXPIRED_PLANS");
    assert.equal(resExpired.domain, "ACCESS_CONTROL");

    // 5. Quantos alunos estão presentes?
    const resStudents = await EnterpriseAiCopilotService.query({
      query: "Quantos alunos estão presentes?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resStudents.intent, "ACCESS_STUDENTS_PRESENT");
    assert.equal(resStudents.domain, "ACCESS_CONTROL");

    // 6. Quantos colaboradores faltaram hoje?
    const resAbsent = await EnterpriseAiCopilotService.query({
      query: "Quantos colaboradores faltaram hoje?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resAbsent.intent, "ACCESS_COLLABORATORS_ABSENT");
    assert.equal(resAbsent.domain, "ACCESS_CONTROL");
  });
});
