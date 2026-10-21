# Fase 4 — CRM Empresarial e Gestão Documental

## 1. Objetivo
Estruturar o relacionamento com clientes e fornecedores, proporcionando uma visão 360 graus de clientes (Customer 360), gestão completa do pipeline de oportunidades de venda (Lead-to-Cash), propostas comerciais e repositório centralizado de gestão documental corporativa (DMS).

## 2. Funcionalidades Implementadas
- **Visão 360º de Clientes e Fornecedores (`Customer360Service`)**:
  - Consolidação de saldo corrente, limite de crédito disponível, histórico de compras, faturas pendentes e volume total transacionado.
  - Indicador de risco de crédito e cálculo de pontualidade de pagamento (DSO - Days Sales Outstanding).
- **Pipeline de Vendas e Oportunidades (`EnterpriseCrmService`)**:
  - Etapas do funil: Prospeção, Qualificação, Apresentação da Proposta, Negociação, Ganha (`WON`) ou Perdida (`LOST`).
  - Associação de propostas comerciais com conversão direta em Faturas Proforma ou Faturas Fiscais no ERP.
- **Gestão Documental Centralizada (`EnterpriseDocumentService`)**:
  - Upload e versionamento de documentos comerciais (contratos, comprovativos bancários, certidões fiscais AGT).
  - Categorização, tags e pesquisa avançada por metadados.
  - Rastreabilidade de downloads e controlo de acesso restrito por permissões RBAC.

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Testado na suite `src/services/crm-documents.spec.ts`.

## 4. Problemas Conhecidos
- Pré-visualização de ficheiros de grande porte (> 50 MB) depende da largura de banda e capacidade de memória do cliente.

## 5. Melhorias Pendentes
- Reconhecimento ótico de caracteres (OCR) automático para leitura de faturas e comprovativos de transferência bancária em PDF e imagem.
- Integração de assinatura eletrónica qualificada com carimbo temporal legal.
