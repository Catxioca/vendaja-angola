# Fase 1 — Estabilização e Fundação Empresarial

## 1. Objetivo
Garantir a estabilidade nuclear do ERP VendaJá Angola, eliminando inconsistências de cálculo fiscal, assegurando conformidade com os requisitos da Administração Geral Tributária (AGT), estabelecendo integridade de dados na cadeia de vendas do POS e implementando resiliência para operações offline-first.

## 2. Funcionalidades Implementadas
- **Cálculo Fiscal e Tributário AGT**:
  - Imposição de arredondamento comercial a duas casas decimais e integridade em cêntimos (`amountCents`).
  - Aplicação estrita da taxa de IVA geral (14%), taxas reduzidas e motivos de isenção AGT (M00, M02, M04).
  - Assinatura RSA de documentos com encadeamento de hash SHA-1 do documento anterior conforme regras AGT.
- **Auditoria de Venda e POS**:
  - Prevenção de recálculos indevidos durante a impressão térmica (80mm / 58mm) e A4.
  - Sincronização offline-first com fila local protegida por chave de idempotência UUID v4.
  - Deteção e tratamento automático de quebras de numeração e séries fiscais.
- **Bootstrap de Instalação e Multi-Empresa**:
  - Mecanismo seguro de provisionamento inicial de administrador sem credenciais hardcoded.
  - Suporte a seleção de contexto empresarial e filial autorizada via cabeçalhos validados.

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Todos os testes fiscais, de cálculo de troco e de arredondamento validados e integrados na suite de regressão contínua.

## 4. Problemas Conhecidos
- Em sistemas operacionais legados sem suporte a WebCrypto nativo, a inicialização da geração de chaves requer fallback seguro em software.
- Dispositivos térmicos de 58mm muito antigos podem necessitar de ajustes na tabela de caracteres ASCII para caracteres acentuados.

## 5. Melhorias Pendentes
- Integração direta com a API de submissão em tempo real de faturas da AGT quando disponibilizada publicamente.
- Suporte a impressão direta via protocolo ESC/POS binário raw sem intermediação do driver do sistema operacional.
