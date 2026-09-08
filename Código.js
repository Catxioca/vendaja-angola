/**
 * TMP Kinaxixi V2.0
 * Backend Google Apps Script
 *
 * Funcionalidades:
 * - Web App
 * - Base de dados Google Sheets
 * - Cadastro
 * - Login
 * - Recuperação de senha
 * - Gestão de turnos
 * - Inscrição em turnos
 * - Formulários
 * - Gestão de perfil
 * - Administração
 * - Logs de acesso
 *
 * IMPORTANTE:
 * Este ficheiro centraliza as funções globais do backend.
 * Não declare novamente APP_NAME, SHEETS, HEADERS, COL, STATUS ou PERFIL
 * noutros ficheiros .gs.
 */

// ============================================================================
// CONFIGURAÇÃO GLOBAL
// ============================================================================

const APP_NAME = 'TMP Kinaxixi V2.0';

const TOKEN_TTL_MINUTES = 15;

const SHEETS = Object.freeze({
  USUARIOS: 'Usuarios',
  TOKENS: 'TokensRecuperacao',
  LOCAIS: 'Locais',
  TURNOS: 'Turnos',
  LOGS: 'LogsAcesso',
  LINKS: 'LinksFormularios',
  INSCRICOES: 'Inscricoes'
});

const HEADERS = Object.freeze({
  Usuarios: [
    'ID',
    'Nome',
    'Apelido',
    'Celular',
    'Email',
    'SenhaHash',
    'Perfil',
    'Status',
    'DataCriacao',
    'Idioma'
  ],

  TokensRecuperacao: [
    'Email',
    'Token',
    'Expiracao',
    'Status'
  ],

  Locais: [
    'ID',
    'NomeLocal',
    'Tipo',
    'Status'
  ],

  Turnos: [
    'ID',
    'LocalID',
    'Data',
    'HoraInicio',
    'HoraFim',
    'Vagas',
    'Status'
  ],

  LogsAcesso: [
    'ID',
    'Email',
    'DataHora',
    'StatusAcesso'
  ],

  LinksFormularios: [
    'ID',
    'Tipo',
    'Mes',
    'URL'
  ],

  Inscricoes: [
    'ID',
    'TurnoID',
    'Email',
    'Nome',
    'Apelido',
    'Celular',
    'DataInscricao',
    'Status'
  ]
});

const COL = Object.freeze({
  USUARIO: {
    ID: 0,
    NOME: 1,
    APELIDO: 2,
    CELULAR: 3,
    EMAIL: 4,
    SENHA_HASH: 5,
    PERFIL: 6,
    STATUS: 7,
    DATA_CRIACAO: 8,
    IDIOMA: 9
  },

  TOKEN: {
    EMAIL: 0,
    TOKEN: 1,
    EXPIRACAO: 2,
    STATUS: 3
  },

  LOG: {
    ID: 0,
    EMAIL: 1,
    DATA_HORA: 2,
    STATUS_ACESSO: 3
  },

  LOCAL: {
    ID: 0,
    NOME: 1,
    TIPO: 2,
    STATUS: 3
  },

  TURNO: {
    ID: 0,
    LOCAL_ID: 1,
    DATA: 2,
    HORA_INICIO: 3,
    HORA_FIM: 4,
    VAGAS: 5,
    STATUS: 6
  },

  LINK: {
    ID: 0,
    TIPO: 1,
    MES: 2,
    URL: 3
  },

  INSCRICAO: {
    ID: 0,
    TURNO_ID: 1,
    EMAIL: 2,
    NOME: 3,
    APELIDO: 4,
    CELULAR: 5,
    DATA: 6,
    STATUS: 7
  }
});

const MESES_NOME = Object.freeze([
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]);

const PERFIL = Object.freeze({
  ADMIN: 'Administrador',
  USER: 'Utilizador'
});

const STATUS = Object.freeze({
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  PENDENTE: 'Pendente',
  UTILIZADO: 'Utilizado',
  CANCELADO: 'Cancelado',
  EXPIRADO: 'Expirado',
  ESGOTADO: 'Esgotado'
});

const ACESSO = Object.freeze({
  SUCESSO: 'Sucesso',
  FALHA: 'Falha'
});

// ============================================================================
// WEB APP
// ============================================================================

function doGet(e) {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}

// ============================================================================
// MENU DA PLANILHA
// ============================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(APP_NAME)
    .addItem('Inicializar Base de Dados', 'setupDatabase')
    .addToUi();
}

// ============================================================================
// RESPOSTAS PADRONIZADAS
// ============================================================================

function ok_(message, extra) {
  return Object.assign(
    {
      success: true,
      status: 'success',
      message: message || 'Operação concluída.'
    },
    extra || {}
  );
}

function fail_(message, extra) {
  return Object.assign(
    {
      success: false,
      status: 'error',
      message: message || 'Ocorreu um erro inesperado.'
    },
    extra || {}
  );
}

// ============================================================================
// GOOGLE SHEETS
// ============================================================================

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'Nenhuma planilha ativa. Abra o projeto ligado a uma Folha de Cálculo.'
    );
  }

  return ss;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);

  if (!sheet) {
    throw new Error(
      `A aba "${name}" não existe. Execute setupDatabase() primeiro.`
    );
  }

  return sheet;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  const requiredColumns = headers.length;

  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredColumns - sheet.getMaxColumns()
    );
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, requiredColumns)
    .getValues()[0];

  let headersDifferent = false;

  for (let i = 0; i < requiredColumns; i++) {
    if (
      String(currentHeaders[i] || '').trim() !==
      String(headers[i] || '').trim()
    ) {
      headersDifferent = true;
      break;
    }
  }

  if (headersDifferent) {
    sheet
      .getRange(1, 1, 1, requiredColumns)
      .setValues([headers]);
  }

  sheet
    .getRange(1, 1, 1, requiredColumns)
    .setFontWeight('bold')
    .setBackground('#1a365d')
    .setFontColor('#ffffff');

  sheet.setFrozenRows(1);

  return sheet;
}

function nextId_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 1;
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues();

  let max = 0;

  values.forEach(function (row) {
    const number = Number(row[0]);

    if (!isNaN(number) && number > max) {
      max = number;
    }
  });

  return max + 1;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function now_() {
  return new Date();
}

function formatDateTime_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
}

function normalizeEmail_(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, lastCol)
    .getValues();
}

// ============================================================================
// SEGURANÇA / PASSWORD
// ============================================================================

function bytesToHex_(bytes) {
  return bytes
    .map(function (b) {
      const value = b < 0 ? b + 256 : b;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}

function sha256Hex_(text) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );

  return bytesToHex_(digest);
}

function generateSalt_() {
  return Utilities
    .getUuid()
    .replace(/-/g, '')
    .substring(0, 16);
}

function createPasswordHash_(plainPassword) {
  const salt = generateSalt_();

  return (
    salt +
    ':' +
    sha256Hex_(salt + String(plainPassword))
  );
}

function verifyPassword_(plainPassword, storedHash) {
  const stored = String(storedHash || '');
  const parts = stored.split(':');

  if (parts.length !== 2) {
    return false;
  }

  const salt = parts[0];
  const expected = parts[1];

  return (
    sha256Hex_(salt + String(plainPassword)) === expected
  );
}

/**
 * Compatibilidade com código antigo.
 */
function hashPassword(text) {
  return createPasswordHash_(text);
}

function generateNumericToken_() {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + String(Date.now()),
    Utilities.Charset.UTF_8
  );

  const b0 = bytes[0] < 0 ? bytes[0] + 256 : bytes[0];
  const b1 = bytes[1] < 0 ? bytes[1] + 256 : bytes[1];
  const b2 = bytes[2] < 0 ? bytes[2] + 256 : bytes[2];

  const number =
    ((b0 << 16) + (b1 << 8) + b2) % 900000;

  return String(number + 100000);
}

// ============================================================================
// BASE DE DADOS
// ============================================================================

function setupDatabase() {
  try {
    const ss = getSpreadsheet_();

    Object.keys(HEADERS).forEach(function (name) {
      ensureSheet_(ss, name, HEADERS[name]);
    });

    const sheet1 =
      ss.getSheetByName('Sheet1') ||
      ss.getSheetByName('Folha1');

    if (
      sheet1 &&
      ss.getSheets().length > 1
    ) {
      const hasData =
        sheet1.getLastRow() > 1 ||
        sheet1.getLastColumn() > 1;

      if (!hasData) {
        ss.deleteSheet(sheet1);
      }
    }

    return ok_(
      'Base de dados inicializada com sucesso.'
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// UTILIZADORES
// ============================================================================

function findUserByEmail_(email) {
  const sheet = getSheet_(SHEETS.USUARIOS);
  const rows = getDataRows_(sheet);
  const target = normalizeEmail_(email);

  for (let i = 0; i < rows.length; i++) {
    if (
      normalizeEmail_(
        rows[i][COL.USUARIO.EMAIL]
      ) === target
    ) {
      return {
        rowIndex: i + 2,
        data: rows[i]
      };
    }
  }

  return null;
}

function findUserById_(userId) {
  const sheet = getSheet_(SHEETS.USUARIOS);
  const rows = getDataRows_(sheet);
  const target = String(userId || '').trim();

  for (let i = 0; i < rows.length; i++) {
    if (
      String(rows[i][COL.USUARIO.ID]).trim() ===
      target
    ) {
      return {
        rowIndex: i + 2,
        data: rows[i]
      };
    }
  }

  return null;
}

function mapUserPublic_(row) {
  return {
    id: String(row[COL.USUARIO.ID] || '').trim(),
    email: normalizeEmail_(
      row[COL.USUARIO.EMAIL]
    ),
    nome: String(
      row[COL.USUARIO.NOME] || ''
    ).trim(),
    apelido: String(
      row[COL.USUARIO.APELIDO] || ''
    ).trim(),
    celular: String(
      row[COL.USUARIO.CELULAR] || ''
    ).trim(),
    perfil: String(
      row[COL.USUARIO.PERFIL] || ''
    ).trim(),
    status: String(
      row[COL.USUARIO.STATUS] || ''
    ).trim(),
    idioma: String(
      row[COL.USUARIO.IDIOMA] || 'pt'
    ).trim()
  };
}

function appendAccessLog_(email, statusAcesso) {
  const sheet = getSheet_(SHEETS.LOGS);
  const id = nextId_(sheet);

  sheet.appendRow([
    id,
    normalizeEmail_(email),
    formatDateTime_(now_()),
    statusAcesso
  ]);
}

/**
 * Compatibilidade com versões anteriores.
 */
function logAccess(email, statusAcesso) {
  try {
    setupDatabase();

    appendAccessLog_(
      email,
      statusAcesso || ACESSO.SUCESSO
    );

    return ok_('Acesso registado.');
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// CADASTRO
// ============================================================================

function registerUser(formData) {
  try {
    setupDatabase();

    const data = formData || {};

    const nome = String(
      data.Nome || data.nome || ''
    ).trim();

    const apelido = String(
      data.Apelido || data.apelido || ''
    ).trim();

    const celular = String(
      data.Celular || data.celular || ''
    ).trim();

    const email = normalizeEmail_(
      data.Email || data.email
    );

    const confirmarEmail = normalizeEmail_(
      data.ConfirmarEmail ||
      data.confirmarEmail ||
      data.confirmEmail
    );

    const senha = String(
      data.Senha || data.senha || ''
    );

    if (
      !nome ||
      !apelido ||
      !celular ||
      !email ||
      !senha
    ) {
      return fail_(
        'Preencha todos os campos obrigatórios.'
      );
    }

    if (!isValidEmail_(email)) {
      return fail_(
        'Indique um e-mail válido.'
      );
    }

    if (
      confirmarEmail &&
      email !== confirmarEmail
    ) {
      return fail_(
        'O e-mail e a confirmação de e-mail não coincidem.'
      );
    }

    if (senha.length < 6) {
      return fail_(
        'A senha deve ter pelo menos 6 caracteres.'
      );
    }

    return withLock_(function () {
      if (findUserByEmail_(email)) {
        return fail_(
          'E-mail já cadastrado.'
        );
      }

      const sheet =
        getSheet_(SHEETS.USUARIOS);

      const isFirstUser =
        sheet.getLastRow() < 2;

      const perfil =
        isFirstUser
          ? PERFIL.ADMIN
          : PERFIL.USER;

      const id = nextId_(sheet);
      const senhaHash =
        createPasswordHash_(senha);

      sheet.appendRow([
        id,
        nome,
        apelido,
        celular,
        email,
        senhaHash,
        perfil,
        STATUS.ATIVO,
        formatDateTime_(now_()),
        'pt'
      ]);

      return ok_(
        'Conta criada com sucesso!',
        {
          user: {
            id: String(id),
            nome: nome,
            apelido: apelido,
            celular: celular,
            email: email,
            perfil: perfil,
            status: STATUS.ATIVO,
            idioma: 'pt'
          }
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// LOGIN
// ============================================================================

function loginUser(email, senha) {
  try {
    setupDatabase();

    const emailNorm =
      normalizeEmail_(email);

    const senhaInformada =
      String(senha || '');

    if (
      !emailNorm ||
      !senhaInformada
    ) {
      appendAccessLog_(
        emailNorm || '(vazio)',
        ACESSO.FALHA
      );
      return fail_(
        'E-mail e senha são obrigatórios.'
      );
    }

    const found =
      findUserByEmail_(emailNorm);

    if (!found) {
      appendAccessLog_(
        emailNorm,
        ACESSO.FALHA
      );

      return fail_(
        'E-mail ou senha inválidos.'
      );
    }

    const user = found.data;

    const statusConta =
      String(
        user[COL.USUARIO.STATUS] || ''
      ).trim();

    if (statusConta !== STATUS.ATIVO) {
      appendAccessLog_(
        emailNorm,
        ACESSO.FALHA
      );

      return fail_(
        'Conta inativa. Contacte o administrador.'
      );
    }

    if (
      !verifyPassword_(
        senhaInformada,
        user[COL.USUARIO.SENHA_HASH]
      )
    ) {
      appendAccessLog_(
        emailNorm,
        ACESSO.FALHA
      );

      return fail_(
        'E-mail ou senha inválidos.'
      );
    }

    appendAccessLog_(
      emailNorm,
      ACESSO.SUCESSO
    );

    return ok_(
      'Login efetuado com sucesso.',
      {
        user: mapUserPublic_(user)
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// RECUPERAÇÃO DE SENHA
// ============================================================================

function buildResetEmailHtml_(token, nome) {
  const saudacao = nome
    ? 'Olá, ' + nome
    : 'Olá';

  return `
<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Recuperação de senha</title>
</head>

<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
style="background:#f3f4f6;padding:24px 0;">

<tr>
<td align="center">

<table role="presentation" width="560" cellspacing="0" cellpadding="0"
style="background:#ffffff;border-radius:12px;overflow:hidden;">

<tr>
<td style="background:#1a365d;padding:24px 32px;color:#ffffff;">

<h1 style="margin:0;font-size:20px;">
${APP_NAME}
</h1>

<p style="margin:8px 0 0;font-size:13px;">
Recuperação de senha
</p>

</td>
</tr>

<tr>
<td style="padding:32px;">

<p style="margin:0 0 12px;color:#111827;font-size:16px;">
${saudacao},
</p>

<p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6;">
Recebemos um pedido para redefinir a sua senha.
Utilize o código abaixo.
Este código é válido por
<strong>${TOKEN_TTL_MINUTES} minutos</strong>.
</p>

<p style="margin:0 auto 24px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:bold;color:#1a365d;background:#edf2f7;padding:16px 0;border-radius:8px;">
${token}
</p>

<p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
Se não solicitou esta alteração, ignore este e-mail.
A sua senha permanece inalterada.
</p>

</td>
</tr>

<tr>
<td style="padding:16px 32px 24px;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb;">
Mensagem automática do sistema ${APP_NAME}.
Não responda a este e-mail.
</td>
</tr>

</table>

</td>
</tr>

</table>

</body>
</html>`;
}

function requestPasswordReset(email) {
  try {
    setupDatabase();

    const emailNorm =
      normalizeEmail_(email);

    if (
      !emailNorm ||
      !isValidEmail_(emailNorm)
    ) {
      return fail_(
        'Indique um e-mail válido.'
      );
    }

    const found =
      findUserByEmail_(emailNorm);

    if (!found) {
      return fail_(
        'E-mail não encontrado.'
      );
    }

    if (
      !isAtivo_(
        found.data[COL.USUARIO.STATUS]
      )
    ) {
      return fail_(
        'A conta está inativa. Contacte o administrador.'
      );
    }

    const token =
      generateNumericToken_();

    const expiracao =
      new Date(
        now_().getTime() +
        TOKEN_TTL_MINUTES * 60 * 1000
      );

    const nome =
      String(
        found.data[COL.USUARIO.NOME] || ''
      );

    withLock_(function () {
      const sheet =
        getSheet_(SHEETS.TOKENS);

      const rows =
        getDataRows_(sheet);

      rows.forEach(function (row, index) {
        const sameEmail =
          normalizeEmail_(
            row[COL.TOKEN.EMAIL]
          ) === emailNorm;

        const pendente =
          String(
            row[COL.TOKEN.STATUS] || ''
          ) === STATUS.PENDENTE;

        if (sameEmail && pendente) {
          sheet
            .getRange(
              index + 2,
              COL.TOKEN.STATUS + 1
            )
            .setValue(
              STATUS.CANCELADO
            );
        }
      });

      sheet.appendRow([
        emailNorm,
        token,
        expiracao,
        STATUS.PENDENTE
      ]);
    });

    GmailApp.sendEmail(
      emailNorm,
      APP_NAME +
        ' — Código de recuperação de senha',
      'O seu código de recuperação é ' +
        token +
        '. Válido por ' +
        TOKEN_TTL_MINUTES +
        ' minutos.',
      {
        htmlBody:
          buildResetEmailHtml_(
            token,
            nome
          ),
        name: APP_NAME
      }
    );

    return ok_(
      'Código de recuperação enviado para o seu e-mail.'
    );
  } catch (error) {
    return fail_(error.message);
  }
}

function resetPasswordWithToken(
  email,
  token,
  novaSenha
) {
  try {
    setupDatabase();

    const emailNorm =
      normalizeEmail_(email);

    const tokenInformado =
      String(token || '').trim();

    const senha =
      String(novaSenha || '');

    if (
      !emailNorm ||
      !tokenInformado ||
      !senha
    ) {
      return fail_(
        'E-mail, código e nova senha são obrigatórios.'
      );
    }

    if (senha.length < 6) {
      return fail_(
        'A nova senha deve ter pelo menos 6 caracteres.'
      );
    }

    return withLock_(function () {
      const tokenSheet =
        getSheet_(SHEETS.TOKENS);

      const rows =
        getDataRows_(tokenSheet);

      let tokenRow = null;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const sameEmail =
          normalizeEmail_(
            row[COL.TOKEN.EMAIL]
          ) === emailNorm;

        const sameToken =
          String(
            row[COL.TOKEN.TOKEN]
          ).trim() === tokenInformado;

        const pendente =
          String(
            row[COL.TOKEN.STATUS] || ''
          ) === STATUS.PENDENTE;

        if (
          sameEmail &&
          sameToken &&
          pendente
        ) {
          tokenRow = {
            rowIndex: i + 2,
            data: row
          };

          break;
        }
      }

      if (!tokenRow) {
        return fail_(
          'Código inválido ou já utilizado.'
        );
      }

      const expiracao =
        new Date(
          tokenRow.data[
            COL.TOKEN.EXPIRACAO
          ]
        );

      if (
        isNaN(expiracao.getTime()) ||
        now_().getTime() >
          expiracao.getTime()
      ) {
        tokenSheet
          .getRange(
            tokenRow.rowIndex,
            COL.TOKEN.STATUS + 1
          )
          .setValue(
            STATUS.EXPIRADO
          );

        return fail_(
          'O código de recuperação expirou. Solicite um novo código.'
        );
      }

      const user =
        findUserByEmail_(emailNorm);

      if (!user) {
        return fail_(
          'Utilizador não encontrado.'
        );
      }

      const novoHash =
        createPasswordHash_(senha);

      getSheet_(SHEETS.USUARIOS)
        .getRange(
          user.rowIndex,
          COL.USUARIO.SENHA_HASH + 1
        )
        .setValue(novoHash);

      tokenSheet
        .getRange(
          tokenRow.rowIndex,
          COL.TOKEN.STATUS + 1
        )
        .setValue(
          STATUS.UTILIZADO
        );

      return ok_(
        'Senha redefinida com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// UTILITÁRIO DE ESTADO
// ============================================================================

function isAtivo_(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() ===
    STATUS.ATIVO.toLowerCase()
  );
}

function idsMatch_(a, b) {
  return (
    String(a || '').trim() ===
    String(b || '').trim()
  );
}

function formatCellDate_(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  return String(value || '').trim();
}

function formatCellTime_(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'HH:mm'
    );
  }

  return String(value || '').trim();
}

function formatCellDateTime_(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return formatDateTime_(value);
  }

  const text =
    String(value || '').trim();

  if (!text) {
    return '';
  }

  const parsed =
    new Date(text);

  if (!isNaN(parsed.getTime())) {
    return formatDateTime_(parsed);
  }

  return text;
}

// ============================================================================
// LOCAIS
// ============================================================================

function getLocaisAtivos() {
  try {
    setupDatabase();

    const rows =
      getDataRows_(
        getSheet_(SHEETS.LOCAIS)
      );

    const locais = rows
      .filter(function (row) {
        return isAtivo_(
          row[COL.LOCAL.STATUS]
        );
      })
      .map(function (row) {
        return {
          id: String(
            row[COL.LOCAL.ID]
          ).trim(),

          nome: String(
            row[COL.LOCAL.NOME] || ''
          ).trim(),

          tipo: String(
            row[COL.LOCAL.TIPO] || ''
          ).trim(),

          status: String(
            row[COL.LOCAL.STATUS] || ''
          ).trim()
        };
      });

    return ok_(
      'Locais carregados.',
      {
        locais: locais
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// TURNOS
// ============================================================================

function getTurnosPorLocal(localId) {
  try {
    setupDatabase();

    const filtro =
      String(localId || '').trim();

    const semFiltro =
      !filtro ||
      filtro.toUpperCase() === 'ALL';

    const locaisRows =
      getDataRows_(
        getSheet_(SHEETS.LOCAIS)
      );

    const locaisMap = {};

    locaisRows.forEach(function (row) {
      const id =
        String(
          row[COL.LOCAL.ID]
        ).trim();

      locaisMap[id] =
        String(
          row[COL.LOCAL.NOME] || ''
        ).trim();
    });

    const rows =
      getDataRows_(
        getSheet_(SHEETS.TURNOS)
      );

    const turnos = [];

    rows.forEach(function (row) {
      const vagas =
        Number(
          row[COL.TURNO.VAGAS]
        );

      const ativo =
        isAtivo_(
          row[COL.TURNO.STATUS]
        );

      const mesmoLocal =
        semFiltro ||
        idsMatch_(
          row[COL.TURNO.LOCAL_ID],
          filtro
        );

      if (
        !ativo ||
        !mesmoLocal ||
        !(vagas > 0)
      ) {
        return;
      }

      const localIdTurno =
        String(
          row[COL.TURNO.LOCAL_ID]
        ).trim();

      turnos.push({
        id: String(
          row[COL.TURNO.ID]
        ).trim(),

        localId: localIdTurno,

        localNome:
          locaisMap[localIdTurno] || '',

        data:
          formatCellDate_(
            row[COL.TURNO.DATA]
          ),

        horaInicio:
          formatCellTime_(
            row[COL.TURNO.HORA_INICIO]
          ),

        horaFim:
          formatCellTime_(
            row[COL.TURNO.HORA_FIM]
          ),

        vagas: vagas,

        status: String(
          row[COL.TURNO.STATUS] || ''
        ).trim()
      });
    });

    turnos.sort(function (a, b) {
      const dateA =
        String(a.data) +
        ' ' +
        String(a.horaInicio);

      const dateB =
        String(b.data) +
        ' ' +
        String(b.horaInicio);

      return dateA.localeCompare(
        dateB
      );
    });

    return ok_(
      'Turnos carregados.',
      {
        turnos: turnos
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// INSCRIÇÃO EM TURNO
// ============================================================================

function inscreverTurno(
  turnoId,
  userData
) {
  try {
    setupDatabase();

    const data =
      userData || {};

    const email =
      normalizeEmail_(
        data.email ||
        data.Email
      );

    const idTurno =
      String(
        turnoId || ''
      ).trim();

    if (!idTurno) {
      return fail_(
        'Turno inválido.'
      );
    }

    if (!email) {
      return fail_(
        'E-mail do utilizador em falta.'
      );
    }

    const user =
      findUserByEmail_(email);

    if (
      !user ||
      !isAtivo_(
        user.data[
          COL.USUARIO.STATUS
        ]
      )
    ) {
      return fail_(
        'Utilizador não encontrado ou inativo.'
      );
    }

    const nome =
      String(
        user.data[
          COL.USUARIO.NOME
        ] || ''
      ).trim();

    const apelido =
      String(
        user.data[
          COL.USUARIO.APELIDO
        ] || ''
      ).trim();

    const celular =
      String(
        user.data[
          COL.USUARIO.CELULAR
        ] || ''
      ).trim();

    return withLock_(function () {
      const turnoSheet =
        getSheet_(SHEETS.TURNOS);

      const turnoRows =
        getDataRows_(turnoSheet);

      let turnoRow = null;

      for (
        let i = 0;
        i < turnoRows.length;
        i++
      ) {
        if (
          idsMatch_(
            turnoRows[i][
              COL.TURNO.ID
            ],
            idTurno
          )
        ) {
          turnoRow = {
            rowIndex: i + 2,
            data: turnoRows[i]
          };

          break;
        }
      }

      if (!turnoRow) {
        return fail_(
          'Turno não encontrado.'
        );
      }

      if (
        !isAtivo_(
          turnoRow.data[
            COL.TURNO.STATUS
          ]
        )
      ) {
        return fail_(
          'Este turno não está ativo.'
        );
      }

      const vagas =
        Number(
          turnoRow.data[
            COL.TURNO.VAGAS
          ]
        );

      if (!(vagas > 0)) {
        return fail_(
          'Não existem vagas disponíveis neste turno.'
        );
      }

      const inscSheet =
        getSheet_(
          SHEETS.INSCRICOES
        );

      const inscricoes =
        getDataRows_(
          inscSheet
        );

      const jaInscrito =
        inscricoes.some(
          function (row) {
            const mesmoTurno =
              idsMatch_(
                row[
                  COL.INSCRICAO.TURNO_ID
                ],
                idTurno
              );

            const mesmoEmail =
              normalizeEmail_(
                row[
                  COL.INSCRICAO.EMAIL
                ]
              ) === email;

            const status =
              String(
                row[
                  COL.INSCRICAO.STATUS
                ] || ''
              )
                .trim()
                .toLowerCase();

            const ativa =
              status !==
                STATUS.CANCELADO.toLowerCase() &&
              status !==
                'cancelado';

            return (
              mesmoTurno &&
              mesmoEmail &&
              ativa
            );
          }
        );

      if (jaInscrito) {
        return fail_(
          'Já está inscrito neste turno.'
        );
      }

      const novasVagas =
        vagas - 1;

      turnoSheet
        .getRange(
          turnoRow.rowIndex,
          COL.TURNO.VAGAS + 1
        )
        .setValue(
          novasVagas
        );

      if (novasVagas <= 0) {
        turnoSheet
          .getRange(
            turnoRow.rowIndex,
            COL.TURNO.STATUS + 1
          )
          .setValue(
            STATUS.ESGOTADO
          );
      }

      const inscricaoId =
        nextId_(inscSheet);

      inscSheet.appendRow([
        inscricaoId,
        idTurno,
        email,
        nome,
        apelido,
        celular,
        formatDateTime_(
          now_()
        ),
        STATUS.ATIVO
      ]);

      return ok_(
        'Inscrição confirmada.',
        {
          inscricaoId:
            String(inscricaoId),

          turnoId:
            idTurno,

          vagas:
            novasVagas,

          status:
            novasVagas <= 0
              ? STATUS.ESGOTADO
              : STATUS.ATIVO
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

/**
 * Compatibilidade com frontend que utiliza subscribeToShift.
 */
function subscribeToShift(
  turnoId,
  userEmail
) {
  try {
    const email =
      normalizeEmail_(userEmail);

    if (!email) {
      return fail_(
        'E-mail do utilizador em falta.'
      );
    }

    const user =
      findUserByEmail_(email);

    if (!user) {
      return fail_(
        'Utilizador não encontrado.'
      );
    }

    return inscreverTurno(
      turnoId,
      {
        email:
          email,

        nome:
          user.data[
            COL.USUARIO.NOME
          ],

        apelido:
          user.data[
            COL.USUARIO.APELIDO
          ],

        celular:
          user.data[
            COL.USUARIO.CELULAR
          ]
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// FORMULÁRIOS
// ============================================================================

function monthMatches_(
  sheetMes,
  mes
) {
  const wanted =
    String(mes || '')
      .trim()
      .toLowerCase();

  const stored =
    String(sheetMes || '')
      .trim()
      .toLowerCase();

  if (!wanted) {
    return true;
  }

  if (!stored) {
    return false;
  }

  const padded =
    wanted.length === 1
      ? '0' + wanted
      : wanted;

  if (
    stored === wanted ||
    stored === padded ||
    stored === String(
      Number(wanted)
    )
  ) {
    return true;
  }

  const idx =
    Number(padded) - 1;

  if (
    idx >= 0 &&
    idx < MESES_NOME.length
  ) {
    const nome =
      MESES_NOME[idx];

    const semAcento =
      nome
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          ''
        );

    const storedNorm =
      stored
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          ''
        );

    return (
      stored === nome ||
      storedNorm === semAcento
    );
  }

  return false;
}

function applyFormPrefill_(
  url,
  perfil,
  mes
) {
  const safe =
    function (value) {
      return encodeURIComponent(
        String(value || '')
      );
    };

  const data =
    perfil || {};

  const map = {
    '{{Nome}}':
      safe(
        data.nome ||
        data.Nome
      ),

    '{{Apelido}}':
      safe(
        data.apelido ||
        data.Apelido
      ),

    '{{Celular}}':
      safe(
        data.celular ||
        data.Celular
      ),

    '{{Email}}':
      safe(
        data.email ||
        data.Email
      ),

    '{{Mes}}':
      safe(mes)
  };

  let output =
    String(url || '').trim();

  Object.keys(map)
    .forEach(function (token) {
      output =
        output
          .split(token)
          .join(map[token]);
    });

  return output;
}

function normalizeTipoForm_(
  tipo
) {
  const t =
    String(tipo || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      );

  if (
    t.indexOf('dispon') === 0
  ) {
    return 'disponibilidade';
  }

  if (
    t.indexOf('ocorr') === 0
  ) {
    return 'ocorrencia';
  }

  if (
    t.indexOf('cancel') === 0
  ) {
    return 'cancelamento';
  }

  return t;
}

function getFormUrlWithPrefill(
  tipo,
  mes,
  perfil
) {
  try {
    setupDatabase();

    const tipoNorm =
      normalizeTipoForm_(tipo);

    if (!tipoNorm) {
      return fail_(
        'Tipo de formulário inválido.'
      );
    }

    const dados =
      perfil || {};

    const email =
      normalizeEmail_(
        dados.email ||
        dados.Email
      );

    if (!email) {
      return fail_(
        'E-mail do utilizador em falta.'
      );
    }

    const user =
      findUserByEmail_(email);

    if (
      !user ||
      !isAtivo_(
        user.data[
          COL.USUARIO.STATUS
        ]
      )
    ) {
      return fail_(
        'Utilizador não encontrado ou inativo.'
      );
    }

    const userData =
      mapUserPublic_(
        user.data
      );

    const rows =
      getDataRows_(
        getSheet_(
          SHEETS.LINKS
        )
      );

    let exact = null;
    let fallback = null;

    rows.forEach(function (row) {
      const rowTipo =
        normalizeTipoForm_(
          row[COL.LINK.TIPO]
        );

      if (
        rowTipo !== tipoNorm
      ) {
        return;
      }

      const url =
        String(
          row[COL.LINK.URL] || ''
        ).trim();

      if (!url) {
        return;
      }

      if (
        monthMatches_(
          row[COL.LINK.MES],
          mes
        )
      ) {
        exact = url;
      } else if (
        !String(
          row[COL.LINK.MES] || ''
        ).trim()
      ) {
        fallback = url;
      }
    });

    const url =
      exact || fallback;

    if (!url) {
      return fail_(
        'Link de formulário não configurado para este tipo/mês. Peça ao administrador para preencher a aba LinksFormularios.'
      );
    }

    return ok_(
      'Link gerado.',
      {
        url:
          applyFormPrefill_(
            url,
            userData,
            mes
          )
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// PERFIL DO UTILIZADOR
// ============================================================================

function updateUserProfile(
  data
) {
  try {
    setupDatabase();

    const payload =
      data || {};

    const email =
      normalizeEmail_(
        payload.Email ||
        payload.email
      );

    const nome =
      String(
        payload.Nome ||
        payload.nome ||
        ''
      ).trim();

    const apelido =
      String(
        payload.Apelido ||
        payload.apelido ||
        ''
      ).trim();

    const celular =
      String(
        payload.Celular ||
        payload.celular ||
        ''
      ).trim();

    const idioma =
      String(
        payload.Idioma ||
        payload.idioma ||
        ''
      ).trim();

    if (!email) {
      return fail_(
        'E-mail da sessão em falta.'
      );
    }

    if (
      !nome ||
      !apelido ||
      !celular
    ) {
      return fail_(
        'Nome, apelido e celular são obrigatórios.'
      );
    }

    return withLock_(function () {
      const found =
        findUserByEmail_(email);

      if (!found) {
        return fail_(
          'Utilizador não encontrado.'
        );
      }

      if (
        !isAtivo_(
          found.data[
            COL.USUARIO.STATUS
          ]
        )
      ) {
        return fail_(
          'A conta está inativa.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.USUARIOS
        );

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.NOME + 1
        )
        .setValue(nome);

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.APELIDO + 1
        )
        .setValue(apelido);

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.CELULAR + 1
        )
        .setValue(celular);

      if (idioma) {
        sheet
          .getRange(
            found.rowIndex,
            COL.USUARIO.IDIOMA + 1
          )
          .setValue(idioma);
      }

      const atualizado =
        found.data.slice();

      atualizado[
        COL.USUARIO.NOME
      ] = nome;

      atualizado[
        COL.USUARIO.APELIDO
      ] = apelido;

      atualizado[
        COL.USUARIO.CELULAR
      ] = celular;

      if (idioma) {
        atualizado[
          COL.USUARIO.IDIOMA
        ] = idioma;
      }

      return ok_(
        'Perfil atualizado com sucesso.',
        {
          user:
            mapUserPublic_(
              atualizado
            )
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function updateUserLanguage(
  email,
  idioma
) {
  try {
    setupDatabase();

    const emailNorm =
      normalizeEmail_(email);

    const lang =
      String(idioma || '')
        .trim()
        .toLowerCase();

    if (!emailNorm) {
      return fail_(
        'E-mail do utilizador em falta.'
      );
    }

    const suportados = [
      'pt',
      'en',
      'fr',
      'es'
    ];

    if (
      suportados.indexOf(lang) === -1
    ) {
      return fail_(
        'Idioma não suportado.'
      );
    }

    return withLock_(function () {
      const found =
        findUserByEmail_(emailNorm);

      if (!found) {
        return fail_(
          'Utilizador não encontrado.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.USUARIOS
        );

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.IDIOMA + 1
        )
        .setValue(lang);

      return ok_(
        'Idioma atualizado com sucesso.',
        {
          idioma: lang
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ADMINISTRAÇÃO — SEGURANÇA
// ============================================================================

function checkAdminAccess(
  adminEmail
) {
  try {
    setupDatabase();

    const email =
      normalizeEmail_(
        adminEmail
      );

    if (
      !email ||
      !isValidEmail_(email)
    ) {
      return fail_(
        'E-mail de administrador inválido.',
        {
          authorized: false
        }
      );
    }

    const user =
      findUserByEmail_(email);

    if (!user) {
      return fail_(
        'Administrador não encontrado.',
        {
          authorized: false
        }
      );
    }

    const isAdmin =
      String(
        user.data[
          COL.USUARIO.PERFIL
        ] || ''
      ).trim() ===
      PERFIL.ADMIN;

    const isActive =
      isAtivo_(
        user.data[
          COL.USUARIO.STATUS
        ]
      );

    if (!isAdmin || !isActive) {
      return fail_(
        'Acesso administrativo não autorizado.',
        {
          authorized: false
        }
      );
    }

    return ok_(
      'Acesso administrativo autorizado.',
      {
        authorized: true,
        user:
          mapUserPublic_(
            user.data
          )
      }
    );
  } catch (error) {
    return fail_(
      error.message,
      {
        authorized: false
      }
    );
  }
}

function requireAdmin_(
  adminEmail
) {
  const email =
    normalizeEmail_(
      adminEmail
    );

  if (
    !email ||
    !isValidEmail_(email)
  ) {
    throw new Error(
      'Acesso administrativo não autorizado.'
    );
  }

  const user =
    findUserByEmail_(email);

  if (!user) {
    throw new Error(
      'Acesso administrativo não autorizado.'
    );
  }

  const perfil =
    String(
      user.data[
        COL.USUARIO.PERFIL
      ] || ''
    ).trim();

  const status =
    String(
      user.data[
        COL.USUARIO.STATUS
      ] || ''
    ).trim();

  if (
    perfil !== PERFIL.ADMIN ||
    status !== STATUS.ATIVO
  ) {
    throw new Error(
      'Acesso administrativo não autorizado.'
    );
  }

  return user;
}

// ============================================================================
// ADMIN — UTILIZADORES
// ============================================================================

function getAllUsersAdmin(
  adminEmail
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const rows =
      getDataRows_(
        getSheet_(
          SHEETS.USUARIOS
        )
      );

    const users =
      rows.map(function (row) {
        return {
          id: String(
            row[COL.USUARIO.ID] || ''
          ).trim(),

          nome: String(
            row[COL.USUARIO.NOME] || ''
          ).trim(),

          apelido: String(
            row[COL.USUARIO.APELIDO] || ''
          ).trim(),

          celular: String(
            row[COL.USUARIO.CELULAR] || ''
          ).trim(),

          email:
            normalizeEmail_(
              row[
                COL.USUARIO.EMAIL
              ]
            ),

          perfil: String(
            row[COL.USUARIO.PERFIL] || ''
          ).trim(),

          status: String(
            row[COL.USUARIO.STATUS] || ''
          ).trim(),

          dataCriacao:
            formatCellDateTime_(
              row[
                COL.USUARIO.DATA_CRIACAO
              ]
            ),

          idioma: String(
            row[COL.USUARIO.IDIOMA] || 'pt'
          ).trim()
        };
      });
    return ok_(
      'Utilizadores carregados.',
      {
        users: users,
        utilizadores: users
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

function createUserByAdmin(
  adminEmail,
  payload
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      payload || {};

    const nome =
      String(
        data.nome ||
        data.Nome ||
        ''
      ).trim();

    const apelido =
      String(
        data.apelido ||
        data.Apelido ||
        ''
      ).trim();

    const celular =
      String(
        data.celular ||
        data.Celular ||
        ''
      ).trim();

    const email =
      normalizeEmail_(
        data.email ||
        data.Email
      );

    const senha =
      String(
        data.senha ||
        data.Senha ||
        ''
      );

    const perfil =
      String(
        data.perfil ||
        data.Perfil ||
        PERFIL.USER
      ).trim();

    const status =
      String(
        data.status ||
        data.Status ||
        STATUS.ATIVO
      ).trim();

    if (
      !nome ||
      !apelido ||
      !celular ||
      !email ||
      !senha
    ) {
      return fail_(
        'Preencha todos os campos obrigatórios.'
      );
    }

    if (!isValidEmail_(email)) {
      return fail_(
        'E-mail inválido.'
      );
    }

    if (senha.length < 6) {
      return fail_(
        'A senha deve ter pelo menos 6 caracteres.'
      );
    }

    return withLock_(function () {
      if (findUserByEmail_(email)) {
        return fail_(
          'E-mail já registado.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.USUARIOS
        );

      const id =
        nextId_(sheet);

      const senhaHash =
        createPasswordHash_(senha);

      sheet.appendRow([
        id,
        nome,
        apelido,
        celular,
        email,
        senhaHash,
        perfil,
        status,
        formatDateTime_(now_()),
        'pt'
      ]);

      return ok_(
        'Utilizador criado com sucesso.',
        {
          user: {
            id: String(id),
            nome: nome,
            apelido: apelido,
            celular: celular,
            email: email,
            perfil: perfil,
            status: status,
            idioma: 'pt'
          }
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function updateUserByAdmin(
  adminEmail,
  payload
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      payload || {};

    const userId =
      String(
        data.id ||
        data.ID ||
        data.userId ||
        data.userID ||
        ''
      ).trim();

    const nome =
      String(
        data.nome ||
        data.Nome ||
        ''
      ).trim();

    const apelido =
      String(
        data.apelido ||
        data.Apelido ||
        ''
      ).trim();

    const celular =
      String(
        data.celular ||
        data.Celular ||
        ''
      ).trim();

    const perfil =
      String(
        data.perfil ||
        data.Perfil ||
        ''
      ).trim();

    const status =
      String(
        data.status ||
        data.Status ||
        ''
      ).trim();

    if (!userId) {
      return fail_(
        'ID do utilizador é obrigatório.'
      );
    }

    if (
      !nome ||
      !apelido ||
      !celular
    ) {
      return fail_(
        'Nome, apelido e celular são obrigatórios.'
      );
    }

    if (
      perfil !== PERFIL.ADMIN &&
      perfil !== PERFIL.USER
    ) {
      return fail_(
        'Perfil inválido.'
      );
    }

    if (
      status !== STATUS.ATIVO &&
      status !== STATUS.INATIVO
    ) {
      return fail_(
        'Status inválido.'
      );
    }

    return withLock_(function () {
      const found =
        findUserById_(userId);

      if (!found) {
        return fail_(
          'Utilizador não encontrado.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.USUARIOS
        );

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.NOME + 1
        )
        .setValue(nome);

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.APELIDO + 1
        )
        .setValue(apelido);

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.CELULAR + 1
        )
        .setValue(celular);

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.PERFIL + 1
        )
        .setValue(perfil);

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.STATUS + 1
        )
        .setValue(status);

      const atualizado =
        found.data.slice();

      atualizado[
        COL.USUARIO.NOME
      ] = nome;

      atualizado[
        COL.USUARIO.APELIDO
      ] = apelido;

      atualizado[
        COL.USUARIO.CELULAR
      ] = celular;

      atualizado[
        COL.USUARIO.PERFIL
      ] = perfil;

      atualizado[
        COL.USUARIO.STATUS
      ] = status;

      return ok_(
        'Utilizador atualizado com sucesso.',
        {
          user:
            mapUserPublic_(
              atualizado
            )
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function deleteUserByAdmin(
  adminEmail,
  userId
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const targetId =
      String(userId || '').trim();

    if (!targetId) {
      return fail_(
        'ID do utilizador é obrigatório.'
      );
    }

    return withLock_(function () {
      const found =
        findUserById_(targetId);

      if (!found) {
        return fail_(
          'Utilizador não encontrado.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.USUARIOS
        );

      sheet.deleteRow(
        found.rowIndex
      );

      return ok_(
        'Utilizador eliminado com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function toggleUserStatusAdmin(
  adminEmail,
  userId,
  newStatus
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const status =
      String(
        newStatus || ''
      ).trim();

    if (
      status !== STATUS.ATIVO &&
      status !== STATUS.INATIVO
    ) {
      return fail_(
        'Status inválido. Utilize Ativo ou Inativo.'
      );
    }

    return withLock_(function () {
      const found =
        findUserById_(userId);

      if (!found) {
        return fail_(
          'Utilizador não encontrado.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.USUARIOS
        );

      sheet
        .getRange(
          found.rowIndex,
          COL.USUARIO.STATUS + 1
        )
        .setValue(status);

      return ok_(
        status === STATUS.ATIVO
          ? 'Utilizador ativado com sucesso.'
          : 'Utilizador desativado com sucesso.',
        {
          user:
            mapUserPublic_(
              (function () {
                const row =
                  found.data.slice();

                row[
                  COL.USUARIO.STATUS
                ] = status;

                return row;
              })()
            )
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ADMIN — LOCAIS
// ============================================================================

function createLocalAdmin(
  adminEmail,
  localData
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      localData || {};

    const nome =
      String(
        data.nome ||
        data.Nome ||
        data.NomeLocal ||
        ''
      ).trim();

    const tipo =
      String(
        data.tipo ||
        data.Tipo ||
        ''
      ).trim();

    if (!nome) {
      return fail_(
        'Nome do local é obrigatório.'
      );
    }

    if (
      tipo !== 'Fixo' &&
      tipo !== 'Móvel'
    ) {
      return fail_(
        'Tipo de local inválido. Utilize Fixo ou Móvel.'
      );
    }

    return withLock_(function () {
      const sheet =
        getSheet_(
          SHEETS.LOCAIS
        );

      const rows =
        getDataRows_(sheet);

      const duplicado =
        rows.some(function (row) {
          return (
            String(
              row[COL.LOCAL.NOME] || ''
            )
              .trim()
              .toLowerCase() ===
            nome.toLowerCase() &&
            isAtivo_(
              row[
                COL.LOCAL.STATUS
              ]
            )
          );
        });

      if (duplicado) {
        return fail_(
          'Já existe um local ativo com este nome.'
        );
      }

      const id =
        nextId_(sheet);

      sheet.appendRow([
        id,
        nome,
        tipo,
        STATUS.ATIVO
      ]);

      return ok_(
        'Local criado com sucesso.',
        {
          local: {
            id: String(id),
            nome: nome,
            tipo: tipo,
            status: STATUS.ATIVO
          }
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function updateLocalAdmin(
  adminEmail,
  localData
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      localData || {};

    const localId =
      String(
        data.id ||
        data.ID ||
        ''
      ).trim();

    const nome =
      String(
        data.nome ||
        data.Nome ||
        data.NomeLocal ||
        ''
      ).trim();

    const tipo =
      String(
        data.tipo ||
        data.Tipo ||
        ''
      ).trim();

    const status =
      String(
        data.status ||
        data.Status ||
        ''
      ).trim();

    if (!localId) {
      return fail_(
        'ID do local é obrigatório.'
      );
    }

    if (!nome) {
      return fail_(
        'Nome do local é obrigatório.'
      );
    }

    if (
      tipo !== 'Fixo' &&
      tipo !== 'Móvel'
    ) {
      return fail_(
        'Tipo de local inválido.'
      );
    }

    return withLock_(function () {
      const found =
        findLocalById_(localId);

      if (!found) {
        return fail_(
          'Local não encontrado.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.LOCAIS
        );

      sheet
        .getRange(
          found.rowIndex,
          COL.LOCAL.NOME + 1
        )
        .setValue(nome);

      sheet
        .getRange(
          found.rowIndex,
          COL.LOCAL.TIPO + 1
        )
        .setValue(tipo);

      sheet
        .getRange(
          found.rowIndex,
          COL.LOCAL.STATUS + 1
        )
        .setValue(status || STATUS.ATIVO);

      return ok_(
        'Local atualizado com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function deleteLocalAdmin(
  adminEmail,
  localId
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const targetId =
      String(localId || '').trim();

    if (!targetId) {
      return fail_(
        'ID do local é obrigatório.'
      );
    }

    return withLock_(function () {
      const found =
        findLocalById_(targetId);

      if (!found) {
        return fail_(
          'Local não encontrado.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.LOCAIS
        );

      sheet.deleteRow(
        found.rowIndex
      );

      return ok_(
        'Local eliminado com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ADMIN — TURNOS
// ============================================================================

function createTurnoAdmin(
  adminEmail,
  turnoData
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      turnoData || {};

    const localId =
      String(
        data.localId ||
        data.LocalID ||
        data.local ||
        ''
      ).trim();

    const dataTurno =
      String(
        data.data ||
        data.Data ||
        ''
      ).trim();

    const horaInicio =
      String(
        data.horaInicio ||
        data.HoraInicio ||
        data.inicio ||
        ''
      ).trim();

    const horaFim =
      String(
        data.horaFim ||
        data.HoraFim ||
        data.fim ||
        ''
      ).trim();

    const vagas =
      Number(
        data.vagas ||
        data.Vagas
      );

    if (!localId) {
      return fail_(
        'Local é obrigatório.'
      );
    }

    if (!dataTurno) {
      return fail_(
        'Data do turno é obrigatória.'
      );
    }

    if (!horaInicio) {
      return fail_(
        'Hora de início é obrigatória.'
      );
    }

    if (!horaFim) {
      return fail_(
        'Hora de fim é obrigatória.'
      );
    }

    if (
      !Number.isInteger(vagas) ||
      vagas <= 0
    ) {
      return fail_(
        'O número de vagas deve ser um número inteiro maior que zero.'
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dataTurno
      )
    ) {
      return fail_(
        'Data do turno inválida.'
      );
    }

    if (
      !/^\d{2}:\d{2}$/.test(
        horaInicio
      ) ||
      !/^\d{2}:\d{2}$/.test(
        horaFim
      )
    ) {
      return fail_(
        'Formato de hora inválido.'
      );
    }

    if (
      horaInicio >= horaFim
    ) {
      return fail_(
        'A hora de início deve ser anterior à hora de fim.'
      );
    }

    return withLock_(function () {
      const local =
        findLocalById_(localId);

      if (!local) {
        return fail_(
          'Local não encontrado.'
        );
      }

      if (
        !isAtivo_(
          local.data[
            COL.LOCAL.STATUS
          ]
        )
      ) {
        return fail_(
          'O local selecionado está inativo.'
        );
      }

      const sheet =
        getSheet_(
          SHEETS.TURNOS
        );

      const rows =
        getDataRows_(sheet);

      const duplicado =
        rows.some(function (row) {
          return (
            idsMatch_(
              row[
                COL.TURNO.LOCAL_ID
              ],
              localId
            ) &&

            formatCellDate_(
              row[
                COL.TURNO.DATA
              ]
            ) === dataTurno &&

            formatCellTime_(
              row[
                COL.TURNO.HORA_INICIO
              ]
            ) === horaInicio &&

            formatCellTime_(
              row[
                COL.TURNO.HORA_FIM
              ]
            ) === horaFim &&

            isAtivo_(
              row[
                COL.TURNO.STATUS
              ]
            )
          );
        });

      if (duplicado) {
        return fail_(
          'Já existe um turno ativo com os mesmos dados.'
        );
      }

      const id =
        nextId_(sheet);

      sheet.appendRow([
        id,
        localId,
        dataTurno,
        horaInicio,
        horaFim,
        vagas,
        STATUS.ATIVO
      ]);

      return ok_(
        'Turno criado com sucesso.',
        {
          turno: {
            id: String(id),
            localId: localId,
            data: dataTurno,
            horaInicio: horaInicio,
            horaFim: horaFim,
            vagas: vagas,
            status: STATUS.ATIVO
          }
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function updateTurnoAdmin(
  adminEmail,
  turnoData
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      turnoData || {};

    const turnoId =
      String(
        data.id ||
        data.ID ||
        ''
      ).trim();

    const localId =
      String(
        data.localId ||
        data.LocalID ||
        ''
      ).trim();

    const dataTurno =
      String(
        data.data ||
        data.Data ||
        ''
      ).trim();

    const horaInicio =
      String(
        data.horaInicio ||
        data.HoraInicio ||
        ''
      ).trim();

    const horaFim =
      String(
        data.horaFim ||
        data.HoraFim ||
        ''
      ).trim();

    const vagas =
      Number(
        data.vagas ||
        data.Vagas
      );

    const status =
      String(
        data.status ||
        data.Status ||
        ''
      ).trim();

    if (!turnoId) {
      return fail_(
        'ID do turno é obrigatório.'
      );
    }

    return withLock_(function () {
      const sheet =
        getSheet_(
          SHEETS.TURNOS
        );

      const rows =
        getDataRows_(sheet);

      let foundIndex = -1;

      for (
        let i = 0;
        i < rows.length;
        i++
      ) {
        if (
          idsMatch_(
            rows[i][
              COL.TURNO.ID
            ],
            turnoId
          )
        ) {
          foundIndex = i + 2;
          break;
        }
      }

      if (foundIndex === -1) {
        return fail_(
          'Turno não encontrado.'
        );
      }

      if (localId) {
        sheet
          .getRange(
            foundIndex,
            COL.TURNO.LOCAL_ID + 1
          )
          .setValue(localId);
      }

      if (dataTurno) {
        sheet
          .getRange(
            foundIndex,
            COL.TURNO.DATA + 1
          )
          .setValue(dataTurno);
      }

      if (horaInicio) {
        sheet
          .getRange(
            foundIndex,
            COL.TURNO.HORA_INICIO + 1
          )
          .setValue(horaInicio);
      }

      if (horaFim) {
        sheet
          .getRange(
            foundIndex,
            COL.TURNO.HORA_FIM + 1
          )
          .setValue(horaFim);
      }

      if (!isNaN(vagas)) {
        sheet
          .getRange(
            foundIndex,
            COL.TURNO.VAGAS + 1
          )
          .setValue(vagas);
      }

      if (status) {
        sheet
          .getRange(
            foundIndex,
            COL.TURNO.STATUS + 1
          )
          .setValue(status);
      }

      return ok_(
        'Turno atualizado com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function deleteTurnoAdmin(
  adminEmail,
  turnoId
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const targetId =
      String(turnoId || '').trim();

    if (!targetId) {
      return fail_(
        'ID do turno é obrigatório.'
      );
    }

    return withLock_(function () {
      const sheet =
        getSheet_(
          SHEETS.TURNOS
        );

      const rows =
        getDataRows_(sheet);

      let foundIndex = -1;

      for (
        let i = 0;
        i < rows.length;
        i++
      ) {
        if (
          idsMatch_(
            rows[i][
              COL.TURNO.ID
            ],
            targetId
          )
        ) {
          foundIndex = i + 2;
          break;
        }
      }

      if (foundIndex === -1) {
        return fail_(
          'Turno não encontrado.'
        );
      }

      sheet.deleteRow(
        foundIndex
      );

      return ok_(
        'Turno eliminado com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function findLocalById_(
  localId
) {
  const sheet =
    getSheet_(
      SHEETS.LOCAIS
    );

  const rows =
    getDataRows_(sheet);

  const target =
    String(
      localId || ''
    ).trim();

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {
    if (
      idsMatch_(
        rows[i][
          COL.LOCAL.ID
        ],
        target
      )
    ) {
      return {
        rowIndex: i + 2,
        data: rows[i]
      };
    }
  }

  return null;
}

// ============================================================================
// ADMIN — FORMULÁRIOS / LINKS
// ============================================================================

function getAllLinksAdmin(
  adminEmail
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const rows =
      getDataRows_(
        getSheet_(
          SHEETS.LINKS
        )
      );

    const links =
      rows.map(function (row) {
        return {
          id: String(
            row[COL.LINK.ID] || ''
          ).trim(),

          tipo: String(
            row[COL.LINK.TIPO] || ''
          ).trim(),

          mes: String(
            row[COL.LINK.MES] || ''
          ).trim(),

          url: String(
            row[COL.LINK.URL] || ''
          ).trim()
        };
      });

    return ok_(
      'Links de formulários carregados.',
      {
        links: links
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

function createLinkAdmin(
  adminEmail,
  linkData
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      linkData || {};

    const tipo =
      String(
        data.tipo ||
        data.Tipo ||
        ''
      ).trim();

    const mes =
      String(
        data.mes ||
        data.Mes ||
        ''
      ).trim();

    const url =
      String(
        data.url ||
        data.URL ||
        ''
      ).trim();

    if (!tipo || !url) {
      return fail_(
        'Tipo e URL são obrigatórios.'
      );
    }

    return withLock_(function () {
      const sheet =
        getSheet_(
          SHEETS.LINKS
        );

      const id =
        nextId_(sheet);

      sheet.appendRow([
        id,
        tipo,
        mes,
        url
      ]);

      return ok_(
        'Link de formulário criado com sucesso.',
        {
          link: {
            id: String(id),
            tipo: tipo,
            mes: mes,
            url: url
          }
        }
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function updateLinkAdmin(
  adminEmail,
  linkData
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      linkData || {};

    const linkId =
      String(
        data.id ||
        data.ID ||
        ''
      ).trim();

    const tipo =
      String(
        data.tipo ||
        data.Tipo ||
        ''
      ).trim();

    const mes =
      String(
        data.mes ||
        data.Mes ||
        ''
      ).trim();

    const url =
      String(
        data.url ||
        data.URL ||
        ''
      ).trim();

    if (!linkId) {
      return fail_(
        'ID do link é obrigatório.'
      );
    }

    return withLock_(function () {
      const sheet =
        getSheet_(
          SHEETS.LINKS
        );

      const rows =
        getDataRows_(sheet);

      let foundIndex = -1;

      for (
        let i = 0;
        i < rows.length;
        i++
      ) {
        if (
          idsMatch_(
            rows[i][
              COL.LINK.ID
            ],
            linkId
          )
        ) {
          foundIndex = i + 2;
          break;
        }
      }

      if (foundIndex === -1) {
        return fail_(
          'Link não encontrado.'
        );
      }

      sheet
        .getRange(
          foundIndex,
          COL.LINK.TIPO + 1
        )
        .setValue(tipo);

      sheet
        .getRange(
          foundIndex,
          COL.LINK.MES + 1
        )
        .setValue(mes);

      sheet
        .getRange(
          foundIndex,
          COL.LINK.URL + 1
        )
        .setValue(url);

      return ok_(
        'Link de formulário atualizado com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function deleteLinkAdmin(
  adminEmail,
  linkId
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const targetId =
      String(linkId || '').trim();

    if (!targetId) {
      return fail_(
        'ID do link é obrigatório.'
      );
    }

    return withLock_(function () {
      const sheet =
        getSheet_(
          SHEETS.LINKS
        );

      const rows =
        getDataRows_(sheet);

      let foundIndex = -1;

      for (
        let i = 0;
        i < rows.length;
        i++
      ) {
        if (
          idsMatch_(
            rows[i][
              COL.LINK.ID
            ],
            targetId
          )
        ) {
          foundIndex = i + 2;
          break;
        }
      }

      if (foundIndex === -1) {
        return fail_(
          'Link não encontrado.'
        );
      }

      sheet.deleteRow(
        foundIndex
      );

      return ok_(
        'Link de formulário eliminado com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ADMIN — INSCRIÇÕES
// ============================================================================

function getAllInscricoesAdmin(
  adminEmail
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const rows =
      getDataRows_(
        getSheet_(
          SHEETS.INSCRICOES
        )
      );

    const turnosRows =
      getDataRows_(
        getSheet_(
          SHEETS.TURNOS
        )
      );

    const locaisRows =
      getDataRows_(
        getSheet_(
          SHEETS.LOCAIS
        )
      );

    const locaisMap = {};
    locaisRows.forEach(function (r) {
      locaisMap[String(r[COL.LOCAL.ID]).trim()] = String(r[COL.LOCAL.NOME] || '').trim();
    });

    const turnosMap = {};
    turnosRows.forEach(function (r) {
      const id = String(r[COL.TURNO.ID]).trim();
      const locId = String(r[COL.TURNO.LOCAL_ID]).trim();
      turnosMap[id] = {
        localNome: locaisMap[locId] || '',
        data: formatCellDate_(r[COL.TURNO.DATA]),
        horaInicio: formatCellTime_(r[COL.TURNO.HORA_INICIO]),
        horaFim: formatCellTime_(r[COL.TURNO.HORA_FIM])
      };
    });

    const inscricoes =
      rows.map(function (row) {
        const turnoId = String(row[COL.INSCRICAO.TURNO_ID] || '').trim();
        const tInfo = turnosMap[turnoId] || {};

        return {
          id: String(
            row[COL.INSCRICAO.ID] || ''
          ).trim(),

          turnoId: turnoId,

          email: normalizeEmail_(
            row[COL.INSCRICAO.EMAIL]
          ),

          nome: String(
            row[COL.INSCRICAO.NOME] || ''
          ).trim(),

          apelido: String(
            row[COL.INSCRICAO.APELIDO] || ''
          ).trim(),

          celular: String(
            row[COL.INSCRICAO.CELULAR] || ''
          ).trim(),

          dataInscricao: formatCellDateTime_(
            row[COL.INSCRICAO.DATA]
          ),

          status: String(
            row[COL.INSCRICAO.STATUS] || ''
          ).trim(),

          turnoLocal: tInfo.localNome || '',
          turnoData: tInfo.data || '',
          turnoHorario: (tInfo.horaInicio && tInfo.horaFim) ? (tInfo.horaInicio + ' - ' + tInfo.horaFim) : ''
        };
      });

    return ok_(
      'Inscrições carregadas.',
      {
        inscricoes: inscricoes
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

function updateInscricaoAdmin(
  adminEmail,
  payload
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const data =
      payload || {};

    const inscricaoId =
      String(
        data.id ||
        data.ID ||
        ''
      ).trim();

    const novoTurnoId =
      String(
        data.turnoId ||
        data.TurnoID ||
        ''
      ).trim();

    const novoStatus =
      String(
        data.status ||
        data.Status ||
        ''
      ).trim();

    if (!inscricaoId) {
      return fail_(
        'ID da inscrição é obrigatório.'
      );
    }

    return withLock_(function () {
      const sheet =
        getSheet_(
          SHEETS.INSCRICOES
        );

      const rows =
        getDataRows_(sheet);

      let foundIndex = -1;

      for (
        let i = 0;
        i < rows.length;
        i++
      ) {
        if (
          idsMatch_(
            rows[i][
              COL.INSCRICAO.ID
            ],
            inscricaoId
          )
        ) {
          foundIndex = i + 2;
          break;
        }
      }

      if (foundIndex === -1) {
        return fail_(
          'Inscrição não encontrada.'
        );
      }

      if (novoTurnoId) {
        sheet
          .getRange(
            foundIndex,
            COL.INSCRICAO.TURNO_ID + 1
          )
          .setValue(novoTurnoId);
      }

      if (novoStatus) {
        sheet
          .getRange(
            foundIndex,
            COL.INSCRICAO.STATUS + 1
          )
          .setValue(novoStatus);
      }

      return ok_(
        'Inscrição atualizada com sucesso.'
      );
    });
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ADMIN — RELATÓRIOS
// ============================================================================

function getConsolidatedReport(
  adminEmail
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const usersRows =
      getDataRows_(
        getSheet_(
          SHEETS.USUARIOS
        )
      );

    const turnosRows =
      getDataRows_(
        getSheet_(
          SHEETS.TURNOS
        )
      );

    const inscricoesRows =
      getDataRows_(
        getSheet_(
          SHEETS.INSCRICOES
        )
      );

    const logsRows =
      getDataRows_(
        getSheet_(
          SHEETS.LOGS
        )
      );

    const linksRows =
      getDataRows_(
        getSheet_(
          SHEETS.LINKS
        )
      );

    const totalUsuarios = usersRows.length;
    const usuariosAtivos = usersRows.filter(function (r) {
      return isAtivo_(r[COL.USUARIO.STATUS]);
    }).length;

    const totalTurnos = turnosRows.length;
    const totalVagas = turnosRows.reduce(function (acc, r) {
      return acc + (Number(r[COL.TURNO.VAGAS]) || 0);
    }, 0);

    const totalInscricoes = inscricoesRows.length;
    const inscricoesAtivas = inscricoesRows.filter(function (r) {
      return isAtivo_(r[COL.INSCRICAO.STATUS]);
    }).length;

    const totalAcessos = logsRows.length;
    const acessosSucesso = logsRows.filter(function (r) {
      return String(r[COL.LOG.STATUS_ACESSO]).trim() === ACESSO.SUCESSO;
    }).length;

    const totalLinks = linksRows.length;

    return ok_(
      'Relatório consolidado gerado com sucesso.',
      {
        relatorio: {
          usuarios: {
            total: totalUsuarios,
            ativos: usuariosAtivos
          },
          turnos: {
            total: totalTurnos,
            vagasTotais: totalVagas
          },
          inscricoes: {
            total: totalInscricoes,
            ativas: inscricoesAtivas
          },
          acessos: {
            total: totalAcessos,
            sucesso: acessosSucesso,
            falha: totalAcessos - acessosSucesso
          },
          formularios: {
            totalLinks: totalLinks
          }
        }
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ADMIN — LOGS
// ============================================================================

function getAcessoLogs(
  adminEmail
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const rows =
      getDataRows_(
        getSheet_(
          SHEETS.LOGS
        )
      );

    const logs =
      rows
        .map(function (row) {
          return {
            id: String(
              row[COL.LOG.ID] || ''
            ).trim(),

            email:
              normalizeEmail_(
                row[
                  COL.LOG.EMAIL
                ]
              ),

            dataHora:
              formatCellDateTime_(
                row[
                  COL.LOG.DATA_HORA
                ]
              ),

            status:
              String(
                row[
                  COL.LOG.STATUS_ACESSO
                ] || ''
              ).trim(),

            statusAcesso:
              String(
                row[
                  COL.LOG.STATUS_ACESSO
                ] || ''
              ).trim(),

            acao: 'Acesso'
          };
        })
        .reverse();

    return ok_(
      'Logs carregados.',
      {
        logs: logs
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ADMIN — CONSULTAR LOCAIS E TURNOS
// ============================================================================

function getAllLocaisAdmin(
  adminEmail
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const rows =
      getDataRows_(
        getSheet_(
          SHEETS.LOCAIS
        )
      );

    const locais =
      rows.map(function (row) {
        return {
          id: String(
            row[COL.LOCAL.ID] || ''
          ).trim(),

          nome: String(
            row[COL.LOCAL.NOME] || ''
          ).trim(),

          tipo: String(
            row[COL.LOCAL.TIPO] || ''
          ).trim(),

          status: String(
            row[COL.LOCAL.STATUS] || ''
          ).trim()
        };
      });

    return ok_(
      'Locais carregados.',
      {
        locais: locais
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

function getAllTurnosAdmin(
  adminEmail
) {
  try {
    setupDatabase();

    requireAdmin_(
      adminEmail
    );

    const locais =
      getDataRows_(
        getSheet_(
          SHEETS.LOCAIS
        )
      );

    const localMap = {};

    locais.forEach(function (row) {
      localMap[
        String(
          row[COL.LOCAL.ID]
        ).trim()
      ] =
        String(
          row[COL.LOCAL.NOME] || ''
        ).trim();
    });

    const rows =
      getDataRows_(
        getSheet_(
          SHEETS.TURNOS
        )
      );

    const turnos =
      rows.map(function (row) {
        const localId =
          String(
            row[
              COL.TURNO.LOCAL_ID
            ] || ''
          ).trim();

        return {
          id: String(
            row[
              COL.TURNO.ID
            ] || ''
          ).trim(),

          localId: localId,

          localNome:
            localMap[localId] || '',

          data:
            formatCellDate_(
              row[
                COL.TURNO.DATA
              ]
            ),

          horaInicio:
            formatCellTime_(
              row[
                COL.TURNO.HORA_INICIO
              ]
            ),

          horaFim:
            formatCellTime_(
              row[
                COL.TURNO.HORA_FIM
              ]
            ),

          vagas:
            Number(
              row[
                COL.TURNO.VAGAS
              ]
            ) || 0,

          status:
            String(
              row[
                COL.TURNO.STATUS
              ] || ''
            ).trim()
        };
      });

    return ok_(
      'Turnos carregados.',
      {
        turnos: turnos
      }
    );
  } catch (error) {
    return fail_(error.message);
  }
}

// ============================================================================
// ALIASES DE COMPATIBILIDADE
// ============================================================================

function getUsersAdmin(
  adminEmail
) {
  return getAllUsersAdmin(
    adminEmail
  );
}

function getLogsAdmin(
  adminEmail
) {
  return getAcessoLogs(
    adminEmail
  );
}

function getLocaisAdmin(
  adminEmail
) {
  return getAllLocaisAdmin(
    adminEmail
  );
}

function getTurnosAdmin(
  adminEmail
) {
  return getAllTurnosAdmin(
    adminEmail
  );
}