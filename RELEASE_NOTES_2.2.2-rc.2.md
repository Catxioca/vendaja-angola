# VendaJá Angola 2.2.2-rc.2

Release candidate destinada ao piloto operacional, sem lançamento público.

## Alterações

- Configuração Desktop aceita `http://localhost`, `http://127.0.0.1` e
  `http://[::1]` sem ativar a opção de HTTP piloto.
- HTTP para endereços/nomes da LAN continua bloqueado, salvo quando
  `VENDAJA_ALLOW_PILOT_HTTP=true`; URLs públicas continuam a exigir HTTPS.
- Testes cobrem URLs loopback, restrição de HTTP LAN/público, validação de
  URL e persistência de URL da API e `terminalId` em ficheiro.

## Atualização e dados locais

O instalador mantém o `appId` existente, o target NSIS, a instalação por
máquina e a arquitetura Windows x64. Não remove a configuração do servidor,
outbox, cache offline ou dados do utilizador durante o upgrade.

## Limitações

- HTTP é aceite automaticamente apenas para loopback neste computador; não
  usar HTTP de LAN para operação real. Configure HTTPS para servidores
  remotos.
- A release não declara homologação AGT/SAF-T nem valida integrações reais de
  banco, TPA ou periféricos.
