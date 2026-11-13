# VendaJá Angola 3.2.2-rc.2

Release candidate com Centro Corporativo autenticado com dados reais e RBAC estrito, paridade Web ERP e Desktop, suporte avançado para Android/Tablet (POS touch dividido), migração Zod 4 e empacotamento offline para Windows x64.

## Declaração Fiscal Obrigatória

“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”

## Principais Alterações Técnicas

- **Centro Corporativo & RBAC Reforçado**:
  - Eliminação definitiva de mocks e dados fictícios no Centro Corporativo.
  - Endpoints `/api/v1/corporate/*` estritamente protegidos no backend: mutações restritas a papel `ADMIN`, consultas restritas a `ADMIN` e `MANAGER`.
  - Perfis operacionais (`CASHIER`, `OPERATOR`) recebem HTTP `403 Forbidden` sem fuga de dados empresariais ou métricas.
  - Limpeza imediata de cache e bloqueio de interface em Desktop e Web mediante resposta 403.
  - Testes unitários e de integração HTTP dedicados com isolamento multi-tenant real.

- **Web ERP e Paridade com Desktop**:
  - Sidebar esquerda unificada, categorizada e com estrutura exatamente equivalente ao Desktop.
  - Todos os módulos visíveis contam com rotas ativas, RBAC, tratamento de erros, estados de loading e empty state honestos.
  - Eliminação de botões ou ações decorativas sem backend correspondente.
  - Apresentação de banner/modal informativo "Indisponível nesta configuração" para módulos não licenciados no tenant.

- **Android / Tablet & POS Dividido**:
  - Suporte responsivo com distinção automática entre smartphone (< 768px) e tablet (>= 768px).
  - Modo POS touch com ecrã dividido (split-screen) ativo em tablets em orientação paisagem.
  - Configuração nativa Android: `applicationId "ao.co.vendaja.erp"`, `versionCode 2`, `versionName "3.2.2-rc.2"`, `minSdkVersion 24`, `targetSdkVersion 36`.
  - Preparação para geração de Android App Bundle (AAB) release dependente exclusivamente de keystore externa (`keystore.properties` ou variáveis de ambiente), com exclusão garantida no `.gitignore`.
  - Proibição de asserções funcionais sobre hardware físico sem testes reais.

- **Migração Zod 4 e Validação PostgreSQL Real**:
  - Conclusão da migração de schemas e validação rigorosa com limites funcionais em importações bancárias e coleções.
  - Execução canónica da suite de testes de integração contra base PostgreSQL real descartável (`vendaja_test`), com 100% de aprovação e zero skips.

- **Instalador Desktop e Empacotamento Offline**:
  - Geração canónica de instalador NSIS para Windows x64 (`VendaJá Angola-3.2.2-rc.2-win-x64.exe`).
  - Verificação de integridade de pacote com exclusão total de segredos, dumps, chaves privadas ou `.env`.
