# Fase 9 — Ecossistema Digital: Portais Web Self-Service e Mobile ERP

## 1. Objetivo
Transformar o VendaJá Angola numa plataforma digital omnichannel completa, permitindo que clientes, fornecedores, colaboradores e gestores executivos interajam com o ERP através de portais web self-service dedicados e aplicações móveis corporativas (Android e iOS) com suporte offline-first.

## 2. Funcionalidades Implementadas
- **Portal do Cliente (Customer Self-Service Web & PWA)**:
  - Extrato de conta corrente contínuo com cálculo cronológico de saldo corrido.
  - Geração de referências de pagamento Multicaixa GPO / Express (Entidade `00142`) e dados de transferência bancária BAI e BFA.
  - Consulta e download de faturas (FT), recibos (RC) e notas de crédito (NC).
  - Atualização autónoma de perfil de contacto e endereço com trilha de auditoria.
- **Portal do Fornecedor (Supplier Self-Service Web & PWA)**:
  - Consulta de Ordens de Compra (OC) adjudicadas e respetivo estado.
  - Acompanhamento de receções de mercadoria em cais (Goods Receipts).
  - Submissão eletrónica de faturas comerciais de fornecedores para conferência da contabilidade.
- **Portal do Colaborador (RH Employee Self-Service Web & PWA)**:
  - Gestão de Férias segundo a **Lei Geral do Trabalho de Angola (LGT - Lei n.º 12/23)** com direito anual estrito a **22 dias úteis**, controlo de dias gozados, agendados e remanescentes.
  - Submissão de pedidos de ausência integrados no motor de workflows de aprovação.
  - Recibos de vencimento detalhados com discriminação de salário base, subsídios, retenção na fonte de **IRT progressivo** e dedução de **3% para o INSS**.
- **Aplicação Móvel do ERP (Android & iOS — Executivo & CRM)**:
  - Cockpit Executivo de Business Intelligence para Diretores e C-Levels.
  - Centro de Aprovações em 1-Toque (Compras, Despesas, Férias, Movimentos de Stock).
  - CRM Móvel com registo de visitas a clientes georreferenciadas com **coordenadas GPS reais (latitude/longitude)**, notas comerciais e **captura de assinatura digital no ecrã**.
  - Registo de chamadas efetuadas e histórico de interações.
- **Modo Offline Móvel e Sincronização em Lote**:
  - Armazenamento local de ações na app móvel protegido por chave de idempotência UUID v4.
  - Sincronização automática em lote (`POST /api/v1/portals/mobile/sync/batch`) com desduplicação atómica no servidor e tolerância a falhas na rede móvel.
- **Interface Unificada Omnichannel Suite**:
  - Barra de navegação superior instalada em `apps/web/src/main.tsx`, permitindo alternar de forma transparente entre o ERP Comercial, Portal do Cliente, Portal do Fornecedor, Portal do Colaborador e o simulador interativo do Mobile ERP.

## 3. Estado Atual
- **Status**: Produção / Validado (`24/24` testes específicos da Fase 9 e `189/189` testes globais de regressão aprovados com 100% de sucesso).

## 4. Problemas Conhecidos
- A captura de GPS em browsers de desktop simula as coordenadas do ISP caso o utilizador não possua hardware de geolocalização por satélite.

## 5. Melhorias Pendentes
- Empacotamento nativo com Capacitor/Cordova para distribuição direta na Google Play Store e Apple App Store.
- Integração biométrica nativa (Face ID / Touch ID / Leitor de Impressão Digital) para autenticação rápida no aplicativo móvel.
