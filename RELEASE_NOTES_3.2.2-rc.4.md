# Mutshima 3.2.2-rc.4

Release candidate de consolidação e empacotamento local para piloto operacional controlado. Reúne a transição de marca para **Mutshima**, o assistente **Muambuluisha IA**, o Centro Corporativo com Modo DEMO reversível, o módulo de Recursos Humanos Enterprise, a migração local atómica e a garantia total de retrocompatibilidade com instalações existentes.

## Declaração Fiscal Obrigatória

“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”

## Principais Alterações Técnicas

- **Rebranding Integral Controlado**:
  - Transição de marca comercial visível para **Mutshima** em Desktop, Web ERP e Mobile.
  - Assistente inteligente oficializado como **Muambuluisha IA**.
  - Preservação incondicional de identificadores técnicos: `appId` Android (`ao.co.vendaja.erp`), `appId` Electron (`ao.commerce.desktop`), nomes de pacotes `@angola/*`, endpoints REST `/api/v1/*`, storage keys, contratos de sincronização e aliases no SDK (`MutshimaClient = VendaJaClient`, `MutshimaApiError = VendaJaApiError`).

- **Migração Local Atómica e Reversível**:
  - Mecanismo transacional de migração em staging temporário isolado por volume, com validação criptográfica estrita SHA-256 antes da promoção final.
  - Não-sobrescrita de dados existentes e preservação 100% intacta dos diretórios de origem VendaJá.
  - Eliminação de qualquer fallback cego para `localhost:4000`, classificando explicitamente `SERVER_UNCONFIGURED`.
  - Continuidade sem perda de dados para configurações de servidor, licenças DRM, HWID, outbox e cache offline.

- **Centro Corporativo e Recursos Humanos Enterprise**:
  - Modo DEMO reversível com banner visual inequívoco e limpeza restrita ao estado demonstrativo em memória.
  - Governação remuneratória com histórico auditável, snapshots imutáveis de processamento salarial (`PayrollSnapshot`) protegidos por triggers de base de dados e RBAC estrito.
  - Cifragem reforçada de referências biométricas (`biometricRefId`) com keyId e auditoria.

- **Validação de Qualidade e Segurança**:
  - 706/706 testes unitários aprovados em todos os workspaces (Backend: 304, Desktop: 147, Web: 216, Shared: 35, SDK: 4).
  - 76/76 testes de integração PostgreSQL executados contra base real (migrações 1 a 36, isolamento multi-tenant e integridade fiscal).
  - Auditoria de dependências com 0 vulnerabilidades em produção (`npm audit --omit=dev`).
  - Pipeline de CI remoto aprovado com sucesso no GitHub Actions.

- **Empacotamento Desktop Offline**:
  - Geração do instalador NSIS para Windows x64 (`Mutshima-3.2.2-rc.4-win-x64.exe`) via canal offline hermético (`npm run desktop:installer:offline`).
  - Preservação dos instaladores de versões anteriores na pasta `release/` para rastreabilidade de histórico.
  - Exclusão estrita de `.env`, segredos, bases de dados ou chaves privadas do pacote `app.asar`.
