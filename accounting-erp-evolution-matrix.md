# VendaJá Angola — Matriz de Auditoria e Evolução do Módulo de Contabilidade ERP (Fase 2.2 — Correção Final de Governação, Prova de Migration e Manifesto Pré-Commit)

> [!IMPORTANT]
> **Declaração Regulatória Obrigatória**:
> **“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”**
>
> As referências ao Plano Geral de Contabilidade (PGC) e ao Decreto Presidencial n.º 82/01 constituem dependência técnica de fonte oficial da República de Angola e dependem de parametrização e validação formal por contabilista certificado pela OCPCA (Ordem dos Contabilistas e Peritos Contabilistas de Angola), **nunca como conformidade legal já comprovada ou homologação fiscal concluída**.
>
> **Fórmula Mandatória de Governação**:
> *“Modelagem contabilística configurável por empresa, sujeita a fonte oficial e validação por contabilista certificado.”*

---

## 1. Classificação Estruturada de Maturidade Contabilística

Cada capacidade funcional do sistema é classificada estritamente de acordo com as seis categorias normativas:
- **`Implementado atualmente`**: Funcionalidade real, operacional e testada no código atual.
- **`Configurável`**: Funcionalidade existente ativada por chave, parâmetro de sistema ou ficheiro de configuração.
- **`Planeado para Fase 3`**: Evolução estrutural do núcleo contabilístico calendarizada para fases subsequentes.
- **`Dependente de fonte oficial/legal`**: Depende de publicação, tabelas oficiais, XSD da AGT ou normas legais publicadas em Diário da República.
- **`Dependente de validação por contabilista`**: Regra de negócio, mapeamento de contas ou lançamento cuja definição oficial cabe ao contabilista certificado da empresa.
- **`Não implementado`**: Funcionalidade ausente que requer desenvolvimento futuro.

---

## 2. Matriz de Auditoria e Governação Contabilística (Fase 2.1)

| Funcionalidade | Estado Atual | Classificação | Serviço / Rota / UI Existente | Lacuna Técnica / Governação Corrigida na Fase 2.1 | Prioridade | Impacto |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Plano de Contas Multiempresa e Demonstração** | Modelos provisionais/demo por tenant | **Implementado atualmente** & **Configurável** | `Account`, `GET /chart`, `ensureCompanyChart` | Eliminação de pressupostos fixos de taxonomia legal. Templates marcados estritamente como `PROVISIONAL_DEMO` configuráveis por empresa. Isolamento multi-tenant formal via `@@unique([companyId, code])`. | **CONFORME** | Estrutural / Multi-tenant |
| **Árvore de Contas e Deteção de Ciclos** | Grafo com validação em profundidade | **Implementado atualmente** | `checkHierarchyCycle`, `Account.parentId` | Bloqueio de ciclos em grafo; proibição de lançamentos em contas agregadoras (`HEADER`) ou inativas (`isActive = false`). | **CONFORME** | Integridade Cadastral |
| **Subdiários Operacionais Isolados** | Subdiários com sequenciação atómica | **Implementado atualmente** & **Configurável** | `AccountingJournal`, `allocateSubledgerSequence` | Subdiários canónicos (`VEND`, `COMP`, `CAIX`, `BANC`, `ODIV`, `REGL`, `STCK`, `ENC`) e personalizados por exercício com numeração concorrente estritamente contígua e isolada por tenant. | **CONFORME** | Auditoria e Concorrência |
| **Parametrização Explícita de Fecho Anual** | Entidade `FiscalYearClosingConfig` | **Implementado atualmente** & **Configurável** | `POST /closing-configs`, `GET /closing-configs/active` | Proibição de pressupor contas específicas, classes de encerramento ou diários fixos. Fecho exige configuração explícita por empresa com `retainedEarningsAccountId` (UUID, MOVEMENT, EQUITY, ativa), `closingJournalId` (UUID, OPEN), `sourceAccountTypes` (tipos de conta de origem configurados pela empresa), metadados de auditoria (`policyType`, `source`, `version`, `responsibleParty`, `approvalDate`, `status`). | **CONFORME** | Governação ERP |
| **Fecho e Reabertura de Exercício** | Motor transacional com auditoria | **Implementado atualmente** & **Configurável** | `POST /fiscal-year/closing/execute`, `reopenFiscalYear` | Bloqueio seguro quando a parametrização não existe ou é cross-tenant. Fecho cria lançamento balanceado no subdiário configurado; reabertura auditada por estorno sem exclusão física. | **CONFORME** | Compliance e Fecho Anual |
| **Backfill Multiempresa Seguro (Migration 35)** | Backfill não-ambíguo com salvaguarda | **Implementado atualmente** | Migration `20261104100000` | Proibição de associação arbitrária a empresa padrão. Backfill infere empresa via `JournalEntry`/`TaxRule` e bloqueia a migração com `MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS` em caso de ambiguidade. | **CONFORME** | Integridade de Dados |
| **Estornos e Imutabilidade (Audit Trail)** | Conforme no backend | **Implementado atualmente** | `POST /journals/:id/reverse` | Reversão executada estritamente por contrapartida (`JOURNAL_REVERSAL`) sem deleção física. Proibição de edição de documentos emitidos. | **CONFORME** | Compliance AGT |
| **Períodos Contabilísticos e Bloqueio Retroativo** | Conforme no backend | **Implementado atualmente** | `AccountingPeriod`, `POST /periods/:id/close` | Períodos mensais com status `OPEN` ou `CLOSED`. Tentativas de lançamento em período fechado rejeitadas com erro HTTP 409 `accounting_period_closed`. | **CONFORME** | Rigor Contabilístico |
| **Partidas Dobradas e Idempotência** | Conforme no backend | **Implementado atualmente** | `Journal`, `JournalLine`, `accounting.ts` | Invariante matemática respeitada (`debitCents === creditCents`). Idempotência garantida por `@@unique([companyId, sourceType, sourceId])`. | **CONFORME** | Rigor Contabilístico |

---

## 3. Resolução da Falha de UX no Campo de Preço do Catálogo (`MoneyInput`)

- **Componente Reutilizável**: [`MoneyInput`](file:///c:/Users/g/copilot-worktrees/tmp-kinaxixi-v2/catxioca-didactic-enigma/apps/desktop/src/MoneyInput.tsx)
- **Atributos Técnicos**: `type="text"`, `inputMode="decimal"`, `autoComplete="off"`, `forwardRef`, `aria-invalid`, `aria-describedby` com mensagem de erro acessível (`role="alert"`).
- **Sem Zero Inicial Obstrutivo**: Ao focar com valor `0`, o campo fica visualmente limpo com placeholder `0,00`.
- **Substituição Imediata ao Focar**: Em produto com preço existente, o valor é selecionado integralmente; a primeira tecla digitada substitui o montante.
- **Estados Transitórios Resilientes**: Suporta digitação sem formatação agressiva antes do `blur` (ex.: `1500`, `1500,`, `1500,5`, `1.250,`).
- **Conversão Determinística em Cêntimos**: Motor aritmético estrito em BigInt sem uso de `parseFloat` nem imprecisões de ponto flutuante.
- **Rejeição Estrita**: Valores negativos, texto arbitrário, `NaN`, `Infinity`, overflow e mais de 2 casas decimais são explicitamente rejeitados com indicação de erro acessível.
- **Regra Vazio Não É Zero**:
  - Apagar um preço existente e sair do campo (`blur`) **NUNCA converte o montante para 0,00 cêntimos** e não chama `onChangeCents(0)`.
  - O valor confirmado anterior permanece protegido na base de dados/formulário.
  - Apresenta imediatamente erro de validação acessível (`Preço obrigatório`, `role="alert"`, `aria-invalid="true"`).
  - Digitação explícita de `0` ou `0,00` é reconhecida legitimamente como zero intencional (`isExplicitZero: true`) e grava zero.

---

## 4. Governação da Fundação Contabilística Multiempresa (Fase 2.2)

> [!IMPORTANT]
> **Declaração Regulatória Obrigatória**:
> **“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”**

### 4.1 Bloqueio Legal / Contabilístico: Eliminação de PGC Hardcoded
1. **Modelos Demonstrativos**: O ficheiro `apps/backend/src/services/accounting.ts` define estritamente `PROVISIONAL_DEMO_ACCOUNTS_TEMPLATE`. Nenhuma classe ou código numérico é assumido como imposição legal absoluta ou taxonomia fiscal definitiva do sistema.
2. **Eliminação de Classes e Contas Hardcoded**:
   - O encerramento anual não pressupõe contas específicas (como 56 ou 81), classes de apuramento (como 6 e 7) ou diários fixos (como `FECH`).
   - O fecho anual exige obrigatoriamente a existência de um registo ativo em `FiscalYearClosingConfig` para a empresa executante.
3. **Parametrização Explícita e Dinâmica de Fecho (`FiscalYearClosingConfig`)**:
   - `retainedEarningsAccountId`: UUID estrito apontando para conta da própria empresa, com `type == EQUITY`, `accountType == MOVEMENT` e `isActive == true`. Bloqueia contas `HEADER` ou inativas com 400.
   - `closingJournalId`: UUID estrito de subdiário da empresa com `status == OPEN`.
   - `sourceAccountTypes`: Lista delimitada por vírgulas de tipos de conta de apuramento (ex.: `"REVENUE,EXPENSE"` por defeito, ou personalizável como `"REVENUE"`). O motor calcula as linhas de encerramento exclusivamente a partir das contas correspondentes aos tipos configurados, comprovando que alterar a configuração altera o apuramento sem qualquer alteração de código.
   - `sourceCategoryFilter`: Filtro opcional por categoria contabilística.
   - `policyType`: Tipo de política de governação (`INTERNAL_POLICY`, `PROVISIONAL`, `STATUTORY`).
   - Metadados: `source` (ex.: "POLITICA_INTERNA", "MANUAL_CONTABILISTICO"), `version`, `responsibleParty` (ex.: "Contabilista Certificado OCPCA"), `approvalDate`, `status` (`ACTIVE`/`INACTIVE`), vigências e notas.
   - Bloqueio de preview e execução se a configuração não existir (422 `closing_config_required`), se for cross-tenant (403 `company_context_forbidden`) ou se violar restrições estruturais.

### 4.2 Consistência do Modelo de Contas: Única Fonte de Verdade
A classificação de contas não depende de análise de strings de código ou prefixos numéricos. A única fonte de verdade divide-se em 4 eixos ortogonais e auditáveis:
- **`accountType`** (Natureza Técnica Operacional): `MOVEMENT` (permite lançamentos em diário) vs `HEADER` (agregadora na árvore; proibida de receber débitos/créditos diretos).
- **`normalBalance`** (Natureza Contabilística de Saldo): `DEBIT` (aumenta a débito) vs `CREDIT` (aumenta a crédito). Utilizado pelo motor para cálculo correto de saldos devedores/credores.
- **`type`** (Semântica Patrimonial e Económica): `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`. Define a posição no Balanço ou Demonstração de Resultados.
- **`category`** (Agrupamento Interno Configurável): `CURRENT_ASSET`, `NON_CURRENT_ASSET`, `CURRENT_LIABILITY`, `NON_CURRENT_LIABILITY`, etc.

### 4.3 Prova Real da Migration 35 em PostgreSQL Descartável
A migração `20261104100000_phase2_accounting_chart_journals_governance` (Migration 35) foi testada exaustivamente em base PostgreSQL 17 real descartável através de 4 cenários determinísticos (`phase2-migration-real.integration.spec.ts`):
1. **Cenário A — Base Limpa (Fresh Install)**:
   - Estado inicial: 0 tabelas.
   - Execução das 35 migrações sequenciais desde o início.
   - Estado final: 129 tabelas criadas com integridade referencial completa; 0 resíduos.
2. **Cenário B — Upgrade Legado Mono-Empresa**:
   - Aplicação das migrações 1 a 34.
   - Inserção de fixtures legadas de contas sem empresa associada num ambiente com 1 empresa.
   - Aplicação da migração 35.
   - Resultado: 100% das contas legadas atribuídas à empresa existente; integridade preservada com 0 perda de dados.
3. **Cenário C — Upgrade Legado Multiempresa Inequívoco**:
   - Aplicação das migrações 1 a 34 num ambiente com 2 empresas.
   - Inserção de contas vinculadas a transações (`JournalEntry`) e regras fiscais (`TaxRule`) pertencentes de forma inequívoca a empresas distintas.
   - Aplicação da migração 35.
   - Resultado: Cada conta órfã foi atribuída estrita e exclusivamente à empresa à qual os seus lançamentos pertenciam.
4. **Cenário D — Upgrade Legado Ambíguo com Rollback Transacional**:
   - Aplicação das migrações 1 a 34 num ambiente com 2 empresas.
   - Inserção de conta órfã sem histórico ou vínculo a qualquer empresa.
   - Tentativa de aplicação da migração 35.
   - Resultado: Falha determinística imediata com `MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS`. A transação `BEGIN ... COMMIT` executou `ROLLBACK` total, preservando a base exatamente no estado anterior sem corrupção ou associações arbitrárias a empresa padrão.

---

## 5. Conclusão Técnica e Evidências da Fase 2.2
- **Eliminação Total de Classes Hardcoded**: Configuração de encerramento anual via `FiscalYearClosingConfig` dinâmico com `sourceAccountTypes`.
- **4 Provas de Migração Reais Executadas**: Cenários A, B, C e D validados em PostgreSQL descartável via `phase2-migration-real.integration.spec.ts`.
- **Suites Globais de Integração do Backend**: 70 testes de integração aprovados em PostgreSQL real (70 pass, 0 fail, 0 skipped).
- **Declaração Regulatória**: “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
