# Operação e lançamento

## Instalação

1. Instale Node.js 20+, PostgreSQL 16+ e as ferramentas `pg_dump`/`pg_restore`.
2. Execute `npm ci`, copie `.env.example` para `.env` e preencha segredos aleatórios.
3. Em produção, defina `NODE_ENV=production`, `CORS_ORIGIN` explícito e `TRUST_PROXY` apenas quando existir um proxy confiável.
4. Execute `npm run db:generate` e `npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma`.
5. Execute `npm run typecheck`, `npm test`, `npm run build:web` e `npm run build:desktop`.

## Backup, restauro e retenção

`npm run db:backup` cria um dump customizado. Defina `BACKUP_PATH` para uma
localização fora do repositório e armazene-o cifrado, com retenção mínima
recomendada de  daily/weekly/monthly: 7/12/12 cópias. Teste o restauro
mensalmente numa base descartável:

```powershell
$env:BACKUP_PATH="C:\secure-backups\vendaja.dump"
$env:ALLOW_DESTRUCTIVE_RESTORE="true"
npm run db:restore
```

Nunca restaure sobre produção sem uma janela aprovada, snapshot anterior e
verificação do hash do dump. O restauro deve ser seguido por `prisma migrate
deploy` e uma verificação de saúde.

## Observabilidade e resposta a incidentes

`/health` e `/api/health` verificam a ligação PostgreSQL. `/metrics` expõe
contadores JSON para o coletor interno; logs são JSON com `correlationId`,
rota, estado e duração. Alertar para health 503, erros HTTP 5xx, bloqueios de
rate limit, falhas de backup e crescimento de latência.

Em incidente: preservar logs e o correlation ID, bloquear credenciais afetadas,
revogar refresh tokens, isolar o tenant afetado, tirar backup antes de corrigir,
executar rollback da aplicação e só depois avaliar rollback de migration. Não
fazer downgrade destrutivo de schema: migrations são forward-only; restaure
backup numa base nova e faça cutover controlado quando necessário.

## Atualização e rollback

1. Criar backup e registar o hash.
2. Publicar artefacto imutável identificado pelo commit.
3. Executar migrations aditivas antes de ativar o código.
4. Executar `npm run e2e:smoke` contra o endpoint de staging.
5. Fazer canary numa empresa piloto e monitorizar erros.
6. Em falha, voltar ao artefacto anterior; preservar a migration e corrigir
   forward, salvo procedimento de recuperação validado pelo DBA.

## Checklist de piloto

- Empresa, filiais, utilizadores, permissões e séries confirmados.
- NIF, regras IVA, certificado e requisitos SAF-T/AGT homologados externamente.
- PostgreSQL, backups cifrados, restaure testado e retenção configurada.
- TPA, impressora, leitor, gaveta e rede testados com adaptadores aprovados.
- Fecho de caixa, devolução, reimpressão, offline e sincronização testados.
- Responsável de suporte, janela de incidente e contacto do fornecedor definidos.
- Exportação de dados e procedimento de encerramento da empresa aprovados.
