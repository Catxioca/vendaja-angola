# Plano de piloto operacional — VendaJá Angola

Este documento define um piloto controlado para **uma empresa, uma filial, um
armazém e uma caixa**. O piloto não presume homologação fiscal, credenciais de
produção, integração bancária, TPA, impressoras ou conectividade estável. Cada
item marcado como **Dependência do utilizador** deve ser fornecido, validado e
aceite pelo responsável da empresa antes da entrada em operação.

## 0. Estrutura única do backend piloto

Use uma cópia aprovada do monorepo nesta estrutura, sem executar comandos a
partir de `apps\backend`:

```text
C:\VendaJa\app\
  package.json
  package-lock.json
  .env
  apps\
    backend\
    desktop\
  node_modules\
  backups\
  logs\
```

`C:\VendaJa\app\` é a **raiz do monorepo** e o diretório de trabalho do
processo de produção. O `.env` fica diretamente nessa raiz, com ACL limitada à
conta do serviço e aos administradores autorizados; nunca fica dentro de
`apps\backend` nem é incluído no instalador Desktop. Como o backend carrega
`dotenv/config`, o processo encontra esse `.env` porque o serviço é iniciado
com `C:\VendaJa\app\` como `cwd` (diretório de trabalho).

A partir de `C:\VendaJa\app\`, execute exatamente:

```powershell
Set-Location C:\VendaJa\app
npm ci
npm run db:generate
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npm run db:seed
```

O `npm run db:generate` chama o gerador Prisma do workspace backend. O comando
de migration deve ser executado a partir da raiz, usando o schema acima; não
execute `prisma migrate dev` numa base piloto.

## 0.1 Variáveis e dependências de runtime

Crie `C:\VendaJa\app\.env` apenas no servidor, usando placeholders:

```dotenv
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://<DB_USER>:<URL_ENCODED_DB_PASSWORD>@127.0.0.1:5432/<DB_NAME>?schema=public
JWT_SECRET=<RANDOM_SECRET_AT_LEAST_32_CHARACTERS>
FISCAL_CONFIG_KEY=<RANDOM_SECRET_AT_LEAST_32_CHARACTERS>
COMPANY_NIF=<PILOT_COMPANY_NIF>
COMPANY_NAME=<PILOT_COMPANY_LEGAL_NAME>
CORS_ORIGIN=<EXACT_ALLOWED_ORIGINS_COMMA_SEPARATED>
TRUST_PROXY=false
```

Em `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `FISCAL_CONFIG_KEY`,
`COMPANY_NIF`, `COMPANY_NAME` e `CORS_ORIGIN` são obrigatórios. Não usar
placeholders literalmente, nem guardar segredos neste documento, no Git ou no
instalador.

O runtime do backend necessita de Node.js 20 LTS ou superior, os módulos
instalados em `C:\VendaJa\app\node_modules`, o Prisma Client gerado em
`apps\backend`, acesso à base PostgreSQL e `pg_dump.exe`/`pg_restore.exe` no
`PATH` para backup/restauro. PostgreSQL deve estar disponível antes do
backend.

## 0.2 Build e arranque de produção

O build do workspace backend transpila `apps\backend\src` e produz
`apps\backend\dist\server.js`; o script de build copia esse artefacto para
`apps\backend\dist\bundle.js`. O entrypoint compilado oficial do piloto é:

```text
C:\VendaJa\app\apps\backend\dist\bundle.js
```

Não use `npm run dev`, `tsx watch` ou qualquer watcher no piloto. A partir da
raiz do monorepo, o comando exato de produção é:

```powershell
Set-Location C:\VendaJa\app
node apps\backend\dist\bundle.js
```

Para um serviço Windows (NSSM, WinSW ou mecanismo equivalente aprovado), use:

- **Application:** `C:\Program Files\nodejs\node.exe`;
- **Arguments:** `apps\backend\dist\bundle.js`;
- **Startup directory / working directory:** `C:\VendaJa\app`;
- **Environment/configuration:** o `.env` em `C:\VendaJa\app\.env`, lido por
  `dotenv/config` devido ao `cwd`;
- **Conta:** utilizador de serviço dedicado, sem privilégios
  administrativos, com leitura do monorepo e do `.env`;
- **Logs:** diretório externo controlado, por exemplo
  `C:\VendaJa\logs\`, com rotação e ACL restrita.

Confirme no gestor de serviços que o `cwd` é `C:\VendaJa\app`; iniciar
`bundle.js` com outro diretório pode fazer o processo não encontrar o `.env`.
Após registar o serviço, valide o arranque automático após o PostgreSQL, a
porta `4000`, os logs e `/health`. O serviço e a ferramenta escolhida são
**Dependência do utilizador**: este guia não os cria.

## 1. Checklist de pré-produção

### Governo, âmbito e responsáveis

- [ ] Nomear patrocinador do piloto, responsável operacional, responsável
  financeiro/contabilista e contacto de suporte.
- [ ] Definir data de início, horário de corte, duração mínima de cinco dias
  úteis e data de revisão.
- [ ] Confirmar que o piloto abrange apenas uma empresa, uma filial, um
  armazém e uma caixa.
- [ ] Definir quem pode aprovar descontos, anulações, devoluções, ajustes de
  stock e fechos com divergência.
- [ ] Registar o procedimento para interromper o piloto sem perder os registos
  feitos no sistema.

### Ambiente e segurança

- [ ] Confirmar instalação da versão aprovada e identificar o commit/artefacto.
- [ ] Confirmar a estrutura `C:\VendaJa\app\` e que migrations, seed e build
  foram executados a partir dessa raiz.
- [ ] Confirmar que o serviço usa `node apps\backend\dist\bundle.js` com
  `C:\VendaJa\app\` como diretório de trabalho, não `npm run dev`/`tsx watch`.
- [ ] Confirmar `DATABASE_URL`, `JWT_SECRET`, `FISCAL_CONFIG_KEY`,
  `COMPANY_NIF`, `COMPANY_NAME`, `CORS_ORIGIN` e `TRUST_PROXY` sem colocar
  valores secretos neste documento.
- [ ] Criar utilizadores nominativos; não partilhar contas.
- [ ] Testar os perfis de administrador, caixa, stock e contabilista com o
  princípio do menor privilégio.
- [ ] Confirmar relógio e fuso horário dos dispositivos.
- [ ] Confirmar que backups são cifrados, têm retenção definida e estão fora do
  equipamento principal.
- [ ] Executar um restauro de teste antes do primeiro movimento real.

### Fiscalidade, banco e equipamentos

- [ ] **Dependência do utilizador:** contabilista confirma séries, IVA,
  documentos, regras fiscais e procedimento de anulação/devolução.
- [ ] **Dependência do utilizador:** AGT/SAF-T, certificado, assinatura ou
  homologação fiscal confirmados por escrito, se aplicável.
- [ ] **Dependência do utilizador:** banco e TPA fornecem credenciais,
  terminais, ambiente de teste e procedimento de reconciliação.
- [ ] **Dependência do utilizador:** impressora, leitor de código de barras,
  gaveta, balança e drivers testados no local.
- [ ] Medir a conectividade no horário de maior movimento e definir o que fazer
  quando o sistema ficar offline.

### Dados e operação inicial

- [ ] Aprovar o modelo de dados inicial e a data/hora do corte.
- [ ] Validar amostras de artigos, clientes, fornecedores, stock e saldos.
- [ ] Fazer contagem física assinada antes da carga.
- [ ] Bloquear alterações no sistema anterior durante a reconciliação final.
- [ ] Executar os casos de teste diários deste documento sem documentos fiscais
  reais antes do primeiro dia de venda.

## 2. Modelo de configuração inicial

Preencher e aprovar este registo antes da carga:

| Campo | Valor a preencher | Responsável |
|---|---|---|
| Empresa / razão social | ____________________ | Administrador |
| NIF | ____________________ | Utilizador/contabilista |
| Filial / código | ____________________ | Administrador |
| Armazém / código | ____________________ | Stock |
| Localização principal | ____________________ | Stock |
| Caixa / código | ____________________ | Administrador |
| Série de vendas | ____________________ | Contabilista |
| Série de devoluções | ____________________ | Contabilista |
| Série de compras | ____________________ | Contabilista |
| Moeda | AOA / ____________________ | Contabilista |
| Regra de IVA | ____________________ | Contabilista |
| Método de valorização | Custo médio | Contabilista |
| Data de abertura | ____/____/________ | Patrocinador |
| Fuso horário | Africa/Luanda / ____________________ | Administrador |
| Operador de caixa | ____________________ | Administrador |
| Aprovador de descontos/devoluções | ____________________ | Patrocinador |
| Contacto de suporte | ____________________ | Patrocinador |

Não preencher neste ficheiro palavras-passe, tokens, chaves, certificados ou
credenciais de banco/TPA. Guardar esses valores no mecanismo de segredos
aprovado pelo utilizador.

## 3. Plano de migração de dados

### 3.1 Preparação e controlos

1. Exportar do sistema anterior para ficheiros versionados fora do repositório,
   mantendo o original imutável.
2. Definir o mapeamento de códigos: SKU, código de barras, NIF, unidade,
   categoria, taxa de imposto e série documental.
3. Normalizar duplicados, caracteres, casas decimais e datas sem apagar o
   ficheiro original.
4. Gerar um relatório de rejeições com linha, campo, motivo e decisão.
5. Aprovar uma amostra de pelo menos 10 artigos, 10 clientes, 10 fornecedores
   e todas as contas com saldo não nulo.

### 3.2 Ordem de carga

1. Empresa, filial, armazém, localização, caixa, utilizadores e permissões.
2. Categorias, unidades, taxas/regras fiscais e séries documentais.
3. Artigos: SKU único, nome, código de barras, custo, preço, imposto, mínimos,
   máximos, unidade e estado ativo.
4. Clientes: código, nome, NIF/contacto, limite de crédito e saldo inicial
   aprovado.
5. Fornecedores: código, nome, NIF/contacto, condições e saldo inicial
   aprovado.
6. Stock: contagem física por artigo/localização, lote/série/validade quando
   aplicável e custo médio na data de corte.
7. Saldos financeiros: contas a receber, contas a pagar, caixa e bancos,
   sempre com data de corte, origem e comprovativo.

### 3.3 Reconciliação e corte

- Comparar quantidade e valor do stock por artigo e armazém.
- Comparar totais de clientes e fornecedores com o balancete do sistema
  anterior.
- Comparar saldo inicial da caixa com a contagem física assinada.
- Registar diferenças numa ata de reconciliação; nunca compensar diferenças
  através de movimentos sem origem.
- Após a aprovação, congelar o export do sistema anterior e guardar o hash do
  ficheiro.
- Emitir o primeiro documento do piloto somente após o responsável financeiro
  aprovar a reconciliação.

## 4. Roteiro de formação por perfil

### Administrador — 2 horas

- Login, recuperação de acesso, utilizadores e permissões.
- Empresa, filial, armazém, caixa, séries e parâmetros operacionais.
- Consulta de auditoria, logs, saúde do sistema e sincronização.
- Aprovação de descontos, devoluções, ajustes e fechos divergentes.
- Backup, restauro, escalamento de incidentes e plano de rollback.
- Exercício: criar operador, limitar permissões, abrir caixa e rever auditoria.

### Caixa — 2 horas

- Abrir turno, confirmar fundo de caixa e selecionar a caixa correta.
- Procurar/ler artigo, alterar quantidade, aplicar desconto autorizado e
  selecionar pagamento.
- Emitir comprovante, tratar falha de impressão e reimprimir com autorização.
- Venda fiada/crédito apenas com cliente e limite aprovados.
- Devolução, anulação e encerramento do turno com contagem física.
- Operação offline: identificar fila pendente, não duplicar a venda e aguardar
  sincronização.
- Exercício: venda em dinheiro, cartão/TPA simulado, devolução e fecho.

### Stock — 2 horas

- Consultar stock por armazém/localização e alertas mínimo/máximo.
- Registar receção parcial, lote, série, validade e custo.
- Fazer transferência interna e inventário físico com referência.
- Registar ajuste apenas com motivo e aprovação.
- Tratar stock insuficiente, duplicação de receção e divergência de contagem.
- Exercício: receção parcial, transferência, contagem e correção auditável.

### Contabilista — 2 horas

- Confirmar plano de contas, períodos e séries documentais.
- Rever vendas, compras, impostos, caixa, contas a receber/pagar e
  reconciliações.
- Conferir débito/crédito, notas de crédito/débito e reversões.
- Exportar relatórios e preservar documentos emitidos.
- Validar procedimentos AGT/SAF-T aplicáveis sem presumir homologação.
- Exercício: conferir um dia, uma devolução, um recebimento e o fecho.

## 5. Casos de teste operacionais diários

Registar data, operador, resultado, evidência e observações para cada caso.

| ID | Caso | Resultado esperado |
|---|---|---|
| D01 | Login de cada perfil | Acesso permitido apenas ao módulo autorizado |
| D02 | Saúde/readiness | Endpoints respondem conforme o procedimento operacional |
| D03 | Abrir caixa | Fundo inicial, operador, hora e caixa ficam registados |
| D04 | Venda com leitura de artigo | Número único, total correto e stock decrementado uma vez |
| D05 | Venda com desconto autorizado | Desconto persistido na linha/documento e relatório |
| D06 | Cada meio de pagamento | Total pago, troco e movimento de caixa coerentes |
| D07 | Venda offline controlada | Interface continua utilizável; fila fica pendente sem duplicar |
| D08 | Sincronização | Fila é processada uma vez ou rejeitada com erro visível |
| D09 | Receção parcial | Apenas a quantidade recebida atualiza stock e saldo da ordem |
| D10 | Transferência | Origem decrementa, destino incrementa e referência coincide |
| D11 | Inventário físico | Diferença exige referência, operador e auditoria |
| D12 | Devolução/anulação | Reversão de stock, caixa e documento é rastreável |
| D13 | Fecho de caixa | Contagem física, esperado, diferença e aprovação ficam registados |
| D14 | Relatórios | Vendas, stock, caixa e margens reconciliam com os movimentos |
| D15 | Backup | Backup concluído, localização/hash registados e alerta ausente |

Falhar um caso crítico (D03, D04, D06, D08, D12 ou D13) bloqueia a aprovação
do dia e exige abertura de incidente.

## 6. Backup, restauro e resposta a incidente

### Backup

1. Executar backup diário antes do primeiro movimento e após o fecho.
2. Armazenar cópia cifrada fora do servidor principal, com data, hash,
   operador e retenção.
3. Confirmar sucesso pelo tamanho, hash, log e alerta; não considerar apenas a
   existência do ficheiro como prova.
4. A partir de `C:\VendaJa\app\`, com `DATABASE_URL` carregada e `BACKUP_PATH`
   apontando para um diretório de backup fora do código, executar:

   ```powershell
   Set-Location C:\VendaJa\app
   $env:BACKUP_PATH='C:\VendaJa\backups\vendaja-<YYYY-MM-DD>.dump'
   npm run db:backup
   ```

   O script `scripts\db-backup.mjs` chama `pg_dump.exe` em formato custom e
   cria os diretórios necessários. Se `BACKUP_PATH` não for definido, o
   padrão é `C:\VendaJa\app\backups\...`; para o piloto, prefira o diretório
   dedicado `C:\VendaJa\backups\`.
5. Fazer teste de restauro numa base nova, sempre a partir da mesma raiz:

   ```powershell
   Set-Location C:\VendaJa\app
   $env:DATABASE_URL='<URL_DA_BASE_NOVA_DE_RESTAURO>'
   $env:BACKUP_PATH='C:\VendaJa\backups\vendaja-<DATA>.dump'
   $env:ALLOW_DESTRUCTIVE_RESTORE='true'
   npm run db:restore
   ```

   O script `scripts\db-restore.mjs` exige as três variáveis acima, chama
   `pg_restore.exe` e usa `--clean --if-exists --exit-on-error`. Depois,
   execute `npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma`
   e os testes de saúde/reconciliação deste documento. Nunca use a base de
   produção como destino de um teste de restauro.

### Restauro

1. Parar novas vendas e registar a hora do último movimento confirmado.
2. Preservar o backup e logs atuais; nunca sobrescrever o único original.
3. Restaurar numa base nova, aplicar migrations e executar health/readiness,
   login, venda de teste e consulta de stock.
4. Comparar contagens e totais com a última reconciliação.
5. Fazer cutover somente com aprovação do administrador e contabilista.
6. Registar movimentos ocorridos depois do backup e decidir a sua recuperação.

### Resposta a incidente

- **Severidade crítica:** perda de dados, duplicação de venda, stock
  incorreto, documento fiscal inválido ou acesso indevido. Suspender operação,
  preservar evidências e escalar imediatamente.
- **Severidade alta:** caixa não fecha, sincronização bloqueada, indisponibilidade
  ou falha de backup. Suspender o fluxo afetado e abrir incidente no mesmo dia.
- **Severidade média:** erro isolado com alternativa manual controlada.
- Registar hora, utilizador, dispositivo, empresa/filial, correlação/log,
  documento afetado e passos já executados.
- Não apagar documentos, não repetir uma venda sem confirmar idempotência e não
  fazer alterações diretas na base.

## 7. Critérios objetivos de aprovação/reprovação

### Aprovação

O piloto é aprovado apenas se, durante pelo menos cinco dias úteis:

- 100% dos casos críticos D03, D04, D06, D08, D12 e D13 passarem;
- pelo menos 98% de todos os casos diários passarem, sem defeito crítico aberto;
- 100% das vendas do período tiverem número único e reconciliação de pagamento;
- diferença de stock por artigo for zero ou explicada e aprovada;
- diferença de caixa no fecho for zero ou formalmente justificada e aprovada;
- todos os backups diários forem concluídos e pelo menos um restauro for
  comprovado;
- nenhuma duplicação, perda de documento ou acesso indevido for confirmada;
- administrador, caixa, stock e contabilista concluírem a formação;
- contabilista e patrocinador assinarem a reconciliação final;
- dependências externas obrigatórias tiverem aceite documentado.

### Reprovação ou suspensão

Suspender ou reprovar se ocorrer qualquer um destes eventos:

- documento fiscal emitido sem conformidade validada pelo contabilista/AGT;
- venda, pagamento, devolução ou receção duplicada ou perdida;
- stock ou caixa sem reconciliação;
- backup inexistente, ilegível ou sem restauro demonstrado;
- exposição de credencial ou acesso fora da permissão;
- indisponibilidade que impeça a operação sem procedimento alternativo aprovado;
- equipamento crítico não homologado/testado;
- incidente crítico sem causa, contenção e decisão de continuidade.

## 8. Pendências externas

| Dependência | O que o utilizador deve fornecer/confirmar |
|---|---|
| AGT/SAF-T | Homologação aplicável, certificado, séries, regras e formato aceite |
| Contabilista | Plano de contas, IVA, períodos, saldos, reconciliação e aprovação fiscal |
| Banco | Contas, extratos, credenciais, formato de importação e reconciliação |
| TPA | Terminal, adquirente, ambiente de teste, comprovantes e suporte |
| Impressoras | Modelo, driver, papel, layout e teste de impressão |
| Leitores/balanças/gaveta | Modelo, ligação, driver e teste no posto |
| Conectividade | Rede local/internet, firewall, DNS, plano de contingência |
| Dados iniciais | Export limpo, contagem física, saldos e aprovação de corte |
| Suporte | Responsável, contacto, horários e SLA do piloto |

Nenhuma destas dependências é considerada satisfeita por este documento.

## 9. Plano de rollback para o sistema anterior

### Gatilhos

Ativar rollback se houver perda/duplicação de documentos, divergência não
explicada de stock/caixa, falha fiscal, indisponibilidade superior ao limite
aprovado ou incidente de segurança.

### Execução

1. O patrocinador declara o rollback e regista data/hora e motivo.
2. Fechar a caixa e interromper novos movimentos no VendaJá.
3. Exportar vendas, devoluções, pagamentos, movimentos de stock, auditoria e
   filas de sincronização desde o corte.
4. Guardar backup e logs do VendaJá; não apagar a base nem os documentos.
5. Reabrir o sistema anterior em modo controlado com uma nova sequência ou
   referência de contingência aprovada pelo contabilista.
6. Reintroduzir apenas movimentos validados, sem reemitir automaticamente
   documentos já emitidos.
7. Fazer contagem física e reconciliação de caixa antes de retomar vendas.
8. Comunicar aos operadores que sistema e procedimento estão ativos.
9. Abrir análise de causa; não voltar ao VendaJá até o patrocinador,
   contabilista e administrador aprovarem a correção e um novo ensaio.

O rollback não elimina o histórico do piloto e não autoriza alteração
destrutiva de documentos fiscais. Diferenças entre sistemas devem ficar numa
ata de reconciliação assinada.

## Aprovação do plano de piloto

| Papel | Nome | Assinatura/data |
|---|---|---|
| Patrocinador | ____________________ | ____________________ |
| Administrador | ____________________ | ____________________ |
| Caixa | ____________________ | ____________________ |
| Responsável de stock | ____________________ | ____________________ |
| Contabilista | ____________________ | ____________________ |
