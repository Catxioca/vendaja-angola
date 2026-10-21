# Fase 2 — Governança e Segurança Corporativa

## 1. Objetivo
Implementar um sistema corporativo de segurança em profundidade, controlo de acessos baseado em funções (RBAC), autenticação multifator (MFA/TOTP), gestão rigorosa de sessões e trilhas de auditoria forense imutáveis para conformidade com normas empresariais e com a Agência de Proteção de Dados (APD) de Angola.

## 2. Funcionalidades Implementadas
- **RBAC Granular (79 Permissões Especializadas)**:
  - Separação completa de deveres (SoD - Segregation of Duties) cobrindo Vendas, POS, Tesouraria, Contabilidade, RH, Stock, Compras, CRM, BI e Administração.
  - Hierarquia de papéis pré-configurados: Administrador, Diretor Financeiro, Contabilista, Operador de Caixa, Gestor de Armazém e Comercial.
- **Autenticação Multifator (MFA/2FA)**:
  - Suporte ao padrão RFC 6238 TOTP (Google Authenticator, Microsoft Authenticator).
  - Códigos de recuperação de uso único (backup recovery codes) armazenados com hash irreversível.
- **Auditoria Forense Imutável (`EnterpriseAuditService`)**:
  - Registo sistemático de todas as operações sensíveis (criação, edição, anulação, logins e acessos).
  - Captura automática de IP, User-Agent, Tenant ID, User ID, carimbo temporal ISO-8601 e estado anterior vs. novo (`oldValue` / `newValue`).
  - Resiliência com buffer em memória quando a base de dados principal estiver temporariamente inacessível.
- **Políticas de Palavra-Passe e Bloqueio de Brute Force**:
  - Bloqueio progressivo de IP e utilizador após 5 tentativas falhadas numa janela de 15 minutos.
  - Requisitos de entropia: comprimento mínimo, maiúsculas, minúsculas, números e caracteres especiais.

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Testado com 100% de sucesso nos testes unitários e de integração (`src/services/security-governance.spec.ts`).

## 4. Problemas Conhecidos
- Perda de histórico de tentativas de força bruta se a aplicação reiniciar antes do flush de memória (mitigado por persistência periódica assíncrona).

## 5. Melhorias Pendentes
- Integração de Single Sign-On (SSO) corporativo com provedores SAML 2.0 e Azure Active Directory / Entra ID.
- Assinatura digital criptográfica dos próprios registos de log de auditoria via blockchain ou cadeia de hashes Merkle.
