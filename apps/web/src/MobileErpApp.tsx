import { MobileShell } from "./mobile/MobileShell";

interface Props {
  apiUrl: string;
}

/**
 * Aplicação Mobile ERP & POS Touch-First para Android, Tablets e PWA
 *
 * Implementa a fundação segura do cliente Android com:
 * - Armazenamento seguro de sessão e credenciais em cofre encriptado AES-GCM
 * - Shell adaptativo com layouts específicos para Smartphone e Tablet (balcão POS)
 * - Fila outbox idempotente segregada por tenant (companyId, branchId, terminalId)
 * - Bloqueio de primeiro login offline e desbloqueio por PIN rápido
 * - Classificação honesta de hardware e periféricos
 */
export function MobileErpApp({ apiUrl }: Props) {
  return <MobileShell apiUrl={apiUrl} />;
}
