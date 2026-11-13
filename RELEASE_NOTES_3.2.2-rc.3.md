# VendaJá Angola 3.2.2-rc.3

Release candidate de consolidação crítica para piloto operacional com robustez de conectividade corporativa, tratamento transparente de indisponibilidade de rede, supressão de mensagens técnicas, isolamento multiempresa e validação completa offline.

## Declaração Fiscal Obrigatória

“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”

## Principais Alterações Técnicas

- **Centro Corporativo & Conectividade Resiliente**:
  - Eliminação definitiva da mensagem técnica `Failed to fetch`, `NetworkError` ou `Load failed` na interface.
  - Introdução do estado visual dedicado **“Servidor corporativo indisponível”** com indicação da URL configurada, botão para teste de ligação em tempo real, botão para nova tentativa e opção de modo de demonstração (`DEMO`) explícito.
  - Resolução dinâmica da URL do Hub Central/API ativa (`props.api` / `window.__POS_API_URL__`), eliminando qualquer referência a `localhost:4000` em sincronização e queries.
  - Manutenção rigorosa de RBAC (`ADMIN` para mutações, `ADMIN` e `MANAGER` para leitura) e isolamento multi-tenant, com limpeza completa de cache corporativo e bloqueio mediante resposta `403 Forbidden`.
  - Arranque Desktop transparente: quando não houver `DATABASE_URL` local segura, a aplicação encaminha obrigatoriamente para a configuração da URL HTTPS do servidor corporativo central.

- **Paridade Web ERP e Desktop**:
  - Paridade total de componentes, rotas e engines entre `@angola/desktop` e `@angola/web`.
  - Sincronização do motor de atualização `live-update-engine.ts` com validação de manifesto assimétrico (`verifyAsymmetricManifest`).

- **Testes Automatizados e Auditoria de Qualidade**:
  - Suíte de 585 testes unitários aprovados nos workspaces.
  - 70 testes de integração PostgreSQL executados contra instância real descartável (`vendaja_test`), com 100% de sucesso e zero skips.
  - Zero vulnerabilidades em tempo de execução (`npm audit --omit=dev`).

- **Empacotamento Desktop Offline**:
  - Produção do instalador NSIS para Windows x64 (`VendaJá Angola-3.2.2-rc.3-win-x64.exe`) através do canal offline hermético (`npm run desktop:installer:offline`).
  - Verificação rigorosa de integridade excluindo ficheiros `.env`, segredos, bases de dados ou chaves privadas.
