# Fase 8 — Cloud SaaS, Multi-Tenancy e Gestão Multi-Loja

## 1. Objetivo
Permitir a operação do ERP como uma solução Cloud SaaS em grande escala, com isolamento lógico absoluto entre múltiplos inquilinos (Tenants), provisionamento autónomo, faturação recorrente de subscrições, orquestração de redes multi-loja com transferências logísticas de stock e Disaster Recovery geodistribuído.

## 2. Funcionalidades Implementadas
- **Arquitetura Multi-Tenant com Isolamento Rígido (`SaasTenantService`)**:
  - Segregação de dados por `companyId` e `tenantId` em todas as tabelas e consultas.
  - Planos de subscrição: `STARTER`, `PROFESSIONAL` e `ENTERPRISE` com quotas configuradas de utilizadores, filiais, terminais POS e armazenamento.
  - Cockpit SuperAdmin para monitorização de MRR (Monthly Recurring Revenue), ARR e saúde global da plataforma.
- **Faturação Recorrente e Cobrança de Subscrições (`SaasSubscriptionService`)**:
  - Emissão automática de faturas de subscrição com referências de pagamento Multicaixa Express.
  - Confirmação automática de pagamento e extensão instantânea de validade de serviço.
- **Gestão Multi-Loja e Transferências Inter-Filiais (`EnterpriseMultiStoreService`)**:
  - Controlo de inventário centralizado e saldos descentralizados por loja.
  - Guias de transferência de stock com ciclo de vida completo: Emissão (`PENDING`), Expedição (`IN_TRANSIT`) e Receção com conferência física (`RECEIVED`).
  - DRE individualizada por loja/filial.
- **Armazenamento Cloud e Disaster Recovery (`CloudStorageService` & `DisasterRecoveryService`)**:
  - Armazenamento em Blob com URLs assinadas e tempo de expiração dinâmico (TTL).
  - Snapshots diários completos de backup com verificação de checksum SHA-256 e replicação geográfica (Luanda, Frankfurt, São Paulo).

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Validado na suite `src/services/cloud-saas.spec.ts`.

## 4. Problemas Conhecidos
- Em conexões de banda estreita, a sincronização de catálogo global para lojas remotas com dezenas de milhares de SKUs deve ser escalonada em blocos de 500 itens.

## 5. Melhorias Pendentes
- Suporte a bases de dados particionadas por Tenant (Database-per-Tenant) para clientes de porte bancário ou governamental.
- Failover automatizado ativo-ativo entre datacenters com latência zero.
