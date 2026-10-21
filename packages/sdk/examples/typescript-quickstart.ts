/**
 * Exemplo de Integração TypeScript / Node.js com o VendaJá Angola ERP
 */
import { VendaJaClient } from "@angola/sdk";

async function main() {
  const client = new VendaJaClient({
    baseUrl: "http://localhost:4000/api/v1",
    apiKey: "vj_live_7f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
    companyId: "empresa-matriz-luanda",
  });

  console.log("=== 1. Consultar Catálogo de Produtos ===");
  const products = await client.products.list({ limit: 10 });
  console.log(`Encontrados ${products.data.length} produtos.`);

  console.log("=== 2. Cadastrar Novo Cliente Corporativo ===");
  const newCustomer = await client.customers.create({
    name: "Petróleo de Angola Lda",
    nif: "5419998877",
    email: "financeiro@petroangola.ao",
    phone: "+244923112233",
    creditLimitKz: 5000000,
  });
  console.log("Cliente criado com sucesso:", newCustomer.data.id);

  console.log("=== 3. Extrair Dataset de Vendas para Análise ===");
  const salesDataset = await client.bi.sales();
  console.log(`Carregadas ${salesDataset.count} transações analíticas.`);
}

main().catch(console.error);
