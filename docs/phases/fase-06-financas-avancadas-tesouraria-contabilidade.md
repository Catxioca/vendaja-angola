# Fase 6 — Finanças Avançadas, Gestão de Ativos e Contabilidade Analítica

## 1. Objetivo
Implementar capacidades financeiras corporativas completas segundo o Plano Geral de Contabilidade de Angola (PGCA), integrando tesouraria multimoeda, reconciliação bancária atómica, gestão de ativos fixos e amortizações fiscais, centros de custo, contas a pagar/receber (AP/AR) com aging reports e consolidação financeira de holdings.

## 2. Funcionalidades Implementadas
- **Tesouraria Avançada e Transferências Internas (`EnterpriseTreasuryService`)**:
  - Controlo de caixas e contas bancárias institucionais (BAI, BFA, BIC, BMA, BCI).
  - Transferências atómicas entre contas via conta transitória PGCA 45 (Valores em Trânsito), garantindo equilíbrio contábil permanente.
  - Demonstração de fluxos de caixa em tempo real (operacional, investimento e financiamento).
- **Previsão de Tesouraria e Runway (`CashForecastService`)**:
  - Projeção de saldos em três cenários dinâmicos: Conservador, Realista e Otimista.
- **Gestão de Ativos Fixos e Depreciações Fiscais (`EnterpriseFixedAssetsService`)**:
  - Cadastro de bens de imobilizado com taxa legal de depreciação conforme tabelas fiscais de Angola.
  - Cálculo de quotas constantes mensais e anuais com contabilização automática de amortização acumulada.
- **Aging de Contas a Receber e Pagar (`EnterpriseReceivablesService` & `EnterprisePayablesService`)**:
  - Segmentação em faixas temporais: Corrente, 1-30 dias, 31-60 dias, 61-90 dias e >90 dias.
  - Bloqueio automático de crédito para clientes em incumprimento ou com limite excedido.
- **Contabilidade Analítica e Centros de Custo (`CostCenterService`)**:
  - Imputação de receitas e despesas por centro de custo (departamentos, projetos, filiais).
  - Cálculo da margem de contribuição e demonstração de resultados analítica.
- **Encerramento Contabilístico e Demonstrações Financeiras (`FinancialClosingService`)**:
  - Fecho de períodos com bloqueio estrito de lançamentos retroativos.
  - Balanço Patrimonial balanceado (Total Ativo = Total Passivo + Capital Próprio) e Demonstração de Resultados por Natureza (DRE) com apuramento de EBITDA.

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Validado na suite `src/services/financial-management.spec.ts`.

## 4. Problemas Conhecidos
- Reabertura de exercícios fiscais fechados exige permissão de SuperAdmin e justificação formal detalhada no registo de auditoria.

## 5. Melhorias Pendentes
- Reconciliação bancária automática via importação direta de extratos no formato padrão internacional MT940 / CAMT.053.
- Suporte a contabilidade orçamentária pública para entidades estatais angolanas.
