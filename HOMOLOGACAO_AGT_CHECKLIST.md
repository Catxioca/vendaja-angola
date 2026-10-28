# Checklist de Preparação para Homologação AGT

> **Declaração Obrigatória:**
> **“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”**

---

## 1. Evidências Formais a Reunir Antes da Submissão

- [ ] **Esquema XSD Oficial Vigente**: Obtenção do ficheiro `.xsd` emitido diretamente pela AGT, com versionamento e proveniência documentados.
- [ ] **Especificação de Assinatura e Encriptação**: Confirmação das chaves, algoritmos (RSA-SHA256 ou superior) e certificados autorizados para o contribuinte.
- [ ] **Especificação Técnica do QR Code**: Verificação do formato de payload exigido pela AGT para inclusão no código QR gráfico impresso.
- [ ] **Amostragem Documental Fiscal**:
  - [ ] Fatura (FT) a pronto e a crédito.
  - [ ] Fatura-Recibo (FR) com liquidação direta.
  - [ ] Fatura Proforma (PF) identificada com a menção obrigatória "Este documento não serve de fatura".
  - [ ] Nota de Crédito (NC) com anulação parcial e total, referenciando o número da fatura de origem.
  - [ ] Nota de Débito (ND) com retificação de valor a favor do emitente.
  - [ ] Recibo (RC) de liquidação financeira de fatura a crédito.
  - [ ] Guia de Transporte (GT) com matrícula da viatura, morada de carga, morada de descarga e data/hora de partida.
- [ ] **Validação Automatizada do SAF-T AO**:
  - [ ] Exportação do ficheiro SAF-T de teste em formato XML.
  - [ ] Validação integral contra o XSD oficial da AGT (zero erros semânticos ou de sintaxe).
- [ ] **Segurança e Imutabilidade**:
  - [ ] Comprovação de que documentos fiscais e linhas emitidas não podem ser excluídos ou alterados no banco de dados (`assertImmutableFiscalMutation`).
  - [ ] Comprovação de encadeamento sequencial contínuo por série e filial sem saltos na numeração.
- [ ] **Isolamento de Dados Multiempresa**:
  - [ ] Evidência de testes de concorrência e isolamento no PostgreSQL (`tenant-isolation.integration.spec.ts`).
  - [ ] Garantia de que dados fiscais e movimentos de uma empresa não são acessíveis por outros contribuintes.
- [ ] **Revisão Técnica Contabilística**:
  - [ ] Validação dos planos de contas (PGCA) e diários de lançamentos pelo contabilista responsável.
  - [ ] Validação das taxas de IVA aplicadas e dos respetivos motivos e códigos de isenção.

---

## 2. Declaração Legal e Registo Institucional

Todas as peças técnicas, relatórios de auditoria e testes do ecossistema VendaJá Angola regem-se pela seguinte declaração:

**“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”**
