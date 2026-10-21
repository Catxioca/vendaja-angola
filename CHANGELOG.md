# Changelog — VendaJá Angola ERP Enterprise

Todas as alterações notáveis deste projeto serão documentadas neste ficheiro.
O formato baseia-se em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.0.0-enterprise-foundation] - 2026-10-21

### Adicionado
- **Inteligência Artificial Empresarial & VendaJá Copilot (Fase 10)**:
  - **VendaJá Copilot**: Assistente corporativo multi-domínio em linguagem natural operando exclusivamente sobre dados reais do ERP (proibição de dados fictícios em produção), integrado no Dashboard, CRM, Financeiro, RH, Compras, Stocks, Portais e Mobile.
  - **Assistentes Especializados**: Assistente Financeiro & Tesouraria (previsão de liquidez e pagamentos), Assistente Comercial (pipeline, ranking e retenção), Assistente de Stocks (previsão de ruptura em dias e compras sugeridas), Assistente de RH (férias LGT 22 dias e massa salarial) e Assistente Executivo.
  - **Modelos Preditivos de Machine Learning**: Previsão de vendas em 3 cenários (Conservador -10%, Esperado Real e Otimista +15% com 95% de confiança), cálculo de dias até esgotamento de stock e fluxo de caixa a 30/60/90 dias.
  - **Deteção Contínua de Anomalias & Auditoria**: Alerta automático de descontos excessivos (>20%), quebras de stock atípicas e faturas anuladas com registo compulsório na trilha forense do `EnterpriseAuditService`.
  - **Recomendações Estratégicas**: Sugestões automáticas com estimativa explícita de impacto financeiro em Kwanzas (Kz).
  - **Auto-Atualização Dinâmica sem Reinstalador (Hot-Sync Live)**: Sistema de distribuição contínua via `/api/v1/saas/updates/live-config` e IPC `syncLiveConfig`, permitindo ativar novos módulos e diretrizes fiscais nos computadores já instalados sem necessidade de novos ficheiros executáveis (.exe/.msi).
  - **Segurança & Governança RBAC**: 5 novas permissões canónicas (`AI.View`, `AI.Chat`, `AI.Forecast`, `AI.Analytics`, `AI.Admin`) elevando a matriz para 84 permissões e 12 módulos canónicos.
- **Licenciamento Modular em Dois Níveis & Proteção DRM**:
  - Separação formal e independente entre a **Licença do Produto** (autorização base do ERP) e **Licenças Modulares** (desbloqueio por módulo contratado).
  - Assinatura assimétrica RSA-2048 de licenças com verificação local via `public.pem`.
  - Amarração de hardware (Hardware Fingerprint) baseada em identificadores físicos do processador e BIOS.
  - Mecanismos de proteção contra recuo de relógio (Anti-Clock Tampering) e período de tolerância de 15 dias (Grace Period).
  - Motor de preservação de licenças e dados reais durante atualizações de versão (`update-migration-engine.ts`), eliminando a reintrodução de dados fictícios em ambientes de produção.
- **Portais Web Self-Service & Mobilidade Corporativa (Fase 9)**:
  - **Portal do Cliente**: Extrato de conta corrente contínuo com saldo corrido cronológico, emissão de referências de pagamento Multicaixa GPO / Express (Entidade `00142`), dados bancários BAI e BFA, consulta e download de documentos fiscais (FT, FR, NC).
  - **Portal do Fornecedor**: Acompanhamento de Ordens de Compra (OC), consulta de guias de receção em armazém (Goods Receipts) e submissão eletrónica de faturas comerciais para validação contábil.
  - **Portal do Colaborador (RH)**: Gestão de férias segundo a **Lei Geral do Trabalho de Angola (LGT - Lei n.º 12/23)** com direito anual de 22 dias úteis, cálculo de dias gozados/agendados/remanescentes, submissão de ausências via workflow e recibos de vencimento discriminando **retenção de IRT progressivo** e **3% de dedução para o INSS**.
  - **Mobile ERP Corporativo (Android & iOS)**: Cockpit Executivo de BI, Centro de Aprovações em 1-Toque (Compras, Despesas, Férias, Stock), CRM móvel com registo de visitas a clientes com coordenadas **GPS reais**, notas e **captura de assinatura digital**, com motor de sincronização offline idempotente por UUID v4.
  - **Navegação Unificada Omnichannel**: Barra de alternância rápida no topo da aplicação web para transição imediata entre Backoffice, Portais e Simulador Mobile.
- **Cloud SaaS, Multi-Tenancy & Multi-Loja (Fase 8)**:
  - Isolamento rigoroso de inquilinos (`companyId` e `tenantId`) com quotas configuráveis por plano (`STARTER`, `PROFESSIONAL`, `ENTERPRISE`).
  - Motor de faturação recorrente de subscrições com referências Multicaixa Express.
  - Gestão de filiais e transferências inter-lojas com rastreamento logístico em trânsito e conferência de destino.
  - Motor de armazenamento em nuvem e Disaster Recovery com snapshots diários com checksum SHA-256 e replicação geográfica.
- **Business Intelligence & Analytics Executivo (Fase 7)**:
  - Modelagem semântica em estrela (Star Schema) com cálculo de KPIs (Volume de Negócios, Margem Bruta, Ticket Médio, DSO, CAC, LTV).
  - Funções de inteligência temporal (YoY, MoM) e previsão executiva de vendas via regressão ponderada com 95% de confiança.
  - Alertas automáticos para quebra de margem ou anomalias financeiras.
  - Conector nativo e exportação de metadados para o **Microsoft Power BI** (`.pbids` e medidas DAX).
- **Finanças Avançadas, Gestão de Ativos & Contabilidade Analítica (Fase 6)**:
  - Tesouraria atómica em conformidade com o Plano Geral de Contabilidade de Angola (PGCA) utilizando conta 45 (Valores em Trânsito).
  - Previsão dinâmica de tesouraria e runway (cenários Conservador, Realista e Otimista).
  - Gestão de imobilizado e cálculo de quotas constantes de amortização fiscal.
  - Relatórios de Aging de contas a receber e contas a pagar em 5 faixas cronológicas com bloqueio automático de clientes em mora.
  - Encerramento de exercícios com bloqueio retroativo e emissão de Balanço Patrimonial e DRE por Natureza com EBITDA.
- **API Pública, Webhooks & SDKs (Fase 5)**:
  - Emissão de chaves de API com hash SHA-256 e rate limiting por janela deslizante.
  - Servidor OAuth2 para autenticação de integrações máquina-para-máquina (M2M).
  - Motor de Webhooks assinado com HMAC-SHA256 e retentativas exponenciais.
  - Pacote oficial do SDK (`packages/sdk`) com exemplos prontos para TypeScript, Python e C# (.NET).
- **CRM Empresarial & Gestão Documental (Fase 4)**:
  - Visão 360 graus de clientes e histórico transacional completo.
  - Funil de vendas (Lead-to-Cash) com associação de propostas comerciais e conversão em documentos fiscais.
  - Repositório central de documentos digitais com versionamento e controlo RBAC.
- **Workflow & Automação de Processos (Fase 3)**:
  - Motor de aprovações multinível por alçadas financeiras com estados formais e auditoria.
  - Motor de regras de negócio em tempo de execução e agendador de tarefas periódicas.
- **Governança, Segurança & Auditoria Forense (Fase 2)**:
  - Matriz RBAC com 79 permissões granulares cobrindo 11 áreas de negócio.
  - Autenticação de dois fatores (2FA/TOTP RFC 6238) e códigos de recuperação descartáveis.
  - Trilha de auditoria imutável (`EnterpriseAuditService`) capturando IP, User-Agent, Tenant, User, ação e estado anterior vs. novo.
  - Proteção de força bruta com bloqueio progressivo após 5 tentativas incorretas.

### Corrigido
- **Cálculo de Fatura, Troco e Valores Impressos**:
  - Eliminação de recálculos de totais durante a rotina de impressão.
  - Garantia de paridade matemática estrita: Total da Venda = Total da Fatura = Total Impresso = Total em Caixa.
  - Cálculo correto do troco (`changeCents = receivedCents - totalCents`) respeitando pagamentos monetários em numerário e métodos múltiplos (Dinheiro + Multicaixa).
- **Dashboard em Modo Offline**:
  - Remoção de bloqueios artificiais em modo offline. O dashboard consulta e agrega vendas e movimentos da base local garantindo que nunca exiba ecrãs vazios quando existem dados locais.
- **Integridade de Atualização e Reinstalação**:
  - Correção de scripts de inicialização para proibir a injeção de dados de teste (seeds) em ambientes de produção.
  - Preservação intacta de configurações, utilizadores e licenças preexistentes durante o processo de migração.

### Segurança
- Atualização e reforço do ficheiro `.gitignore` para bloquear chaves privadas (`*.pem`, `*.key`), certificados (`*.pfx`, `*.p12`, `*.jks`) e variáveis de ambiente confidenciais (`*.env*`).
- Auditoria preventiva do histórico e repositório, garantindo conformidade com as exigências da Agência de Proteção de Dados (APD) de Angola.
