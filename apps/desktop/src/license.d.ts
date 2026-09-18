export {};
declare global {
  type LicenseStatus = {
    valid: boolean;
    reason?: string;
    hardwareId: string;
    expiresAt?: string;
    nif?: string;
    modules?: string[];
  };
  interface Window {
    pos?: {
      version?: string;
      saveInvoicePdf?: (title: string) => Promise<unknown>;
      getLicenseStatus?: () => Promise<LicenseStatus>;
      activateLicense?: (token: string) => Promise<LicenseStatus>;
    };
  }
}
