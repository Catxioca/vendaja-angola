# Conformidade Fiscal e Preparação para Homologação AGT

> **Declaração Obrigatória:**
> **“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”**

---

## 1. Estado do Software

O **VendaJá Angola** foi arquitetado e desenvolvido com rigor técnico para suportar os requisitos fiscais da República de Angola, servindo como plataforma de evolução para o processo formal de certificação e homologação junto da **Administração Geral Tributária (AGT)**.

O sistema **não é software homologado nem certificado pela AGT** no presente momento. Nenhuma interface gráfica, documento impresso, manifesto digital ou endpoint de API deve declarar certificação ou homologação prévia sem a respetiva publicação e deferimento pelo órgão tributário competente.

---

## 2. Pilares de Arquitetura Fiscal Implementados

### 2.1 Configuração Fiscal Segregada por Empresa e Filial
- A entidade `FiscalConfig` é persistida no PostgreSQL com chave única `companyId` e suporte opcional ao estabelecimento `branchId`.
- Parâmetros como NIF emitente, razão social, endereço fiscal, regime tributário, moeda base (AOA), fuso horário (`Africa/Luanda`) e anos de retenção de arquivo são isolados e nunca partilhados entre diferentes empresas.
- Segredos fiscais (chave privada PEM, certificados PFX, passphrases) são armazenados cifrados com algoritmo **AES-256-GCM** derivado de chave rotacionada (`FISCAL_CONFIG_KEY`).

### 2.2 Séries Fiscais por Empresa, Estabelecimento, Tipo Documental e Exercício
- A entidade `FiscalSequence` implementa a restrição de unicidade composta:
  `[companyId, branchScopeId, documentType, series, fiscalYear]`
- Garante numeração estritamente sequencial e cronológica contínua sem saltos (`nextFiscalNumber`).
- Suporta encerramento irreversível de séries com registo de data e operador (`closedAt`, `closedBy`).

### 2.3 Imutabilidade Estrita de Documentos Emitidos e Proibição de Cancelamento Direto
- O mecanismo central de integridade ([fiscal-integrity.ts](file:///c:/Users/g/copilot-worktrees/tmp-kinaxixi-v2/catxioca-didactic-enigma/apps/backend/src/services/fiscal-integrity.ts)) impede qualquer alteração física ou lógica de vendas e documentos fiscais emitidos.
- Proibições ativas:
  - Exclusão (`delete` / `deleteMany`) de `Sale`, `SaleLine`, `CommercialDocument` ou `CommercialDocumentLine` é sumariamente rejeitada.
  - Atualização (`update`) de campos protegidos (`number`, `series`, `type`, `subtotalCents`, `taxCents`, `totalCents`, `fiscalHash`, `customerNif`, `customerId`) é bloqueada.
  - **Bloqueio de Cancelamento Direto:** É estritamente proibido alterar o estado de documentos emitidos para `status: "CANCELLED"` ou preencher `cancelledAt`. Qualquer retificação, anulação ou estorno de fatura (FT) ou fatura-recibo (FR) exige obrigatoriamente a emissão de uma **Nota de Crédito (NC)** vinculada ao documento de origem, com reposição idempotente de stock e movimentos financeiros e contabilísticos auditados.

### 2.4 Fluxos Fiscais Segregados (FT, FR, NC, ND, RC, GT, PF)
A plataforma estabelece distinção formal entre documentos fiscais com relevância tributária e documentos operacionais:
- **FT (Fatura)**: Documento de débito comercial a crédito, liquidável por Recibo.
- **FR (Fatura-Recibo)**: Documento de pronto pagamento com liquidação imediata no ato.
- **NC (Nota de Crédito)**: Documento de retificação/crédito que exige referência formal à FT ou FR original.
- **ND (Nota de Débito)**: Documento de acréscimo de débito que exige referência à FT original.
- **RC (Recibo)**: Documento de quitação financeira de faturas a crédito emitidas.
- **GT (Guia de Transporte)**: Documento de circulação de mercadorias sujeito à política de circulação configurada pela empresa.
- **PF / FP (Fatura Proforma)**: Documento informativo de cotação/proposta comercial, explicitamente marcado como **sem valor fiscal**.

### 2.5 Motor de Cálculos Fiscais Baseado em Políticas Configuráveis
Nenhuma taxa de IVA, tabela de isenções, taxa de retenção ou regra de NIF é tratada como norma oficial irrevogável no código-fonte sem fonte oficial versionada. O motor de cálculo opera com base em **Políticas Fiscais por Empresa/Regime (`TenantFiscalPolicy`)**:
- **Taxas de IVA**: Configuráveis por empresa com código, taxa percentual, descrição e vigência temporal (ex.: 14%, 7%, 5%, 0% em regime provisório).
- **Tabela de Isenções**: Configurável por empresa (ex.: M00, M02, M04) com motivo de isenção e referência jurídica externa declarada.
- **Retenção na Fonte**: Configurável por tipo de serviço e empresa (ex.: taxa provisória referenciada de 6,5%), aplicável apenas a documentos de serviços elegíveis.
- **Descontos**: Descontos por linha e globais calculados de forma determinística, bloqueando valores superiores ao subtotal bruto.
- **Validação de NIF**: Configurável por regime da empresa (`ANGOLAN_STANDARD` com 10 caracteres ou `PERMISSIVE`, admitindo consumidor final).
- **Modos de Arredondamento**: Arredondamento monetário determinístico em cêntimos (`HALF_UP`, `HALF_EVEN` / bancário, `DOWN`).
- **Preços Brutos / Líquidos**: Suporte a preços com IVA incluído (com desagregação matemática `netGross / (1 + taxRate)`) e preços sem IVA.

### 2.6 QR Code Gráfico com Provider Versionado
- A geração gráfica do código QR é processada pelo motor nativo vetorial/matricial e validada por leitura ótica comprovada.
- O payload é gerado através do contrato versionado `FiscalQrProvider`.
- **Dependência Externa:** O formato atual do payload de QR code é uma estrutura provisória de engenharia; nenhuma especificação é declarada como oficial até publicação da regulamentação técnica formal pela AGT.

### 2.7 Cadeia de Hash Fiscal e Assinatura Criptográfica
- O cálculo do hash fiscal ([FiscalHashProvider](file:///c:/Users/g/copilot-worktrees/tmp-kinaxixi-v2/catxioca-didactic-enigma/apps/backend/src/services/fiscal.ts)) efetua o encadeamento determinístico com base no hash do documento imediatamente anterior (`previousHash`).
- O encadeamento é rigorosamente isolado por empresa, filial e série.
- **Dependência Externa:** Algoritmos criptográficos (SHA-1, SHA-256 ou RSA) e pares de chaves pública/privada de certificação dependem estritamente das diretrizes e certificados emitidos pela AGT durante o processo formal de homologação.

### 2.8 Exportador Estrutural de SAF-T AO e Validação contra XSD Oficial Externo
- O exportador SAF-T ([exportSaftAo](file:///c:/Users/g/copilot-worktrees/tmp-kinaxixi-v2/catxioca-didactic-enigma/apps/backend/src/services/fiscal.ts)) é um **exportador estrutural preparado para validação contra XSD oficial externo**.
- Gera a estrutura XML com isolamento estrito por tenant contendo `<Header>`, `<MasterFiles>`, `<GeneralLedgerEntries>` e `<SourceDocuments>`.
- **Portão Estrito de Produção:** Em ambiente de produção (`NODE_ENV === "production"`), o validador exige a configuração explícita de `SAFT_AO_XSD_PATH` apontando para o ficheiro XSD oficial da AGT. É expressamente proibido gerar ou utilizar schemas XSD simulados; se o XSD oficial não estiver configurado, a validação em produção é bloqueada (`official_saft_xsd_required_in_production`).

### 2.9 Arquivo Fiscal, Integridade SHA-256 e Retenção Mínima Legal
- Todas as exportações fiscais (SAF-T, encerramentos) são arquivadas na entidade `EnterpriseDocument` com hash SHA-256 da exportação e metadados de amostragem.
- O serviço de integridade ([fiscal-archive.service.ts](file:///c:/Users/g/copilot-worktrees/tmp-kinaxixi-v2/catxioca-didactic-enigma/apps/backend/src/services/fiscal-archive.service.ts)) valida se o ficheiro arquivado se mantém íntegro (`INTACT`) ou adulterado (`TAMPERED`).
- O período de retenção legal (configurável por empresa, com padrão de 10 anos dependente da legislação comercial/tributária em vigor) é estritamente fiscalizado, sendo terminantemente proibido o expurgo antecipado de ficheiros dentro do prazo de retenção legal.

### 2.10 Registo Obrigatório de Reimpressões (2.ª Via)
- Qualquer reimpressão de documento fiscal emitido é registada em base de dados com indicação do operador responsável, carimbo temporal e justificação detalhada com comprimento mínimo.
- O documento reimpresso exibe de forma compulsória a menção: *"2.ª via emitida em conformidade com o original"*.

---

## 3. Critérios Obrigatórios para Submissão à AGT

Antes de iniciar qualquer submissão de teste formal para homologação:
1. Executar as migrations Prisma numa base PostgreSQL descartável limpa.
2. Comprovar que os testes de concorrência e isolamento multiempresa estão 100% aprovados sem qualquer teste ignorado (SKIP).
3. Obter de canal oficial da AGT o schema XSD vigente do SAF-T AO e disponibilizá-lo em local seguro.
4. Rever as amostras de documentos (FT, FR, NC, ND, RC, GT, PF) com o contabilista certificado da organização.
5. Garantir a integridade da política de backup, restauro e expurgo de dados conforme a Lei n.º 22/11 de Protecção de Dados Pessoais.
