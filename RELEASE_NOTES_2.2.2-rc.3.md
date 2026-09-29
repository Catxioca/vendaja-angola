# VendaJá Angola 2.2.2-rc.3

Release candidate com reforço da operação multiempresa, sequências fiscais e
preparação de builds Desktop/PWA para validação controlada.

## Alterações

- Isolamento por empresa aplicado aos fluxos de contabilidade, RH, vendas,
  compras, stock, caixa, relatórios, sincronização e gestão fiscal.
- Sequências de documentos fiscais mantidas por empresa, com migrations
  incrementais e sem renumeração de documentos históricos.
- Regras fiscais e cálculo de vendas cobertos por testes; integrações fiscais
  externas continuam dependentes de validação e aprovação formais.
- Configuração Desktop aceita URLs HTTP de loopback e conserva URL da API e
  `terminalId` no `userData`.
- Build Web/PWA disponibiliza funcionalidades web e assets offline; chamadas
  `/api/` não são servidas a partir da cache offline.

## Atualização e dados locais

O instalador mantém o `appId`, NSIS, instalação por máquina e arquitetura
Windows x64. O upgrade preserva `userData`, configuração do servidor, outbox
e cache offline.

## Limitações e homologação

Integrações com bancos, TPA, impressoras e outros periféricos dependem de
validação no ambiente do utilizador. O build PWA deve ser instalado em tablets
Android ou iPad através da opção “Adicionar ao ecrã inicial” ou “Instalar
aplicação” do navegador; não é um instalador Windows.

Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
