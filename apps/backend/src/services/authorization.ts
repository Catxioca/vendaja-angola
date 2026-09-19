export function canManageCashSession(sessionOpenedBy: string, actorId: string | undefined, role: string | undefined) {
  const normalizedRole = (role ?? "").toUpperCase();
  return normalizedRole === "ADMIN" || normalizedRole === "ROLE_ADMIN" || sessionOpenedBy === actorId;
}
