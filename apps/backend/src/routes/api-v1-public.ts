import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { requireApiAuth, type AuthenticatedApiRequest } from "../middleware/api-security.js";
import { EnterpriseWebhookService } from "../services/enterprise/webhook.service.js";

export const apiV1PublicRouter = Router();

const meta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / Math.max(1, limit)),
  apiVersion: "v1.4.0",
  timestamp: new Date().toISOString(),
});

function getCompanyFilter(req: Request) {
  const authReq = req as AuthenticatedApiRequest;
  const companyId = authReq.apiKey?.companyId || authReq.oauthClient?.companyId;
  return companyId ? { companyId } : {};
}

// ==========================================
// 1. CLIENTES (/customers)
// ==========================================
apiV1PublicRouter.get("/customers", requireApiAuth("API.Customers.Read"), async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = req.query.q ? String(req.query.q).trim() : "";
  const companyFilter = getCompanyFilter(req);

  try {
    const where = {
      ...companyFilter,
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { nif: { contains: search } }] } : {}),
    };
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" } }),
      prisma.customer.count({ where }),
    ]);
    res.json({ data: customers, meta: meta(page, limit, total) });
  } catch (error) {
    console.error("[api-v1/customers] query error:", error);
    res.status(500).json({ error: "customers_query_failed", message: "Não foi possível carregar os clientes." });
  }
});

apiV1PublicRouter.post("/customers", requireApiAuth("API.Customers.Write"), async (req: Request, res: Response) => {
  const { name, nif, email, phone, address, creditLimitKz } = req.body;
  if (!name) {
    res.status(400).json({ error: "missing_fields", message: "Nome do cliente é obrigatório" });
    return;
  }

  const authReq = req as AuthenticatedApiRequest;
  const companyId = authReq.apiKey?.companyId || authReq.oauthClient?.companyId || null;

  try {
    const customer = await prisma.customer.create({
      data: {
        companyId,
        name,
        nif: nif || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        creditLimitCents: Math.round(Number(creditLimitKz || 0) * 100),
        active: true,
      },
    });

    void EnterpriseWebhookService.dispatch("customer.created", { customerId: customer.id, name: customer.name, nif: customer.nif });
    res.status(201).json({ data: customer, meta: meta(1, 1, 1) });
  } catch (error) {
    console.error("[api-v1/customers] create error:", error);
    res.status(500).json({ error: "customer_create_failed", message: "Não foi possível registar o cliente no sistema." });
  }
});

apiV1PublicRouter.put("/customers/:id", requireApiAuth("API.Customers.Write"), async (req: Request, res: Response) => {
  const { name, nif, email, phone, address, active } = req.body;
  const customerId = String(req.params.id);
  try {
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: { name, nif, email, phone, address, active },
    });
    void EnterpriseWebhookService.dispatch("customer.updated", { customerId: updated.id, name: updated.name });
    res.json({ data: updated });
  } catch (error) {
    console.error("[api-v1/customers] update error:", error);
    res.status(500).json({ error: "customer_update_failed", message: "Não foi possível atualizar os dados do cliente." });
  }
});

apiV1PublicRouter.patch("/customers/:id", requireApiAuth("API.Customers.Write"), async (req: Request, res: Response) => {
  const customerId = String(req.params.id);
  try {
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: req.body,
    });
    res.json({ data: updated });
  } catch (error) {
    console.error("[api-v1/customers] patch error:", error);
    res.status(500).json({ error: "customer_patch_failed", message: "Não foi possível atualizar o cliente." });
  }
});

apiV1PublicRouter.delete("/customers/:id", requireApiAuth("API.Customers.Write"), async (req: Request, res: Response) => {
  const customerId = String(req.params.id);
  try {
    await prisma.customer.update({ where: { id: customerId }, data: { active: false } });
    res.json({ message: "Cliente inativado com sucesso" });
  } catch (error) {
    console.error("[api-v1/customers] delete error:", error);
    res.status(500).json({ error: "customer_delete_failed", message: "Não foi possível inativar o cliente." });
  }
});

// ==========================================
// 2. PRODUTOS & CATEGORIAS (/products)
// ==========================================
apiV1PublicRouter.get("/products", requireApiAuth("API.Products.Read"), async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const companyFilter = getCompanyFilter(req);

  try {
    const where = { ...companyFilter };
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { updatedAt: "desc" } }),
      prisma.product.count({ where }),
    ]);
    res.json({ data: products, meta: meta(page, limit, total) });
  } catch (error) {
    console.error("[api-v1/products] query error:", error);
    res.status(500).json({ error: "products_query_failed", message: "Não foi possível listar os produtos." });
  }
});

apiV1PublicRouter.post("/products", requireApiAuth("API.Products.Write"), async (req: Request, res: Response) => {
  const { name, sku, priceKz, costKz, stock, taxRate } = req.body;
  if (!name || !sku) {
    res.status(400).json({ error: "missing_fields", message: "Nome e SKU são obrigatórios" });
    return;
  }

  const authReq = req as AuthenticatedApiRequest;
  const companyId = authReq.apiKey?.companyId || authReq.oauthClient?.companyId || null;

  const payload = {
    companyId,
    name,
    sku,
    priceCents: Math.round(Number(priceKz || 1000) * 100),
    costCents: Math.round(Number(costKz || 500) * 100),
    stock: Number(stock || 0),
    taxRate: Number(taxRate || 0.14),
    active: true,
  };

  try {
    const product = await prisma.product.create({ data: payload });
    void EnterpriseWebhookService.dispatch("product.created", { productId: product.id, sku: product.sku, name: product.name });
    res.status(201).json({ data: product });
  } catch (error) {
    console.error("[api-v1/products] create error:", error);
    res.status(500).json({ error: "product_create_failed", message: "Não foi possível registar o produto." });
  }
});

apiV1PublicRouter.put("/products/:id", requireApiAuth("API.Products.Write"), async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  try {
    const product = await prisma.product.update({ where: { id: productId }, data: req.body });
    void EnterpriseWebhookService.dispatch("product.updated", { productId: product.id, sku: product.sku });
    res.json({ data: product });
  } catch (error) {
    console.error("[api-v1/products] update error:", error);
    res.status(500).json({ error: "product_update_failed", message: "Não foi possível atualizar o produto." });
  }
});

apiV1PublicRouter.patch("/products/:id", requireApiAuth("API.Products.Write"), async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  try {
    const product = await prisma.product.update({ where: { id: productId }, data: req.body });
    res.json({ data: product });
  } catch (error) {
    console.error("[api-v1/products] patch error:", error);
    res.status(500).json({ error: "product_patch_failed", message: "Não foi possível modificar o produto." });
  }
});

apiV1PublicRouter.delete("/products/:id", requireApiAuth("API.Products.Write"), async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  try {
    await prisma.product.update({ where: { id: productId }, data: { active: false } });
    res.json({ message: "Produto inativado com sucesso" });
  } catch (error) {
    console.error("[api-v1/products] delete error:", error);
    res.status(500).json({ error: "product_delete_failed", message: "Não foi possível inativar o produto." });
  }
});

// ==========================================
// 3. VENDAS & FATURAS (/sales & /invoices)
// ==========================================
apiV1PublicRouter.get("/sales", requireApiAuth("API.Sales.Read"), async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const companyFilter = getCompanyFilter(req);

  try {
    const where = { ...companyFilter };
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" }, include: { lines: true } }),
      prisma.sale.count({ where }),
    ]);
    res.json({ data: sales, meta: meta(page, limit, total) });
  } catch (error) {
    console.error("[api-v1/sales] query error:", error);
    res.status(500).json({ error: "sales_query_failed", message: "Não foi possível carregar as vendas." });
  }
});

apiV1PublicRouter.get("/invoices/:id", requireApiAuth("API.Sales.Read"), async (req: Request, res: Response) => {
  const invoiceId = String(req.params.id);
  const companyFilter = getCompanyFilter(req);

  try {
    const sale = await prisma.sale.findFirst({
      where: { id: invoiceId, ...companyFilter },
      include: { lines: true, customer: true },
    });
    if (!sale) {
      res.status(404).json({ error: "not_found", message: "Fatura não encontrada." });
      return;
    }
    res.json({ data: sale });
  } catch (error) {
    console.error("[api-v1/invoices] query error:", error);
    res.status(500).json({ error: "invoice_query_failed", message: "Não foi possível obter a fatura." });
  }
});

// ==========================================
// 4. FORNECEDORES & COMPRAS (/suppliers & /purchases)
// ==========================================
apiV1PublicRouter.get("/suppliers", requireApiAuth("API.Purchases.Read"), async (req: Request, res: Response) => {
  const companyFilter = getCompanyFilter(req);
  try {
    const suppliers = await prisma.supplier.findMany({ where: { ...companyFilter }, take: 50, orderBy: { name: "asc" } });
    res.json({ data: suppliers, meta: meta(1, 50, suppliers.length) });
  } catch (error) {
    console.error("[api-v1/suppliers] query error:", error);
    res.status(500).json({ error: "suppliers_query_failed", message: "Não foi possível carregar os fornecedores." });
  }
});

apiV1PublicRouter.get("/purchases", requireApiAuth("API.Purchases.Read"), async (req: Request, res: Response) => {
  const companyFilter = getCompanyFilter(req);
  try {
    const purchases = await prisma.purchase.findMany({ where: { ...companyFilter }, take: 50, orderBy: { purchasedAt: "desc" } });
    res.json({ data: purchases, meta: meta(1, 50, purchases.length) });
  } catch (error) {
    console.error("[api-v1/purchases] query error:", error);
    res.status(500).json({ error: "purchases_query_failed", message: "Não foi possível carregar as compras." });
  }
});

// ==========================================
// 5. STOCK & ARMAZÉNS (/stock)
// ==========================================
apiV1PublicRouter.get("/stock", requireApiAuth("API.Products.Read"), async (req: Request, res: Response) => {
  const companyFilter = getCompanyFilter(req);
  try {
    const stockBalances = await prisma.product.findMany({
      where: { ...companyFilter },
      select: { id: true, sku: true, name: true, stock: true, priceCents: true },
      take: 100,
    });
    res.json({ data: stockBalances, meta: meta(1, 100, stockBalances.length) });
  } catch (error) {
    console.error("[api-v1/stock] query error:", error);
    res.status(500).json({ error: "stock_query_failed", message: "Não foi possível consultar os saldos de stock." });
  }
});

// ==========================================
// 6. RECURSOS HUMANOS (/hr/employees)
// ==========================================
apiV1PublicRouter.get("/hr/employees", requireApiAuth("API.Accounting.Read"), async (req: Request, res: Response) => {
  const companyFilter = getCompanyFilter(req);
  try {
    const employees = await prisma.employee.findMany({ where: { ...companyFilter }, take: 50, orderBy: { fullName: "asc" } });
    res.json({ data: employees, meta: meta(1, 50, employees.length) });
  } catch (error) {
    console.error("[api-v1/hr/employees] query error:", error);
    res.status(500).json({ error: "employees_query_failed", message: "Não foi possível carregar os colaboradores." });
  }
});

// ==========================================
// 7. RELATÓRIOS & TESOURARIA (/reports & /treasury)
// ==========================================
apiV1PublicRouter.get("/reports/summary", requireApiAuth("API.Accounting.Read"), async (req: Request, res: Response) => {
  const companyFilter = getCompanyFilter(req);
  try {
    const [salesAgg, purchasesAgg, productsAgg] = await Promise.all([
      prisma.sale.aggregate({ where: { ...companyFilter }, _sum: { totalCents: true, taxCents: true } }),
      prisma.purchase.aggregate({ where: { ...companyFilter }, _sum: { totalCents: true } }),
      prisma.product.findMany({ where: { ...companyFilter }, select: { stock: true, costCents: true } }),
    ]);

    const totalSalesKz = (salesAgg._sum.totalCents || 0) / 100;
    const totalPurchasesKz = (purchasesAgg._sum.totalCents || 0) / 100;
    const vatPayableKz = (salesAgg._sum.taxCents || 0) / 100;
    const inventoryValuationKz = productsAgg.reduce((sum, p) => sum + ((p.stock || 0) * (p.costCents || 0)), 0) / 100;

    res.json({
      data: {
        totalSalesKz,
        totalPurchasesKz,
        vatPayableKz,
        inventoryValuationKz,
        period: "REALTIME",
      },
      meta: meta(1, 1, 1),
    });
  } catch (error) {
    console.error("[api-v1/reports/summary] error:", error);
    res.status(500).json({ error: "reports_summary_failed", message: "Não foi possível gerar o resumo financeiro." });
  }
});
