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

A validação automatizada `npm run db:backup:smoke` cria uma base de destino
descartável, faz `pg_dump`, restaura com `pg_restore`, compara um marcador de
integridade e confirma que um ficheiro inexistente falha sem sucesso falso.
A CI executa este teste contra o serviço PostgreSQL efémero; em produção o
mesmo procedimento deve ser executado mensalmente com uma cópia cifrada.

Nunca restaure sobre produção sem uma janela aprovada, snapshot anterior e
verificação do hash do dump. O restauro deve ser seguido por `prisma migrate
deploy` e uma verificação de saúde.

## Observabilidade e resposta a incidentes

`/health` e `/api/health` verificam a ligação PostgreSQL. `/metrics` expõe
`/ready` é o readiness check usado antes de encaminhar tráfego. `/metrics`
expõe contadores JSON para o coletor interno; logs são JSON com `correlationId`,
rota, estado e duração. Alertar para health 503, erros HTTP 5xx, bloqueios de
rate limit, falhas de backup e crescimento de latência.

O consumidor de métricas deve recolher `/metrics` a cada 15--30 segundos e
alertar, no mínimo, para `http_requests_total` 5xx, `rate_limit_blocked_total`,
health/readiness 503 e ausência de backup válido na janela de retenção. O
formato JSON é intencional para o adapter interno; a conversão para Prometheus
ou OpenTelemetry deve ocorrer no gateway, sem expor métricas publicamente.

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

O rollback foi desenhado como rollback de artefacto, não downgrade destrutivo:
o dump da versão anterior é restaurado numa base nova, `prisma migrate deploy`
é executado nessa base e o smoke/readiness é repetido antes do cutover. A CI
valida a parte de upgrade/restauro em PostgreSQL descartável e falha qualquer
restauro de backup inexistente.

`npm run e2e:critical` é executado na CI com dados semeados e valida login,
criação de venda com atualização de stock, contexto multiempresa, abertura e
fecho de caixa POS, sincronização e recuperação de pedido inválido. Não usa
TPA, AGT ou serviços externos reais; esses adaptadores precisam de homologação
no piloto.

## Checklist de piloto

- Empresa, filiais, utilizadores, permissões e séries confirmados.
- NIF, regras IVA, certificado e requisitos SAF-T/AGT homologados externamente.
- PostgreSQL, backups cifrados, restaure testado e retenção configurada.
- TPA, impressora, leitor, gaveta e rede testados com adaptadores aprovados.
- Fecho de caixa, devolução, reimpressão, offline e sincronização testados.
- Responsável de suporte, janela de incidente e contacto do fornecedor definidos.
- Exportação de dados e procedimento de encerramento da empresa aprovados.

Os tokens de sessão continuam em `localStorage` por compatibilidade com o
desktop/PWA offline. Isto é um risco XSS residual: a CSP, a ausência de
segredos no service worker/cache, o escaping React, a expiração curta do
access token, refresh-token rotation/revogação e o rate limit reduzem o
impacto, mas não substituem a migração futura para um broker de sessão com
cookies `HttpOnly`, `Secure` e `SameSite`. Nunca usar `localStorage` para
segredos de longa duração.
