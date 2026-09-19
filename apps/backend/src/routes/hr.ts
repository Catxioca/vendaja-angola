import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";

const employeeSchema = z.object({
  fullName: z.string().min(2).max(160),
  nif: z.string().max(20).optional().nullable(),
  inss: z.string().max(30).optional().nullable(),
  position: z.string().min(1).max(120),
  department: z.string().max(120).optional().nullable(),
  contractType: z.enum(["FIXED", "PART_TIME", "TEMPORARY", "INTERNSHIP"]).default("FIXED"),
  iban: z.string().max(50).optional().nullable(),
  baseSalaryCents: z.number().int().nonnegative(),
  foodAllowanceCents: z.number().int().nonnegative().default(0),
  transportAllowanceCents: z.number().int().nonnegative().default(0),
  housingAllowanceCents: z.number().int().nonnegative().default(0),
  otherAllowancesCents: z.number().int().nonnegative().default(0),
  foodAllowanceExempt: z.boolean().default(true),
  transportAllowanceExempt: z.boolean().default(true),
  housingAllowanceExempt: z.boolean().default(false),
  otherAllowancesExempt: z.boolean().default(false),
  active: z.boolean().optional(),
});

const payrollSchema = z.object({
  employeeId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

function calculateIrt(taxableCents: number): number {
  const brackets = [
    { min: 0, max: 500000, rate: 0 },
    { min: 500000, max: 1500000, rate: 0.1 },
    { min: 1500000, max: 3500000, rate: 0.15 },
    { min: 3500000, max: 7000000, rate: 0.2 },
    { min: 7000000, max: Number.POSITIVE_INFINITY, rate: 0.25 },
  ];
  let tax = 0;
  for (const bracket of brackets) {
    const taxableBase = Math.max(taxableCents - bracket.min, 0);
    const taxable = Math.min(taxableBase, bracket.max - bracket.min);
    tax += taxable * bracket.rate;
  }
  return Math.round(tax);
}

function calculatePayroll(employee: { baseSalaryCents: number; foodAllowanceCents: number; transportAllowanceCents: number; housingAllowanceCents: number; otherAllowancesCents: number; foodAllowanceExempt: boolean; transportAllowanceExempt: boolean; housingAllowanceExempt: boolean; otherAllowancesExempt: boolean; }) {
  const grossSalaryCents = employee.baseSalaryCents + employee.foodAllowanceCents + employee.transportAllowanceCents + employee.housingAllowanceCents + employee.otherAllowancesCents;
  // Angola exemption: food and transport are exempt up to 30,000 Kz each; only excess is taxable.
  const allowanceExemptionCapCents = 3_000_000;
  const foodTaxableCents = Math.max(0, employee.foodAllowanceCents - allowanceExemptionCapCents);
  const transportTaxableCents = Math.max(0, employee.transportAllowanceCents - allowanceExemptionCapCents);
  const taxableAllowancesCents = foodTaxableCents + transportTaxableCents
    + (employee.housingAllowanceExempt ? 0 : employee.housingAllowanceCents)
    + (employee.otherAllowancesExempt ? 0 : employee.otherAllowancesCents);
  // INSS is assessed on salary plus taxable allowances; exempt benefits are excluded.
  const inssBaseCents = employee.baseSalaryCents + taxableAllowancesCents;
  const inssEmployeeCents = Math.round(inssBaseCents * 0.03);
  const inssEmployerCents = Math.round(inssBaseCents * 0.08);
  const irtCents = calculateIrt(Math.max(0, inssBaseCents - inssEmployeeCents));
  const netSalaryCents = Math.max(0, grossSalaryCents - inssEmployeeCents - irtCents);
  return { grossSalaryCents, taxableAllowancesCents, inssEmployeeCents, inssEmployerCents, irtCents, netSalaryCents };
}

export const hrRouter = Router();
hrRouter.use(requireAuth);
hrRouter.use(requireModuleAccess("HR"));

hrRouter.get("/employees", async (_req, res) => {
  const employees = await prisma.employee.findMany({ orderBy: { fullName: "asc" } });
  res.json(employees);
});

hrRouter.post("/employees", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR"), async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_employee", details: parsed.error.flatten() });
    return;
  }

  const employee = await prisma.employee.create({ data: parsed.data });
  await audit("EMPLOYEE_CREATED", (req as AuthRequest).user?.id, "EMPLOYEE", employee.id, parsed.data);
  res.status(201).json(employee);
});

hrRouter.patch("/employees/:id", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR"), async (req, res) => {
  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_employee_update" });
    return;
  }

  const employee = await prisma.employee.update({
    where: { id: String(req.params.id) },
    data: parsed.data,
  });
  await audit("EMPLOYEE_UPDATED", (req as AuthRequest).user?.id, "EMPLOYEE", employee.id, parsed.data);
  res.json(employee);
});

hrRouter.get("/payrolls", async (_req, res) => {
  const rows = await prisma.payroll.findMany({
    orderBy: { createdAt: "desc" },
    include: { employee: true },
  });
  res.json(rows);
});

hrRouter.post("/payrolls/compute", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR"), async (req, res) => {
  const parsed = payrollSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payroll_request", details: parsed.error.flatten() });
    return;
  }

  const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee) {
    res.status(404).json({ error: "employee_not_found" });
    return;
  }

  const values = calculatePayroll(employee);
  const row = await prisma.payroll.upsert({
    where: { employeeId_month: { employeeId: employee.id, month: parsed.data.month } },
    update: {
      salaryBaseCents: employee.baseSalaryCents, foodAllowanceCents: employee.foodAllowanceCents, transportAllowanceCents: employee.transportAllowanceCents, housingAllowanceCents: employee.housingAllowanceCents, otherAllowancesCents: employee.otherAllowancesCents,
      taxableAllowancesCents: values.taxableAllowancesCents, grossSalaryCents: values.grossSalaryCents, inssEmployeeCents: values.inssEmployeeCents, inssEmployerCents: values.inssEmployerCents, irtCents: values.irtCents, netSalaryCents: values.netSalaryCents, status: "APPROVED", payDate: new Date(),
    },
    create: {
      employeeId: employee.id,
      month: parsed.data.month,
      salaryBaseCents: employee.baseSalaryCents,
      foodAllowanceCents: employee.foodAllowanceCents,
      transportAllowanceCents: employee.transportAllowanceCents,
      housingAllowanceCents: employee.housingAllowanceCents,
      otherAllowancesCents: employee.otherAllowancesCents,
      grossSalaryCents: values.grossSalaryCents,
      taxableAllowancesCents: values.taxableAllowancesCents,
      inssEmployeeCents: values.inssEmployeeCents,
      inssEmployerCents: values.inssEmployerCents,
      irtCents: values.irtCents,
      netSalaryCents: values.netSalaryCents,
      status: "APPROVED",
      payDate: new Date(),
    },
  });
  await audit("PAYROLL_CREATED", (req as AuthRequest).user?.id, "PAYROLL", row.id, { employeeId: employee.id, month: parsed.data.month });
  res.status(201).json({ ...row, payslip: { employee: employee.fullName, nif: employee.nif, month: parsed.data.month, grossSalaryCents: row.grossSalaryCents, netSalaryCents: row.netSalaryCents, irtCents: row.irtCents, inssEmployeeCents: row.inssEmployeeCents } });
});

hrRouter.post("/payrolls/process-month", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR"), async (req, res) => {
  const parsed = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_payroll_month" }); return; }
  const employees = await prisma.employee.findMany({ where: { active: true } });
  const results = [];
  for (const employee of employees) {
    const values = calculatePayroll(employee);
    const row = await prisma.payroll.upsert({ where: { employeeId_month: { employeeId: employee.id, month: parsed.data.month } }, update: { taxableAllowancesCents: values.taxableAllowancesCents, grossSalaryCents: values.grossSalaryCents, inssEmployeeCents: values.inssEmployeeCents, inssEmployerCents: values.inssEmployerCents, irtCents: values.irtCents, netSalaryCents: values.netSalaryCents, status: "APPROVED", payDate: new Date() }, create: { employeeId: employee.id, month: parsed.data.month, salaryBaseCents: employee.baseSalaryCents, foodAllowanceCents: employee.foodAllowanceCents, transportAllowanceCents: employee.transportAllowanceCents, housingAllowanceCents: employee.housingAllowanceCents, otherAllowancesCents: employee.otherAllowancesCents, taxableAllowancesCents: values.taxableAllowancesCents, grossSalaryCents: values.grossSalaryCents, inssEmployeeCents: values.inssEmployeeCents, inssEmployerCents: values.inssEmployerCents, irtCents: values.irtCents, netSalaryCents: values.netSalaryCents, status: "APPROVED", payDate: new Date() } });
    results.push(row);
  }
  await audit("PAYROLL_MONTH_PROCESSED", (req as AuthRequest).user?.id, "PAYROLL", parsed.data.month, { count: results.length });
  res.status(201).json({ month: parsed.data.month, count: results.length, payrolls: results });
});

hrRouter.get("/payrolls/report", async (req, res) => {
  const month = String(req.query.month ?? new Date().toISOString().slice(0, 7));
  const rows = await prisma.payroll.findMany({ where: { month }, include: { employee: true }, orderBy: { employee: { fullName: "asc" } } });
  res.json({ month, count: rows.length, totals: { grossSalaryCents: rows.reduce((n, r) => n + r.grossSalaryCents, 0), inssEmployeeCents: rows.reduce((n, r) => n + r.inssEmployeeCents, 0), inssEmployerCents: rows.reduce((n, r) => n + r.inssEmployerCents, 0), irtCents: rows.reduce((n, r) => n + r.irtCents, 0), netSalaryCents: rows.reduce((n, r) => n + r.netSalaryCents, 0) }, rows });
});

hrRouter.get("/payrolls/:id/payslip", async (req, res) => {
  const item = await prisma.payroll.findUnique({ where: { id: String(req.params.id) }, include: { employee: true } });
  if (!item) {
    res.status(404).json({ error: "payroll_not_found" });
    return;
  }
  res.json({ employee: item.employee, payroll: item });
});
