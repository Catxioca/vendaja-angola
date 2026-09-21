export const expenseCategories = [
  "RENT",
  "ENERGY",
  "WATER",
  "COMMUNICATIONS",
  "TRANSPORT",
  "FUEL",
  "SALARIES",
  "MAINTENANCE",
  "OFFICE_SUPPLIES",
  "SERVICES",
  "TAXES",
  "MARKETING",
  "OTHER",
] as const;

export const expensePaymentMethods = ["CASH", "CARD", "TRANSFER", "CREDIT"] as const;

export function isExpenseCategory(value: string): boolean {
  return expenseCategories.includes(value as (typeof expenseCategories)[number]);
}

export function isExpensePaymentMethod(value: string): boolean {
  return expensePaymentMethods.includes(value as (typeof expensePaymentMethods)[number]);
}
