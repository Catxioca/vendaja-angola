# Conformidade fiscal e preparação AGT

## Estado

O VendaJá Angola está preparado como plataforma de piloto e de evolução para
homologação. Não é software homologado ou certificado pela Administração Geral
Tributária (AGT). Nenhuma tela, documento ou API deve declarar homologação antes
da aprovação formal aplicável.

## Confirmado por fonte oficial

O portal da AGT publica o regime jurídico das facturas e documentos equivalentes,
o serviço de consulta de NIF e o Sistema de Medição Fiscal. O guia tributário
publicado pela AGT descreve, entre outros pontos, numeração sequencial e
cronológica, emissão em duplicado e requisitos de arquivo. A equipa de
conformidade deve confirmar a versão vigente desses instrumentos antes do piloto.

## Implementado tecnicamente

- Contexto de empresa e filial em rotas operacionais.
- Séries e documentos comerciais segregados por contexto.
- Lançamentos contabilísticos e períodos com escopo de empresa/filial.
- Configuração fiscal por empresa, sem usar dados de outra empresa.
- Exportador SAF-T parametrizado por empresa/período; a validação sem XSD é
  exclusivamente estrutural e não comprova aceitação pela AGT.
- Outbox, sincronização idempotente, backup/restauro e trilhos de auditoria.

## Configurável pelo cliente/contabilista

- Dados legais da empresa, estabelecimento, séries, moeda e arredondamento.
- Regras de IVA, isenção e retenção depois de validação pelo contabilista.
- Certificado, chave e número de certificação quando oficialmente emitidos.
- Política de retenção e arquivo fiscal.

## Dependências externas obrigatórias

- XSD SAF-T AO vigente, obtido de fonte oficial e versionado fora de segredos.
- Especificação oficial de hash, código de controlo e payload QR.
- Processo e evidências exigidos pela AGT para homologação/certificação.
- Credenciais de serviços AGT, TPA/banco e equipamento físico, quando aplicável.
- Revisão do contabilista responsável e testes num ambiente autorizado.

## Proibição de suposições

Não introduzir códigos de isenção, limites de NIF, fórmulas de assinatura, texto
legal, endpoints AGT ou alegações de certificação sem fonte oficial identificada,
versão e aprovação do responsável de conformidade.

## Critério de entrada para homologação

Antes do pedido formal: migrations aplicadas em PostgreSQL descartável, testes de
isolamento multiempresa aprovados, documentos fiscais de amostra revistos,
SAF-T validado contra o XSD oficial fornecido, arquivo/restauro comprovados e
checklist de evidências preenchido.
