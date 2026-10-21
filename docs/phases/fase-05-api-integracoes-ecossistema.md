# Fase 5 — API Pública, Webhooks e Ecossistema de Integrações

## 1. Objetivo
Transformar o VendaJá Angola numa plataforma aberta e conectada, fornecendo APIs REST corporativas seguras, suporte a Webhooks em tempo real, gestão de API Keys, autenticação OAuth2 (RFC 6749) e SDKs oficiais em TypeScript, Python e C# (.NET).

## 2. Funcionalidades Implementadas
- **Gestão Segura de Chaves de API (`ApiKeyService`)**:
  - Geração de chaves públicas com prefixo padrão `vj_live_` e armazenamento de hash SHA-256 (a chave nunca é armazenada em texto simples).
  - Escopos granulares de permissão (`read:sales`, `write:sales`, `read:products`, `read:customers`).
  - Rate limiting com algoritmo de janela deslizante (Sliding Window) para prevenir sobrecarga.
- **Serviço de Autenticação OAuth2 / OIDC (`EnterpriseOAuthService`)**:
  - Fluxo de credenciais de cliente (`client_credentials`) para integrações máquina-para-máquina (M2M).
  - Emissão de tokens JWT assinados, introspeção de tokens (RFC 7662) e revogação/blacklist de tokens (RFC 7009).
- **Motor de Webhooks (`EnterpriseWebhookService`)**:
  - Subscrição de eventos do ERP (`sale.created`, `invoice.issued`, `stock.low`, `customer.payment`).
  - Assinatura criptográfica HMAC-SHA256 no cabeçalho `X-VendaJa-Signature` para validação de autenticidade pelo destinatário.
  - Retentativas automáticas exponenciais com registo de log de entrega HTTP.
- **Hub de Conectores e SDKs (`packages/sdk`)**:
  - Biblioteca cliente para TypeScript / JavaScript com suporte nativo a Node.js e browser.
  - Exemplos prontos para Python (`vendaja_python_sdk.py`) e C# (.NET) (`VendaJaCSharpClient.cs`).
  - Exportação de dados em CSV, JSON e XML estruturado.

## 3. Estado Atual
- **Status**: Produção / Estável.
- **Cobertura**: Validado na suite `src/services/api-integrations.spec.ts`.

## 4. Problemas Conhecidos
- Disparos massivos de webhooks para endpoints externos com alta latência podem causar acúmulo temporário na fila de envio se o destinatário demorar mais de 10 segundos a responder.

## 5. Melhorias Pendentes
- Suporte a GraphQL para consultas compostas personalizadas de clientes e produtos.
- Conectores pré-construídos para lojas virtuais Shopify, WooCommerce e Magento.
