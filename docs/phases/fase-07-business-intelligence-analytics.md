# Fase 7 — Business Intelligence, Analytics e Previsão Executiva

## 1. Objetivo
Transformar dados brutos transacionais em inteligência analítica para tomada de decisões estratégicas de Diretores e C-Levels, fornecendo modelos semânticos em estrela (Star Schema), previsão executiva de receitas, análise de coortes e integração nativa com o Microsoft Power BI.

## 2. Funcionalidades Implementadas
- **Modelagem Semântica e Data Warehouse (`BiDatawarehouseService`)**:
  - Tabelas de factos e dimensões (Tempo, Clientes, Produtos, Lojas, Vendedores).
  - Cálculo de KPIs essenciais: Volume de Negócios, Margem Bruta, Ticket Médio, CAC (Custo de Aquisição de Clientes) e LTV (Customer Lifetime Value).
- **Time-Intelligence e Análise Preditiva (`BiTimeIntelligenceService` & `BiForecastService`)**:
  - Comparativos homólogos: Ano vs. Ano (YoY), Mês vs. Mês (MoM).
  - Projeção de vendas através de regressão linear ponderada com intervalo de confiança de 95% e deteção de sazonalidade mensal.
- **Alertas Executivos e Deteção de Anomalias (`BiAlertsService`)**:
  - Notificação de quebra de vendas, queda atípica de margem ou picos imprevistos de custos operacionais.
- **Integração Nativa com Microsoft Power BI (`BiPowerBiService`)**:
  - Geração automática de ficheiros de ligação `.pbids` (Power BI Desktop Connector).
  - Catálogo de métricas DAX pré-calculadas prontas para uso em relatórios corporativos.
- **Dashboards Personalizáveis pelo Utilizador (`BiDashboardService`)**:
  - Criação de painéis sob medida com widgets de gráficos de linhas, barras, funis e cartões de KPI.

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Validado na suite `src/services/business-intelligence.spec.ts`.

## 4. Problemas Conhecidos
- Consultas analíticas históricas sem limitação de intervalo em bases de dados com milhões de registos podem requerer índices compostos adicionais no PostgreSQL.

## 5. Melhorias Pendentes
- Modelos de Inteligência Artificial para recomendação preditiva de reposição de inventário e deteção de churn de clientes.
- Exportação automatizada de relatórios em PowerPoint e PDF para apresentação em reuniões de Conselho de Administração.
