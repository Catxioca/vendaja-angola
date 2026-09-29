# VendaJá Angola 2.2.2-rc.3

Release candidate para piloto operacional experimental. Esta versão não é uma
publicação pública nem constitui homologação fiscal.

## Arquitetura do piloto

- Um desktop Electron por posto de venda, com `terminalId` único.
- Backend e PostgreSQL centrais, separados do ambiente de desenvolvimento.
- API remota acessível por HTTPS; o backend local no mesmo posto pode usar
  `http://localhost:4000`, `http://127.0.0.1:4000` ou `http://[::1]:4000`.
  HTTP para endereços/nomes de LAN exige `VENDAJA_ALLOW_PILOT_HTTP=true`.
- No primeiro arranque o administrador informa e testa a URL do backend e o
  `terminalId`. A configuração é guardada no `userData` do Electron, sem
  credenciais; a mesma tela permanece disponível em Definições.
- Operação offline temporária com outbox segregada por empresa, filial,
  utilizador e dispositivo. A sincronização deve ser repetível e rejeições
  devem ser tratadas antes do fecho do dia.
- A configuração inicial prevista é uma empresa, uma filial, um armazém, uma
  caixa e utilizadores nominativos de administrador, caixa, stock e
  contabilista.

## Conteúdo e segurança do instalador

O instalador NSIS é produzido por `npm run desktop:installer:offline` (com
cache Electron/electron-builder previamente disponibilizada). O pacote deve
conter apenas a aplicação Electron, backend compilado, Prisma Client, assets
web e a chave **pública** de licenciamento `public.pem`.

Não são permitidos no pacote ou no Git: `.env`, credenciais, base de dados,
tokens, chaves privadas, certificados privados, `node_modules` de
desenvolvimento, dumps ou licenças privadas. A verificação de conteúdo é feita
por `npm run release:verify`.

A instalação recomendada para o piloto é **por máquina**, com permissões
administrativas controladas. Cada posto recebe o seu `terminalId`; URL da API,
identificação do posto e nível de diagnóstico são configurados na primeira
execução, fora do instalador.

O instalador não está assinado quando não existe certificado de assinatura
fornecido pelo utilizador. Nesse caso o Windows pode exibir SmartScreen. O
procedimento seguro é distribuir o ficheiro por canal privado, conferir o
SHA-256 publicado pelo responsável e não desativar o SmartScreen. A assinatura
pode ser acrescentada posteriormente sem versionar o certificado privado.

## Entrada em piloto

1. Criar PostgreSQL exclusivo do piloto e configurar os segredos no servidor.
2. No servidor central, configurar `DATABASE_URL`, `JWT_SECRET`,
   `FISCAL_CONFIG_KEY`, `COMPANY_NIF`, `COMPANY_NAME` e `CORS_ORIGIN` fora do
   Git; executar `npm ci`, `npm run db:generate` e
   `npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma`.
3. Executar o seed aprovado, quando aplicável.
4. Criar empresa, filial, armazém, caixa, séries e utilizadores.
5. Instalar o Desktop; no primeiro arranque guardar a URL HTTPS remota ou a
   URL loopback HTTP do backend local e o
   `terminalId`, testar `/health` e iniciar sessão.
6. Importar artigos, clientes, fornecedores, stock e saldos; reconciliar e
   aprovar os totais.
7. Configurar backup cifrado, retenção e executar um restauro de prova.
8. Testar login, venda, devolução, stock, caixa, offline/sincronização,
   reimpressão e exportação de diagnóstico.
9. Obter aprovação do responsável operacional e do contabilista.

Os procedimentos detalhados estão em `OPERATIONS.md` e
`PILOTO_OPERACIONAL.md`.

## Bloqueios e dependências externas

Não iniciar o piloto se CI, migration, backup/restauro, E2E, build desktop,
smoke ou verificação do pacote falharem. AGT/SAF-T, banco, TPA, impressoras,
leitores, gaveta, DNS, certificado HTTPS e conectividade dependem de validação
do utilizador. Esta release não declara homologação AGT/SAF-T nem integração
bancária, TPA ou periféricos reais.

## Operação, diagnóstico e rollback

Backups devem ser feitos fora do repositório, cifrados e com retenção definida.
O restauro deve ocorrer numa base nova, seguido de migrations e health check;
rollback é de artefacto/cutover, não downgrade destrutivo. A exportação de
diagnóstico deve remover tokens, segredos e dados sensíveis antes do envio.
