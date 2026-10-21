# Fase 10 — Inteligência Artificial Empresarial: VendaJá Copilot, Modelos Preditivos e Auto-Sincronização Live

## 1. Objetivo
Transformar o VendaJá Angola num ERP Cognitivo Inteligente, incorporando um assistente empresarial nativo em linguagem natural semelhante ao Microsoft Copilot, Dynamics 365 Copilot e Odoo AI. O assistente apoia administradores, diretores financeiros, gestores comerciais, técnicos de armazém e operadores de caixa com base exclusivamente em **dados reais e auditáveis do ERP** (proibição absoluta de dados fictícios em produção), dispondo de modelos preditivos, deteção forense de anomalias, recomendações estratégicas com impacto financeiro em Kwanzas e **atualizações dinâmicas em tempo real (hot-sync) sem necessidade de reinstalar novos instaladores executáveis nos computadores dos clientes**.

## 2. Funcionalidades Implementadas
- **VendaJá Copilot (Assistente Corporativo Multi-Domínio em PLN)**:
  - Classificador semântico em português angolano com deteção automática de intenções corporativas em tempo real.
  - Disponível de forma integrada no **Dashboard**, **CRM**, **Financeiro & Tesouraria**, **Recursos Humanos**, **Compras & Fornecedores**, **Stocks & Inventário**, **Portal do Cliente**, **Portal do Fornecedor**, **Portal do Colaborador** e **Mobile ERP**.
  - Respostas a perguntas em linguagem natural:
    - *"Quanto vendi hoje?"* (faturação acumulada, volume de documentos, ticket médio).
    - *"Qual foi o produto mais vendido este mês?"* (artigo líder, volume faturado, margem e quantidade).
    - *"Quantas faturas foram emitidas esta semana?"* (documentos certificados com hash AGT).
    - *"Quais clientes estão em dívida?"* (saldos em aberto de conta corrente com identificação dos maiores devedores).
    - *"Qual fornecedor teve mais compras?"* (volume de compras aprovadas e pagamentos pendentes).
    - *"Qual o saldo atual de caixa?"* (sessões ativas e liquidez em dinheiro/bancos).
    - *"Quais produtos têm stock crítico?"* (itens abaixo do stock de segurança com sugestão de compra).
    - *"Quem está de férias?"* e *"Qual o custo da folha de pagamento?"* (LGT 22 dias úteis e IRT/INSS).
- **Assistentes Especializados por Domínio**:
  - **Assistente Financeiro & Tesouraria**: Previsão de liquidez a 30 dias, contas a pagar e a receber, saldo de tesouraria.
  - **Assistente Comercial & CRM**: Oportunidades estagnadas, taxa de conversão (Win Rate), reativação de clientes inativos (>90 dias) e ranking de vendas.
  - **Assistente de Stocks & Compras**: Artigos em risco de ruptura com estimativa de dias até ao esgotamento, valorização por custo médio ponderado e lead time de fornecedores.
  - **Assistente de Recursos Humanos (LGT)**: Controlo estrito de férias (22 dias úteis), despesas com vencimentos, subsídios e retenções legais.
  - **Assistente Geral & Executivo**: Visão holística da saúde operacional da empresa.
- **Modelos Preditivos de Machine Learning**:
  - **Previsão de Faturação**: Regressão ponderada adaptativa com índice de confiança de 95% em 3 cenários (Conservador -10%, Esperado Real e Otimista +15%).
  - **Previsão de Ruptura de Stock**: Cálculo dinâmico de taxa diária de esgotamento (`run-out days`) cruzado com histórico de entregas de fornecedores locais.
  - **Previsão de Fluxo de Caixa**: Modelagem de 30/60/90 dias antecipando compromissos e solvabilidade sem recurso a crédito de emergência.
- **Deteção Contínua de Anomalias Operacionais**:
  - Deteção imediata de descontos manuais excessivos (>20%) no POS.
  - Deteção de anulações suspeitas de documentos comerciais após impressão.
  - Deteção de quebras anómalas de inventário e desvios de margem bruta.
  - Registo compulsório e imediato de alertas críticos na trilha forense do `EnterpriseAuditService`.
- **Motor de Recomendações Estratégicas para o Gestor**:
  - Geração automática de propostas concretas de ação comercial, compras antecipadas e renegociação de despesas operacionais.
  - Quantificação explícita do impacto financeiro estimado em Kwanzas (Kz) para suporte à tomada de decisão.
- **Segurança Granular e RBAC Empresarial**:
  - Novas permissões canónicas integradas: `AI.View`, `AI.Chat`, `AI.Forecast`, `AI.Analytics` e `AI.Admin` (elevando o catálogo de governança para 84 permissões e 12 módulos canónicos).
  - Bloqueio estrito de consultas cujo utilizador não possua a credencial departamental necessária (ex: um operador de caixa não consegue consultar a folha salarial através da IA).
- **Resiliência e Arquitetura Edge-First**:
  - Fallback automático para o cubo analítico do Data Warehouse local e base local indexada em cenários de quebra de rede.
- **Atualização Dinâmica Sem Reinstaladores (Hot-Sync Live)**:
  - Sistema de distribuição contínua em runtime (`/api/v1/saas/updates/live-config` e IPC `syncLiveConfig`).
  - Habilita novos módulos e novas diretrizes fiscais diretamente nos terminais instalados, **eliminando a necessidade de os clientes descarregarem e reinstalarem novos instaladores executáveis (.exe/.msi)**.
- **Interface Gráfica**:
  - Widget interativo `CopilotWidget` integrado na web com chips de perguntas sugeridas, crachás de métricas visuais e tabelas de dados.
  - Painel Desktop dedicado `EnterpriseCopilotPanel` com abas de Chat, Previsões Preditivas, Anomalias, Recomendações e botão de Sincronização Dinâmica em Tempo Real.

## 3. Estado Atual
- **Status**: Produção / Validado (`100%` de testes unitários, de integração e de governança aprovados).
- **Testes**: Suíte dedicada `apps/backend/src/services/ai-copilot.spec.ts` validando NLU, RBAC, anomalias, recomendações e hot-reload live.

## 4. Problemas Conhecidos
- Em modo totalmente offline desconectado do backend, as previsões preditivas avançadas operam com base nas vendas locais armazenadas na cache analítica do terminal.

## 5. Melhorias Pendentes
- Suporte a consultas de voz em tempo real (Speech-to-Text em português de Angola).
- Assistente gerador de contratos e propostas comerciais formatadas em PDF prontas para assinatura.
