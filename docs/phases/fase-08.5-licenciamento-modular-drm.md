# Fase 8.5 — Sistema de Licenciamento Modular e Proteção DRM

## 1. Objetivo
Implementar um sistema corporativo de licenciamento em **dois níveis independentes** (Licença do Produto vs. Licença de Módulos), garantindo que todos os módulos do ERP estejam fisicamente instalados, mas apenas possam ser executados mediante licenças válidas assinadas criptograficamente por chave assimétrica RSA-2048, impedindo pirataria, ativações automáticas indevidas em atualizações e adulterações de relógio do sistema.

## 2. Funcionalidades Implementadas
- **Arquitetura de Licenciamento em Dois Níveis**:
  - **Nível 1 (Licença do Produto)**: Autoriza o arranque e operação base do ERP. Concede acesso unicamente a Login, Administração de Utilizadores, Gestão de Licenças, Configurações Gerais e Dados da Empresa. Não ativa nenhum módulo operacional.
  - **Nível 2 (Licença dos Módulos)**: Desbloqueia independentemente os módulos contratados:
    `DASHBOARD`, `POS`, `SALES`, `STOCKS`, `PURCHASES`, `TREASURY`, `ACCOUNTING`, `HR`, `CRM`, `DOCUMENTS`, `BI`, `REPORTS`.
- **Proteção Criptográfica e DRM Offline**:
  - Assinatura digital RSA-2048 com verificação via chave pública embutida (`public.pem`).
  - Amarração de hardware (Hardware Fingerprint) baseada em identificadores físicos do processador e placa-mãe.
  - Deteção de recuo de relógio do sistema operacional (Anti-Clock Tampering) com bloqueio preventivo.
  - Período de tolerância de 15 dias (Grace Period) com alertas visuais não intrusivos antes do bloqueio efetivo de expiração.
- **Preservação de Dados e Migrações Seguras**:
  - Motor de atualização (`update-migration-engine.ts`) que preserva a licença ativa, dados reais e configurações durante reinstalações ou updates, sem reintroduzir seeds ou dados fictícios em produção.
  - Painel de Gestão de Licenciamento no Desktop com upload de ficheiro de licença `.key` ou introdução de chave alfanumérica de ativação.

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Validado na suite `apps/desktop/src/license-modular.spec.ts` e `update-migration.spec.ts`.

## 4. Problemas Conhecidos
- Em máquinas virtuais com emulação de hardware dinâmico (onde UUID da BIOS se altera a cada boot), a licença deve ser gerada com identificador de nó estável.

## 5. Melhorias Pendentes
- Portal de ativação online em tempo real (Cloud Activation Server) com ativação automática em 1-clique sem necessidade de download manual do ficheiro `.key`.
- Gestão centralizada de revogação de licenças à distância (Remote License Revocation).
