# Arquitetura de Segurança, Governança, RBAC e Auditoria Forense

## 1. Princípios de Segurança
- **Menor Privilégio Possível (Least Privilege)**: Todo utilizador inicia sem permissões operacionais até que funções ou permissões específicas sejam atribuídas.
- **Não Repúdio e Trilha Forense**: Nenhuma operação sensível (criação de documentos fiscais, anulações, transferências de dinheiro, aprovações ou alterações de dados de clientes) pode ocorrer sem registo correspondente em `AuditLog`.
- **Proteção Criptográfica**: Chaves de API armazenadas sob hash SHA-256; senhas cifradas com `bcrypt` (fator 12); licenças assinadas com chaves assimétricas RSA-2048.

## 2. Matriz de Permissões RBAC (79 Permissões Especializadas)
A solução implementa 79 permissões granulares cobrindo 11 módulos fundamentais:
- **Vendas & POS**: `pos:checkout`, `pos:void`, `pos:discount`, `pos:price_override`, `sales:read`, `sales:create`, `sales:cancel`.
- **Compras & Fornecedores**: `purchases:read`, `purchases:create`, `purchases:approve`, `suppliers:manage`.
- **Tesouraria & Caixa**: `treasury:transfer`, `cash:open`, `cash:close`, `cash:reconcile`.
- **Contabilidade**: `accounting:periods:close`, `accounting:periods:reopen`, `accounting:journal:post`.
- **Recursos Humanos**: `hr:employees:read`, `hr:employees:write`, `hr:payroll:read`, `hr:leaves:approve`.
- **CRM & Documentos**: `crm:leads:manage`, `crm:deals:manage`, `docs:upload`, `docs:delete`.
- **Business Intelligence**: `bi:dashboards:read`, `bi:reports:export`, `bi:forecast:view`.
- **Multi-Tenant & SaaS**: `saas:tenants:manage`, `saas:branches:create`, `saas:subscriptions:manage`.
- **Administração & Licenciamento**: `admin:users:manage`, `admin:roles:manage`, `admin:license:manage`, `audit:logs:view`.

## 3. Estrutura do Registo de Auditoria Forense
Cada entrada na trilha de auditoria contém:
```json
{
  "id": "uuid-v4",
  "timestamp": "2026-10-21T15:30:00.000Z",
  "companyId": "uuid-v4-tenant",
  "userId": "uuid-v4-user",
  "module": "FINANCIAL",
  "action": "TREASURY_TRANSFER_EXECUTED",
  "entity": "TreasuryTransfer",
  "entityId": "TRF-2026/00042",
  "ipAddress": "192.168.1.100",
  "userAgent": "VendaJa Desktop/2.2.1",
  "oldValue": { "originBalanceCents": 1500000 },
  "newValue": { "originBalanceCents": 1000000, "transferredCents": 500000 },
  "metadata": { "reason": "Aporte de liquidez para pagamento de salários" }
}
```
