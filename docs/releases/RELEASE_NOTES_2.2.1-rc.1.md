# VendaJá Angola 2.2.1-rc.1

## Objetivo

Release candidate destinada exclusivamente a um piloto operacional
experimental, sem lançamento público.

## Incluído

- Aplicação desktop Electron empacotada em NSIS.
- Backend compilado e Prisma Client necessários ao runtime local opcional.
- PWA/offline temporário com sincronização idempotente.
- Contexto de empresa, filial, armazém, caixa, utilizador e dispositivo.
- Validação local da chave pública de licenciamento.
- Procedimentos de backup, restauro, atualização, rollback e diagnóstico.
- Configuração inicial do backend central por administrador, com teste de
  `/health`, persistência local segura de URL/terminal e recuperação após
  reconexão.

## Verificações obrigatórias

Executar `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build:web`, `npm run desktop:installer:offline` e
`npm run release:verify`. A release só pode ser entregue após CI real aprovada,
migrations, backup/restauro, E2E crítico e smoke de produção aprovados.

## Limitações conhecidas

- Sem homologação AGT/SAF-T declarada.
- Sem integração bancária ou TPA real validada.
- Impressoras e outros periféricos exigem testes no equipamento do piloto.
- O instalador não assinado pode apresentar aviso SmartScreen.
- Tokens continuam sujeitos às limitações documentadas em `OPERATIONS.md`.
