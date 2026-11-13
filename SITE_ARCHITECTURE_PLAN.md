# Plano de Arquitetura do Site Institucional — VendaJá Angola

**Declaração obrigatória:**
> **“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”**

---

## 1. Visão Geral e Objetivos

O projeto **VendaJá Angola** possui um ecossistema operacional de excelência (Desktop, Web ERP, Mobile ERP/POS touch, portais self-service e backend escalável com PostgreSQL). No entanto, o acesso pela web atualmente apresenta de imediato a tela de autenticação do ERP ou redireciona para a aplicação mobile, sem dispor de uma presença pública institucional estruturada.

O objetivo deste plano é projetar a introdução do **Site Institucional VendaJá Angola** em `apps/web`:
1. **Sem duplicar o ERP Web**: Reutilizar rigorosamente os componentes, design system, tokens e infraestrutura existentes.
2. **Sem quebrar funcionalidades ou rotas existentes**: Preservar integralmente o acesso ao ERP completo (`#erp`), Mobile ERP (`#mobile-erp`), aos 6 portais self-service (`#portal-*`), ao formulário de bootstrap inicial e às capacidades PWA offline.
3. **Com total transparência e rigor regulatório**: Apresentar capacidades reais da plataforma, sem dados fictícios de parceiros ou clientes, e mantendo em destaque o enquadramento fiscal legal.

---

## 2. Inventário de Rotas

### 2.1. Rotas Públicas Institucionais (A Introduzir)

| Rota / Path | Hash Alias | Descrição e Finalidade | Acesso |
| :--- | :--- | :--- | :--- |
| `/` | `#home` | **Página Inicial (Landing Page)**: Proposta de valor soberana para o comércio angolano, arquitetura híbrida (offline-first + cloud), pilares técnicos e chamadas de ação (CTA). | Público |
| `/solucoes` | `#solucoes` | **Soluções Verticais**: Retalho, restauração, grossistas, prestação de serviços, empresas multi-loja e cooperativas. | Público |
| `/modulos` | `#modulos` | **Catálogo de Módulos**: Mapeamento fiel do `MODULE_CATALOG` oficial (POS, Stock, Contabilidade, Compras, CRM, RH, Sede Corporativa, Muambuluisha IA). | Público |
| `/seguranca` | `#seguranca` | **Segurança & Governação**: Isolamento multi-tenant, cofre local criptografado (AES-GCM), trilhas de auditoria imutáveis e conformidade com a LGPD/proteção de dados. | Público |
| `/conformidade-fiscal` | `#conformidade-fiscal` | **Enquadramento Fiscal**: Esclarecimento transparente da preparação para homologação, hash encadeado SHA-1, geração de SAF-T AO e arquivo decenal legal. | Público |
| `/sobre` | `#sobre` | **Sobre o VendaJá Angola**: Missão institucional de autonomia tecnológica para o tecido empresarial nacional, arquitetura de engenharia resiliente e equipa técnica. | Público |
| `/contacto` | `#contacto` | **Contacto & Demonstração**: Formulário institucional de contacto comercial, suporte técnico e canais oficiais de comunicação. | Público |
| `/entrar` | `#entrar` ou `#login` | **Pórtico de Acesso Unificado**: Ponto central de entrada para operadores do ERP Web, utilizadores dos Portais e atalho para download do instalador Desktop. | Público |
| `/criar-conta` | `#criar-conta` | **Bootstrap de Administrador Inicial**: Interface protegida que consome `GET /api/v1/auth/bootstrap/status` e permite inicializar o primeiro tenant e utilizador ADMIN se o sistema estiver virgem. | Condicional (apenas se `bootstrapAllowed === true`) |

### 2.2. Rotas e Vistas Autenticadas Preservadas

| Rota / Hash | Finalidade | Nível de Acesso / RBAC |
| :--- | :--- | :--- |
| `/app` ou `#erp` | **ERP Web Completo**: Ambiente de gestão administrativa e operacional com 20 módulos ativos, sidebar lateral categorizada e suporte a licenças modulares. | Autenticado (`ADMIN`, `MANAGER`, `OPERATOR`, `ACCOUNTANT`, `STOCK`) |
| `#mobile-erp` | **Mobile ERP & POS Touch**: Interface adaptativa para smartphones e tablets em modo balcão dividido, outbox idempotente e suporte a PIN rápido. | Autenticado / Offline com sessão prévia |
| `#portal-cliente` | **Portal do Cliente**: Consulta de faturas, conta corrente, extrato de crédito e pagamentos por referência Multicaixa. | Autenticado (Perfil `CUSTOMER`) |
| `#portal-fornecedor`| **Portal do Fornecedor**: Visualização de ordens de compra, confirmação de entregas físicas e submissão de faturas. | Autenticado (Perfil `SUPPLIER`) |
| `#portal-colaborador`| **Portal do Colaborador**: Recibos de vencimento, consulta de férias, registo de faltas e pedidos de adiantamento. | Autenticado (Perfil `EMPLOYEE`) |
| `#portal-rh` | **Portal de Recursos Humanos**: Processamento salarial interno, cálculo de IRT/INSS e gestão de contratos. | Autenticado (`ADMIN`, `MANAGER`, `ACCOUNTANT`) |
| `#portal-comercial` | **Portal Comercial**: Pipeline de clientes, gestão de oportunidades e propostas comerciais. | Autenticado (`ADMIN`, `MANAGER`, `OPERATOR`) |
| `#portal-admin` | **Portal Administrativo**: Governação multiempresa, gestão de utilizadores e visualização de logs forenses. | Autenticado exclusivamente para `ADMIN` |
| `#copilot` | **Muambuluisha IA**: Assistente contextual corporativo inteligente com dados em tempo real da empresa. | Autenticado (`ADMIN`, `MANAGER`) |

---

## 3. Mapa de Navegação e Arquitetura de Informação

```
[ Visitante / Navegador Web ]
             │
             ▼
      ┌───────────────┐
      │  Header Web   │ ── [ Logo VendaJá Angola ] ──> / (Home)
      └───────┬───────┘
              │
    ┌─────────┴─────────────────────────────────────────┐
    │                                                   │
    ├─> /solucoes ............ [ Verticais de Negócio ] │
    ├─> /modulos ............. [ Catálogo Oficial ]     │
    ├─> /seguranca ........... [ Governação & Cripto ]  │
    ├─> /conformidade-fiscal . [ Transparência AGT ]    │
    ├─> /sobre ............... [ Missão Soberana ]      │
    ├─> /contacto ............ [ Formulário Suporte ]   │
    │                                                   │
    └─> [ Botão "Entrar no ERP" ]                       │
                 │                                      │
                 ▼                                      │
         ┌───────────────┐                              │
         │   /entrar     │ ── [ Criar Conta Inicial ] ──┼──> /criar-conta (Se virgem)
         └───────┬───────┘                              │
                 │                                      │
                 ▼ (Autenticado com sucesso)            │
     ┌───────────────────────┐                          │
     │  Seleção de Contexto  │                          │
     │      Multiempresa     │                          │
     └───────────┬───────────┘                          │
                 │                                      │
                 ├───────────────────────────────┐      │
                 ▼                               ▼      │
         [ ERP Web Desktop ]            [ Mobile ERP ]  │
           (Painel Lateral)             (Touch / Tablet)│
                 │                                      │
                 ▼                                      │
       [ 6 Portais Integrados ] <───────────────────────┘
       (Cliente, Fornecedor, etc.)
```

---

## 4. Fronteira Rigorosa Entre Conteúdo Público e ERP Autenticado

1. **Isolamento de Estado e Sessão:**
   - As páginas públicas operam em modo **estático e sem estado de utilizador**, não realizando chamadas a endpoints que exijam Bearer token.
   - Apenas verificam o estado de bootstrap via `GET /api/v1/auth/bootstrap/status` (endpoint público desenhado para esse efeito).
2. **Navegação Híbrida (Path Routing + Hash Routing Compatível):**
   - O site institucional suporta URLs limpas (`/`, `/solucoes`, `/modulos`, `/seguranca`, `/conformidade-fiscal`, `/sobre`, `/contacto`, `/entrar`).
   - Graças à diretiva `/* /index.html 200` presente em `apps/web/public/_redirects`, o carregamento direto ou refresh de rotas com path é totalmente suportado.
   - O roteador interno reconhece tanto `window.location.pathname` quanto `window.location.hash` (`#erp`, `#mobile-erp`, etc.), garantindo retrocompatibilidade com links existentes, aplicações móveis Capacitor e bookmarks de utilizadores.
3. **Barreira de Autenticação para Módulos de Gestão:**
   - O componente `DesktopErpApp` e os componentes dos portais permanecem resguardados atrás da validação de token em `localStorage` e resposta `200` nas APIs do backend.
   - Qualquer tentativa de acesso a módulos operacionais sem sessão ativa redireciona imediatamente para o ecrã `/entrar`.

---

## 5. Matriz “Existe / Falta / Reutilizar”

| Elemento / Funcionalidade | Estado Atual | Ação na Evolução | Ficheiros Envolvidos |
| :--- | :---: | :--- | :--- |
| **Componentes ERP Web** | **Existe** | **Reutilizar integralmente** no modo autenticado. | `apps/web/src/desktop/renderer.tsx`, `panels.tsx` |
| **Portais Self-Service** | **Existe** | **Reutilizar integralmente**, linkando-os no pórtico `/entrar`. | `apps/web/src/CustomerPortal.tsx`, etc. |
| **Bootstrap Admin Form** | **Existe** | **Reutilizar** em `/criar-conta`, estilizado com o layout institucional. | `apps/web/src/BootstrapAccountForm.tsx` |
| **Design System & Tokens** | **Existe** | **Reutilizar** paleta (`#0f172a`, `#0284c7`, `#0f766e`, `#f8fafc`). | `apps/web/src/desktop/style.css`, `style.css` |
| **Contratos de Dados** | **Existe** | **Reutilizar** `@angola/shared` (tipos, moedas, fiscalidade). | `packages/shared/src/index.ts` |
| **PWA Service Worker** | **Existe** | **Reutilizar**, mantendo Network-First para rotas públicas e shell. | `apps/web/public/sw.js` |
| **Roteador Institucional** | **Falta** | **Implementar** roteamento leve sem dependências externas adicionais. | `apps/web/src/main.tsx` / `router.tsx` |
| **Header/Footer Público** | **Falta** | **Implementar** navegação institucional com menu responsivo e aviso AGT. | `apps/web/src/components/SiteHeader.tsx`, `SiteFooter.tsx` |
| **Páginas Institucionais** | **Falta** | **Implementar** Home, Soluções, Módulos, Segurança, Fiscal, Sobre, Contacto. | `apps/web/src/pages/*` |
| **Metatags de SEO** | **Falta** | **Implementar** metadados completos em `index.html` e gestão de tags por página. | `apps/web/index.html` |

---

## 6. Plano de Implementação: Etapas 2 a 8

### Etapa 2 — Roteador e Estrutura Base do Site Institucional
- Implementar o controlador de navegação universal (`History API` + `Hash Fallback`).
- Construir os componentes estruturais comuns: `SiteHeader` (com logo, navegação, seletor de tema/modo e CTA "Entrar") e `SiteFooter` (com sitemap, links de contacto, versão `3.2.2-rc.3` e declaração AGT mandatória).
- Garantir que utilizadores que acedam a rotas do ERP (`#erp`, `#mobile-erp`, `#portal-*`) mantenham comportamento 100% inalterado.

### Etapa 3 — Página Inicial (Landing Page `/`)
- **Hero Section**: Comunicação da proposta de valor — faturação e gestão comercial soberana, híbrida (funciona offline e sincroniza na nuvem).
- **Pilares Principais**:
  - Resiliência Operacional (continua a vender mesmo sem internet);
  - Conformidade Fiscal Nacional (preparado para homologação AGT);
  - Omnichannel & Multiempresa (gestão centralizada de lojas e filiais);
  - Suporte Multiplataforma (Windows Desktop, Web, Android Tablet e Smartphone).
- **Seção de Chamada para Ação**: Acesso imediato ao sistema ou agendamento de contacto.

### Etapa 4 — Páginas de Soluções e Módulos (`/solucoes` e `/modulos`)
- **/solucoes**: Apresentar casos de uso reais (Supermercados/Mercearias, Restaurantes/Cafés, Farmácias/Armazéns, Prestadores de Serviços e Pequenas/Médias Empresas).
- **/modulos**: Apresentação visual e descritiva dos 20 módulos do catálogo canónico (`MODULE_CATALOG`), destacando POS, Inventário com Custo Médio Ponderado, Faturação Eletrónica, Contabilidade Integrada e Centro Corporativo.

### Etapa 5 — Segurança e Conformidade Fiscal (`/seguranca` e `/conformidade-fiscal`)
- **/seguranca**: Explicar a arquitetura de isolamento por tenant, criptografia local AES-GCM em terminais móveis, RBAC hierárquico estrito e auditoria forense de ações críticas.
- **/conformidade-fiscal**: Exposição honesta do enquadramento perante o Regime Geral de Faturação de Angola, geração de ficheiros de auditoria SAF-T (AO), arquivo fiscal digital com garantia de retenção legal por 10 anos, e presença indelével da advertência obrigatória:
  > *“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”*

### Etapa 6 — Páginas Institucionais: Sobre Nós e Contacto (`/sobre` e `/contacto`)
- **/sobre**: Visão do projeto VendaJá Angola: desenvolvimento de software de alta resiliência adaptado às realidades de infraestrutura locais (conectividade intermitente, energia, equipamentos térmicos).
- **/contacto**: Formulário de contacto comercial e suporte com validação acessível no cliente (nome, empresa, email, telefone, província e mensagem) e dados oficiais de comunicação.

### Etapa 7 — Pórtico de Acesso Unificado e Bootstrap Seguro (`/entrar` e `/criar-conta`)
- **/entrar**: Tela de login aprimorada, permitindo acesso ao ERP Web, links diretos para os Portais Self-Service e opção de download do instalador Windows x64.
- **/criar-conta**: Rota dedicada que integra o componente `BootstrapAccountForm`. Caso o backend informe que o bootstrap já foi concluído (`bootstrapAllowed === false`), exibe mensagem explicativa e impede registo avulso.

### Etapa 8 — Auditoria Final, SEO, Práticas de Acessibilidade e Gates
- Revisão de semântica HTML5, contraste de cores e navegação por teclado.
- Configuração de metatags OpenGraph, Twitter Cards e dados estruturados JSON-LD.
- Execução de testes de regressão: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:web`.

---

## 7. Análise de Riscos de Segurança e Salvaguardas

1. **Risco de Fuga de Dados Privados:**
   - *Mitigação:* Nenhuma página institucional pública deve consumir endpoints privados ou conter referências a bases de dados internas, chaves de API, credenciais ou segredos em bundles JS.
2. **Risco de Abuso no Bootstrap (`/criar-conta`):**
   - *Mitigação:* A criação da conta inicial depende exclusivamente da validação atómica no backend (`POST /api/v1/auth/bootstrap`). Se existirem utilizadores registados, o backend rejeita com HTTP 403 `bootstrap_already_completed`.
3. **Risco de Spam no Formulário de Contacto:**
   - *Mitigação:* Validação estrita de formato de inputs no cliente com campos honeypot anti-bot e limitação de tentativas sem inclusão de scripts de terceiros invasivos.
4. **Risco de Afirmações Enganosas:**
   - *Mitigação:* Nenhuma página alegará homologação AGT ativa ou integrações bancárias diretas não formalizadas. A menção mandatória deve figurar de forma visível em todas as páginas públicas e no rodapé geral.

---

## 8. Conteúdo que Exige Aprovação Jurídica e Comercial

Antes de publicação em ambiente de produção público, os seguintes elementos devem ser homologados formalmente pelos responsáveis jurídicos e executivos da organização:
- **Termos de Uso e Política de Privacidade:** Documentação legal regulando o tratamento de dados segundo a legislação angolana.
- **Tabela de Preços e Condições Comerciais:** Planos de subscrição de licenças (Starter, Professional, Enterprise) e serviços de suporte/consultoria.
- **Canais Oficiais de Atendimento:** Linhas telefónicas, morada física oficial em Luanda/Angola e email corporativo de suporte.
- **Processo Formal AGT:** Monitorização do estado do processo de homologação do software para transição da declaração provisória para número de certificação oficial no momento em que for emitido.

---

## 9. Dependências Externas

O site institucional será construído **sem adicionar nenhuma nova dependência pesada de terceiros** (sem bibliotecas externas de UI desnecessárias ou frameworks pesados de analytics). Reutilizar-se-ão:
- React 19 (já presente no workspace);
- TypeScript 5.7+ (já presente);
- Vite 6 (já presente);
- CSS moderno nativo (Grid, Flexbox, Custom Properties) e ícones SVG leves já contidos no repositório.

---

**Fim do Plano de Arquitetura do Site Institucional VendaJá Angola.**
