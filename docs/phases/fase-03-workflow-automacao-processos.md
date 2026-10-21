# Fase 3 — Workflow e Automação de Processos Empresariais

## 1. Objetivo
Dotar o ERP de um motor corporativo de aprovações multinível, orquestração de tarefas assíncronas, regras de negócio configuráveis e automação operacional para fluxos críticos de compra, despesa, crédito e recursos humanos.

## 2. Funcionalidades Implementadas
- **Motor de Workflows Configurável (`EnterpriseWorkflowService`)**:
  - Definição de estados: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`.
  - Aprovações condicionadas por alçadas de valor (ex.: compras acima de 1.000.000 Kz exigem aprovação de Diretor).
  - Suporte a ações de avanço, recusa fundamentada com comentário obrigatório e reatribuição.
- **Motor de Regras de Negócio (`EnterpriseRulesService`)**:
  - Avaliação de regras contextuais em tempo de execução (descontos máximos por operador, bloqueio por limite de crédito).
- **Orquestrador de Tarefas e Notificações (`EnterpriseTaskService` & `EnterpriseNotificationService`)**:
  - Agendamento de rotinas operacionais (conferência diária de caixa, alertas de fecho contabilístico).
  - Distribuição multicanal de notificações internas (in-app, email corporativo).

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Validado na suite `src/services/automation-workflow.spec.ts`.

## 4. Problemas Conhecidos
- Em execuções paralelas com dezenas de instâncias de aprovação simultâneas, tarefas de auditoria podem requerer pool de conexões otimizada.

## 5. Melhorias Pendentes
- Desenhador visual de diagramas BPMN 2.0 integrado no frontend para modelação arrastar-e-soltar de processos.
- Escalação automática de aprovações não respondidas após SLA de 48 horas para o superior hierárquico.
