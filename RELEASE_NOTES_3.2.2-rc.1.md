# VendaJá Angola 3.2.2-rc.1

Release candidate com correção rigorosa de conformidade fiscal AGT, validação PostgreSQL real, evolução contabilística e preparação de builds Desktop/PWA para validação controlada.

## Declaração Fiscal Obrigatória

“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”

## Alterações Técnicas

- **Conformidade Fiscal e AGT**:
  - Eliminação de menções a homologações/certificações inexistentes, números inventados (ex: `24/AGT/2026`) ou validações oficiais fictícias.
  - Substituição da menção fiscal padrão por: `${hashPrefix}-Processado por programa informático · Não homologado até aprovação formal da AGT`.
  - Rotulagem explícita de códigos QR de teste como `QR Fiscal Piloto` / `Código QR Fiscal Estruturado (Piloto)`.
  - Cobertura de testes unitários rígidos (`document-types.spec.ts`) contra alegações falsas de certificação fiscal em todos os 12 tipos documentais.
- **Módulo de Contabilidade ERP**:
  - Fundação de plano de contas flexível por empresa, contas sintéticas/analíticas e subdiários configuráveis.
  - Remoção de amarrações rígidas de plano de contas a regras fixas do PGC sem parametrização pelo utilizador/contabilista.
- **Campos Monetários (MoneyInput)**:
  - Garantia de que valores em branco não são gravados silenciosamente como zero no Catálogo e restantes módulos.
- **Instalador Desktop e Upgrade**:
  - Preservação estrita de `userData`, `server-config.json`, `terminalId`, fila outbox, cache offline e licença no upgrade.
  - Configuração Electron: `appId: ao.commerce.desktop`, instalador NSIS per-machine, x64.
