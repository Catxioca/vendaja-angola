import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type {
  AuthState,
  CompanyMembershipOption,
  MobileFormFactor,
  MobileOrientation,
  MobileTab,
  PeripheralInfo,
  PeripheralType,
  TenantContext,
  UserProfile,
} from "./types";
import { formatKwanza, type Product, type PaymentMethod, type FiscalDocumentType } from "@angola/shared";
import { SecureStorageAdapter } from "./secure-storage";
import { MobileOutboxManager } from "./outbox-manager";
import { MobilePermissionManager } from "./permissions";
import { MobileCatalogManager } from "./catalog-manager";
import { MobileCartManager, MobileCartLine, IndicativeCartTotals } from "./cart-manager";
import { MobileCashManager, ActiveCashSession } from "./cash-manager";
import { ProvisionalReceiptData } from "./provisional-receipt";
import { MobileStockManager, Warehouse, StockBalance, ReorderSuggestion } from "./stock-manager";
import { MobileCustomerManager, MobileCustomer, CustomerCreateInput, CustomerPaymentInput } from "./customer-manager";
import { MobileSupplierManager, MobileSupplier, PurchaseOrder, PurchaseReceiptInput } from "./supplier-manager";

import { MobileHeader } from "./components/MobileHeader";
import { BottomNavigation } from "./components/BottomNavigation";
import { TabletSidebar } from "./components/TabletSidebar";
import { PinUnlockModal } from "./components/PinUnlockModal";
import { TenantSelectorModal } from "./components/TenantSelectorModal";
import { OutboxDiagnosticsModal } from "./components/OutboxDiagnosticsModal";
import { PermissionModal } from "./components/PermissionModal";
import { BootstrapModal } from "./components/BootstrapModal";
import { PaymentModal } from "./components/PaymentModal";
import { CashSessionModal } from "./components/CashSessionModal";
import { ProvisionalReceiptModal } from "./components/ProvisionalReceiptModal";
import { CameraScannerModal } from "./components/CameraScannerModal";
import { InventoryCountModal } from "./components/InventoryCountModal";
import { StockTransferModal } from "./components/StockTransferModal";
import { CustomerModal } from "./components/CustomerModal";
import { GoodsReceptionModal } from "./components/GoodsReceptionModal";
import { DocumentsModal } from "./components/DocumentsModal";
import { FiscalTreasuryModal } from "./components/FiscalTreasuryModal";
import { AdminEnterpriseModal } from "./components/AdminEnterpriseModal";
import { DeviceDiagnosticsModal } from "./components/DeviceDiagnosticsModal";
import { HidScannerService } from "./hid-scanner";

interface Props {
  apiUrl: string;
}

export function MobileShell({ apiUrl }: Props) {
  // Motores de infraestrutura mobile
  const storage = useMemo(() => new SecureStorageAdapter(true), []);
  const outbox = useMemo(() => new MobileOutboxManager(), []);
  const permissions = useMemo(() => new MobilePermissionManager(), []);
  const catalogManager = useMemo(() => new MobileCatalogManager(storage), [storage]);
  const cartManager = useMemo(() => new MobileCartManager(), []);
  const cashManager = useMemo(() => new MobileCashManager(), []);
  const stockManager = useMemo(() => new MobileStockManager(), []);
  const customerManager = useMemo(() => new MobileCustomerManager(), []);
  const supplierManager = useMemo(() => new MobileSupplierManager(), []);

  // Estados de sessão e autenticação
  const [authState, setAuthState] = useState<AuthState>("LOGGED_OUT");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [memberships, setMemberships] = useState<CompanyMembershipOption[]>([]);
  const [accessToken, setAccessToken] = useState<string>("");
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Estados de layout e responsividade
  const [formFactor, setFormFactor] = useState<MobileFormFactor>("phone");
  const [orientation, setOrientation] = useState<MobileOrientation>("portrait");
  const [activeTab, setActiveTab] = useState<MobileTab>("pos");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Estados de conectividade e rede
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine
  );
  const [syncCount, setSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modais de controlo do sistema
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [isOutboxModalOpen, setIsOutboxModalOpen] = useState(false);
  const [isBootstrapModalOpen, setIsBootstrapModalOpen] = useState(false);
  const [bootstrapAllowed, setBootstrapAllowed] = useState(false);
  const [permissionModalConfig, setPermissionModalConfig] = useState<{
    isOpen: boolean;
    type: PeripheralType;
    rationale: string;
  } | null>(null);

  // Modais da Fase 3: POS, Caixa, Pagamento e Comprovativo
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [provisionalReceiptData, setProvisionalReceiptData] = useState<ProvisionalReceiptData | null>(null);

  // Modais da Fase 4: Stock, Transferência, Clientes e Receção
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);

  // Modais da Fase 5: Documentos, Fiscalidade, Tesouraria e Administração ERP
  const [isDocumentsModalOpen, setIsDocumentsModalOpen] = useState(false);
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Modal da Fase 6: Diagnóstico de Periféricos & Hardware
  const [isDeviceDiagnosticsOpen, setIsDeviceDiagnosticsOpen] = useState(false);

  // Estado do Catálogo e POS
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Estado do Carrinho
  const [cartLines, setCartLines] = useState<MobileCartLine[]>([]);
  const [selectedCartCustomer, setSelectedCartCustomer] = useState<MobileCustomer | null>(null);
  const [cartTotals, setCartTotals] = useState<IndicativeCartTotals>({
    subtotalCents: 0,
    taxCents: 0,
    discountCents: 0,
    totalCents: 0,
    itemCount: 0,
    hasTaxPolicy: false,
    taxNotice: "impostos sujeitos a validação central",
  });

  // Estado da Sessão de Caixa
  const [activeCashSession, setActiveCashSession] = useState<ActiveCashSession | null>(null);

  // Estado da Fase 4: Stock, Clientes, Fornecedores
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [reorderSuggestions, setReorderSuggestions] = useState<ReorderSuggestion[]>([]);
  const [customers, setCustomers] = useState<MobileCustomer[]>([]);
  const [receivables, setReceivables] = useState<MobileCustomer[]>([]);
  const [suppliers, setSuppliers] = useState<MobileSupplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);

  // Notificações / Toast rápidos
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Formulário de Login Online
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Diagnóstico de periféricos
  const [peripheralsList, setPeripheralsList] = useState<PeripheralInfo[]>([]);

  // 1. Deteção de Form Factor e Orientação
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTabletWidth = width >= 768;
      setFormFactor(isTabletWidth ? "tablet" : "phone");
      setOrientation(width > height ? "landscape" : "portrait");
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // 2. Deteção de Conectividade
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("Ligação ao servidor restabelecida.", "success");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("Modo offline ativado. As operações serão guardadas na Outbox.", "info");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 3. Retoma após background e ciclo de vida Android
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setIsOnline(typeof navigator === "undefined" || navigator.onLine);
        setSyncCount((c) => c + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Atualiza estado do carrinho
  const refreshCartState = useCallback(() => {
    setCartLines(cartManager.getLines());
    setCartTotals(cartManager.calculateTotals());
    const c = cartManager.getCustomer();
    setSelectedCartCustomer(c as MobileCustomer | null);
  }, [cartManager]);

  // Carrega Catálogo de Produtos
  const loadCatalog = useCallback(async (token: string, companyId: string, branchId?: string | null) => {
    setIsLoadingCatalog(true);
    try {
      if (isOnline && token) {
        const loaded = await catalogManager.syncCatalog(apiUrl, token, companyId, branchId);
        setProducts(loaded);
      } else {
        const cached = catalogManager.loadCachedCatalog(companyId, branchId);
        setProducts(cached);
      }
    } catch {
      const cached = catalogManager.loadCachedCatalog(companyId, branchId);
      setProducts(cached);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [apiUrl, catalogManager, isOnline]);

  // Carrega Sessão de Caixa Atual
  const loadCashSession = useCallback(async (token: string, companyId: string, branchId?: string | null) => {
    try {
      if (isOnline && token) {
        const serverSession = await cashManager.fetchCurrentServerSession(apiUrl, token, companyId, branchId);
        setActiveCashSession(serverSession);
      } else {
        const cached = cashManager.loadCachedSession();
        setActiveCashSession(cached);
      }
    } catch {
      const cached = cashManager.loadCachedSession();
      setActiveCashSession(cached);
    }
  }, [apiUrl, cashManager, isOnline]);

  // Carrega Dados de Stock, Armazéns e Sugestões da Fase 4
  const loadStockData = useCallback(async (token: string, companyId: string, branchId?: string | null) => {
    try {
      if (isOnline && token) {
        const [w, b, s] = await Promise.all([
          stockManager.syncWarehouses(apiUrl, token, companyId, branchId).catch(() => []),
          stockManager.syncBalances(apiUrl, token, companyId, branchId).catch(() => []),
          stockManager.syncReorderSuggestions(apiUrl, token, companyId, branchId).catch(() => []),
        ]);
        setWarehouses(w);
        setStockBalances(b);
        setReorderSuggestions(s);
      } else {
        setWarehouses(stockManager.loadCachedWarehouses(companyId, branchId));
        setStockBalances(stockManager.loadCachedBalances(companyId, branchId));
      }
    } catch {
      setWarehouses(stockManager.loadCachedWarehouses(companyId, branchId));
      setStockBalances(stockManager.loadCachedBalances(companyId, branchId));
    }
  }, [apiUrl, isOnline, stockManager]);

  // Carrega Dados de Clientes e Contas Correntes
  const loadCustomerData = useCallback(async (token: string, companyId: string, branchId?: string | null) => {
    try {
      if (isOnline && token) {
        const [c, r] = await Promise.all([
          customerManager.syncCustomers(apiUrl, token, companyId, branchId).catch(() => []),
          customerManager.syncReceivables(apiUrl, token, companyId, branchId).catch(() => []),
        ]);
        setCustomers(c);
        setReceivables(r);
      } else {
        setCustomers(customerManager.loadCachedCustomers(companyId, branchId));
      }
    } catch {
      setCustomers(customerManager.loadCachedCustomers(companyId, branchId));
    }
  }, [apiUrl, customerManager, isOnline]);

  // Carrega Dados de Fornecedores e Compras
  const loadSupplierData = useCallback(async (token: string, companyId: string, branchId?: string | null) => {
    try {
      if (isOnline && token) {
        const [s, p] = await Promise.all([
          supplierManager.syncSuppliers(apiUrl, token, companyId, branchId).catch(() => []),
          supplierManager.syncPurchases(apiUrl, token, companyId, branchId).catch(() => []),
        ]);
        setSuppliers(s);
        setPurchases(p);
      } else {
        setSuppliers(supplierManager.loadCachedSuppliers(companyId, branchId));
        setPurchases(supplierManager.loadCachedPurchases(companyId, branchId));
      }
    } catch {
      setSuppliers(supplierManager.loadCachedSuppliers(companyId, branchId));
      setPurchases(supplierManager.loadCachedPurchases(companyId, branchId));
    }
  }, [apiUrl, isOnline, supplierManager]);

  // Carrega Empresas Autorizadas (Multi-tenant)
  const loadAuthorizedMemberships = useCallback(
    async (token: string): Promise<CompanyMembershipOption[]> => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/auth/memberships`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.memberships || [];
        setMemberships(list);
        return list;
      } catch {
        return [];
      }
    },
    [apiUrl]
  );

  // Inicialização da Sessão Guardada
  useEffect(() => {
    async function initSession() {
      setIsLoadingSession(true);
      try {
        const session = await storage.getSession();
        const savedTenant = await storage.getTenant();

        if (session && session.user) {
          setUser(session.user);
          setAccessToken(session.tokens.accessToken);
          if (savedTenant) {
            setTenant(savedTenant);
          }

          const hasPin = await storage.hasPin();
          if (hasPin) {
            setAuthState("LOCKED");
          } else {
            setAuthState("AUTHENTICATED");
          }

          if (isOnline && session.tokens.accessToken) {
            await loadAuthorizedMemberships(session.tokens.accessToken);
            if (savedTenant) {
              await Promise.all([
                loadCatalog(session.tokens.accessToken, savedTenant.companyId, savedTenant.branchId),
                loadCashSession(session.tokens.accessToken, savedTenant.companyId, savedTenant.branchId),
                loadStockData(session.tokens.accessToken, savedTenant.companyId, savedTenant.branchId),
                loadCustomerData(session.tokens.accessToken, savedTenant.companyId, savedTenant.branchId),
                loadSupplierData(session.tokens.accessToken, savedTenant.companyId, savedTenant.branchId),
              ]);
            }
          } else if (savedTenant) {
            setProducts(catalogManager.loadCachedCatalog(savedTenant.companyId, savedTenant.branchId));
            setActiveCashSession(cashManager.loadCachedSession());
            setWarehouses(stockManager.loadCachedWarehouses(savedTenant.companyId, savedTenant.branchId));
            setStockBalances(stockManager.loadCachedBalances(savedTenant.companyId, savedTenant.branchId));
            setCustomers(customerManager.loadCachedCustomers(savedTenant.companyId, savedTenant.branchId));
            setSuppliers(supplierManager.loadCachedSuppliers(savedTenant.companyId, savedTenant.branchId));
            setPurchases(supplierManager.loadCachedPurchases(savedTenant.companyId, savedTenant.branchId));
          }
        } else {
          setAuthState("LOGGED_OUT");
        }
      } catch {
        setAuthState("LOGGED_OUT");
      } finally {
        setIsLoadingSession(false);
      }
    }

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega Catálogo, Stock, Clientes e Caixa ao mudar de Tenant
  useEffect(() => {
    if (tenant && accessToken) {
      loadCatalog(accessToken, tenant.companyId, tenant.branchId);
      loadCashSession(accessToken, tenant.companyId, tenant.branchId);
      loadStockData(accessToken, tenant.companyId, tenant.branchId);
      loadCustomerData(accessToken, tenant.companyId, tenant.branchId);
      loadSupplierData(accessToken, tenant.companyId, tenant.branchId);
    }
  }, [tenant, accessToken, loadCatalog, loadCashSession, loadStockData, loadCustomerData, loadSupplierData]);

  // Atualiza Diagnóstico de Periféricos
  useEffect(() => {
    const list = permissions.getPeripheralsDiagnostic();
    setPeripheralsList(list);
  }, [permissions]);

  // Hook de Sincronização de Turnos de Caixa
  useEffect(() => {
    outbox.onCashSessionSynced = (mutation, responseData) => {
      if (mutation.operation === "OPEN") {
        cashManager.applyServerSession(responseData);
        setActiveCashSession(cashManager.getCurrentSession());
        showToast("Turno de caixa confirmado centralmente com sucesso!", "success");
      } else if (mutation.operation === "CLOSE") {
        cashManager.applyServerClose(responseData);
        setActiveCashSession(null);
        showToast("Fecho de caixa confirmado centralmente pelo servidor.", "success");
      } else if (mutation.operation === "ADJUSTMENT") {
        if (responseData && cashManager.getCurrentSession()) {
          cashManager.applyServerSession(responseData);
          setActiveCashSession(cashManager.getCurrentSession());
        }
        showToast("Movimento de caixa confirmado centralmente.", "success");
      }
    };

    outbox.onCashSessionConflict = (mutation, sanitizedError) => {
      cashManager.setPendingActionConflict(mutation, sanitizedError);
      showToast(`Conflito no turno de caixa: ${sanitizedError}`, "error");
    };
  }, [outbox, cashManager]);

  // 3. Leitor HID USB/Bluetooth (Leitura ultrarrápida por teclado de hardware)
  const barcodeBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se estiver a escrever num input ou textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        const scannedCode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = "";

        if (scannedCode.length >= 3) {
          e.preventDefault();
          const found = catalogManager.findProductByBarcode(scannedCode);
          if (found) {
            cartManager.addProduct(found, 1);
            refreshCartState();
            showToast(`Item adicionado: ${found.name}`, "success");
          } else {
            showToast(`Produto com código ${scannedCode} não encontrado.`, "error");
          }
        }
      } else if (e.key.length === 1) {
        if (interval > 150) {
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [catalogManager, cartManager, refreshCartState]);

  // Sincronização em Segundo Plano da Outbox ao Recuperar Ligação
  const handleSyncOutbox = useCallback(async () => {
    if (!isOnline || isSyncing || !tenant || !accessToken) return;
    setIsSyncing(true);
    try {
      const summary = await outbox.syncPending(apiUrl, accessToken, tenant);
      setSyncCount((c) => c + 1);
      if (summary.sent > 0) {
        showToast(`${summary.sent} operação(ões) offline sincronizada(s) com sucesso.`, "success");
        await Promise.all([
          loadCashSession(accessToken, tenant.companyId, tenant.branchId),
          loadStockData(accessToken, tenant.companyId, tenant.branchId),
          loadCustomerData(accessToken, tenant.companyId, tenant.branchId),
          loadSupplierData(accessToken, tenant.companyId, tenant.branchId),
        ]);
      }
    } catch {
      showToast("Falha temporária ao sincronizar outbox com o servidor central.", "error");
    } finally {
      setIsSyncing(false);
    }
  }, [apiUrl, accessToken, isOnline, isSyncing, outbox, tenant, loadCashSession, loadStockData, loadCustomerData, loadSupplierData]);

  // Gatilho de sincronização automática na reconexão
  useEffect(() => {
    if (isOnline && authState === "AUTHENTICATED" && tenant && accessToken) {
      handleSyncOutbox();
    }
  }, [isOnline, authState, tenant, accessToken, handleSyncOutbox]);

  // Login Online
  const handleLoginOnline = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (!isOnline) {
      setLoginError(
        "O primeiro início de sessão requer ligação ativa ao servidor para autenticação inicial e autorização de tenant."
      );
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Credenciais de utilizador inválidas.");
      }

      const data = await res.json();
      const tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
      setAccessToken(data.accessToken);

      const userProfile: UserProfile = {
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        displayName: data.user.displayName,
        role: data.user.role,
        authMethod: data.user.authMethod || "password",
      };

      await storage.storeSession(tokens, userProfile);
      setUser(userProfile);

      // Carrega empresas autorizadas
      const loaded = await loadAuthorizedMemberships(tokens.accessToken);
      if (loaded.length > 0 && loaded[0]) {
        const first = loaded[0];
        const newTenant: TenantContext = {
          companyId: first.companyId,
          branchId: first.branchId,
          companyName: first.company.legalName,
          branchName: first.branch?.name,
          membershipId: first.id,
          role: first.role,
          terminalId: "01",
          modules: ["POS", "STOCK", "ACCOUNTING", "SETTINGS"],
        };
        await storage.storeTenant(newTenant);
        setTenant(newTenant);
        await Promise.all([
          loadCatalog(tokens.accessToken, newTenant.companyId, newTenant.branchId),
          loadCashSession(tokens.accessToken, newTenant.companyId, newTenant.branchId),
          loadStockData(tokens.accessToken, newTenant.companyId, newTenant.branchId),
          loadCustomerData(tokens.accessToken, newTenant.companyId, newTenant.branchId),
          loadSupplierData(tokens.accessToken, newTenant.companyId, newTenant.branchId),
        ]);
      }

      if (loginPassword.length <= 6 && /^\d+$/.test(loginPassword)) {
        await storage.storePin(loginPassword);
      }

      setAuthState("AUTHENTICATED");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Falha ao iniciar sessão.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Desbloqueio por PIN
  const handlePinUnlock = async (pin: string): Promise<boolean> => {
    const valid = await storage.verifyPin(pin);
    if (valid) {
      setAuthState("AUTHENTICATED");
      return true;
    }
    return false;
  };

  // Terminar Sessão
  const handleLogout = () => {
    storage.clearSession();
    setUser(null);
    setTenant(null);
    setAccessToken("");
    setAuthState("LOGGED_OUT");
    setIsSidebarOpen(false);
    cartManager.clear();
    refreshCartState();
  };

  // Selecionar Novo Tenant
  const handleSelectTenant = async (membership: CompanyMembershipOption, terminalId: string) => {
    const newTenant: TenantContext = {
      companyId: membership.companyId,
      branchId: membership.branchId,
      companyName: membership.company.legalName,
      branchName: membership.branch?.name,
      membershipId: membership.id,
      role: membership.role,
      terminalId: terminalId || "01",
      modules: ["POS", "STOCK", "ACCOUNTING", "SETTINGS"],
    };
    await storage.storeTenant(newTenant);
    setTenant(newTenant);
    setIsTenantModalOpen(false);

    if (accessToken) {
      await Promise.all([
        loadCatalog(accessToken, newTenant.companyId, newTenant.branchId),
        loadCashSession(accessToken, newTenant.companyId, newTenant.branchId),
        loadStockData(accessToken, newTenant.companyId, newTenant.branchId),
        loadCustomerData(accessToken, newTenant.companyId, newTenant.branchId),
        loadSupplierData(accessToken, newTenant.companyId, newTenant.branchId),
      ]);
    }
    cartManager.clear();
    refreshCartState();
    showToast(`Empresa ativa: ${newTenant.companyName}`, "info");
  };

  // Permissões de Periféricos
  const handleTriggerPermission = (type: PeripheralType, rationale: string) => {
    setPermissionModalConfig({ isOpen: true, type, rationale });
  };

  const handleConfirmPermission = async () => {
    if (!permissionModalConfig) return;
    const { type } = permissionModalConfig;
    setPermissionModalConfig(null);

    const granted = await permissions.requestPermissionWithRationale(type);
    setPeripheralsList(permissions.getPeripheralsDiagnostic());

    if (granted && type === "camera") {
      setIsCameraScannerOpen(true);
    }
  };

  // Leitura ótica
  const handleBarcodeScanned = (barcode: string) => {
    const found = catalogManager.findProductByBarcode(barcode);
    if (found) {
      cartManager.addProduct(found, 1);
      refreshCartState();
      showToast(`Adicionado: ${found.name}`, "success");
    } else {
      showToast(`Produto com código ${barcode} não encontrado no catálogo.`, "error");
    }
  };

  // 4. Captura contínua de Scanner HID (Keyboard Wedge USB/Bluetooth)
  useEffect(() => {
    const unsub = HidScannerService.getInstance().subscribe((ev) => {
      const code = typeof ev === "string" ? ev : ev.barcode;
      handleBarcodeScanned(code);
    });
    return () => unsub();
  }, [products]);

  // Confirmação de Venda
  const handleConfirmPayment = async (planInput: {
    paymentMethod: PaymentMethod;
    tenderedCents?: number;
    dueDate?: string | null;
    tpaAuthorizationCode?: string;
    transferReference?: string;
  }) => {
    if (!tenant || !user) {
      showToast("Sessão ou tenant inválido.", "error");
      return;
    }

    if (cartLines.length === 0) {
      showToast("O carrinho está vazio.", "error");
      return;
    }

    if (planInput.paymentMethod === "CASH") {
      if (!isOnline) {
        const cashValidation = cashManager.canCreateOfflineCashSale({
          companyId: tenant.companyId,
          branchId: tenant.branchId,
          terminalId: tenant.terminalId,
          userId: user.id,
        });
        if (!cashValidation.allowed) {
          showToast(
            cashValidation.reason ||
              "Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor.",
            "error"
          );
          return;
        }
      } else if (!activeCashSession) {
        showToast("Não é possível realizar venda em numerário sem um turno de caixa aberto.", "error");
        return;
      }
    }

    // Chave de idempotência estável vinculada ao momento de criação local da venda
    const idempotencyKey = cartManager.getOrCreateSaleIdempotencyKey(tenant.terminalId);

    const plan = cartManager.buildPaymentPlan({
      paymentMethod: planInput.paymentMethod,
      tenderedCents: planInput.tenderedCents,
      dueDate: planInput.dueDate,
      tpaAuthorizationCode: planInput.tpaAuthorizationCode,
      transferReference: planInput.transferReference,
      cashSessionId: activeCashSession?.id || null,
      idempotencyKey,
    });

    if (isOnline && accessToken) {
      try {
        const payload = {
          idempotencyKey,
          paymentMethod: plan.paymentMethod,
          fiscalType: plan.fiscalType,
          cashSessionId: plan.cashSessionId,
          dueDate: plan.dueDate,
          tenderedCents: plan.tenderedCents,
          tpaAuthorizationCode: plan.tpaAuthorizationCode,
          transferReference: plan.transferReference,
          customer: plan.customer,
          lines: cartLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            taxRate: l.taxRate,
            exemptionCode: l.exemptionCode,
          })),
        };

        const res = await fetch(`${apiUrl}/api/v1/sales`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-company-id": tenant.companyId,
            ...(tenant.branchId ? { "x-branch-id": tenant.branchId } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const saleResult = await res.json();
          showToast(`Documento fiscal confirmado centralmente com sucesso! Ref: ${saleResult.fiscalNumber || "OK"}`, "success");
          cartManager.clear();
          refreshCartState();
          setIsPaymentModalOpen(false);
          await loadCashSession(accessToken, tenant.companyId, tenant.branchId);
          return;
        }

        if (res.status === 400 || res.status === 422 || res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          showToast(`Erro na validação fiscal: ${errData.message || errData.error || res.statusText}`, "error");
          return;
        }
      } catch {
        // Fallback para outbox em caso de falha de rede ou timeout
      }
    }

    // Fluxo Offline: validação obrigatória de sessão de caixa pré-confirmada para numerário
    if (plan.paymentMethod === "CASH") {
      const cashValidation = cashManager.canCreateOfflineCashSale({
        companyId: tenant.companyId,
        branchId: tenant.branchId,
        terminalId: tenant.terminalId,
        userId: user.id,
      });
      if (!cashValidation.allowed) {
        showToast(
          cashValidation.reason ||
            "Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor.",
          "error"
        );
        return;
      }
    }

    // Fluxo Offline: utiliza a mesma chave de idempotência estável criada na abertura da venda
    const correlationId = `OFF-${tenant.terminalId}-${idempotencyKey.slice(-12).toUpperCase()}`;

    const offlinePayload = {
      correlationId,
      idempotencyKey,
      paymentMethod: plan.paymentMethod,
      fiscalType: plan.fiscalType,
      cashSessionId: plan.cashSessionId,
      dueDate: plan.dueDate,
      tenderedCents: plan.tenderedCents,
      changeCents: plan.changeCents,
      tpaAuthorizationCode: plan.tpaAuthorizationCode,
      transferReference: plan.transferReference,
      customer: plan.customer,
      totals: cartTotals,
      lines: cartLines,
      operatorName: user.displayName || user.username,
      offlineAt: new Date().toISOString(),
    };

    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey,
      correlationId,
      payload: offlinePayload,
      tenant,
      userId: user.id,
    });

    setSyncCount((c) => c + 1);

    const receipt: ProvisionalReceiptData = {
      correlationId,
      idempotencyKey,
      occurredAt: new Date().toISOString(),
      tenant,
      operatorName: user.displayName || user.username,
      customerName: plan.customer?.name,
      customerNif: plan.customer?.nif || undefined,
      lines: [...cartLines],
      paymentPlan: plan,
    };

    setProvisionalReceiptData(receipt);
    cartManager.clear();
    refreshCartState();
    setIsPaymentModalOpen(false);
    showToast("Venda guardada na Outbox. Comprovativo provisório emitido.", "info");
  };

  // Handlers da Fase 4: Stock, Clientes e Receção
  const handleSubmitInventoryCount = async (countData: {
    locationId: string;
    reference: string;
    lines: Array<{ productId: string; countedQuantity: number }>;
  }) => {
    if (!tenant || !user) return;
    if (isOnline && accessToken) {
      await stockManager.submitInventoryCount(apiUrl, accessToken, tenant, countData);
      showToast("Contagem de inventário submetida e processada com sucesso.", "success");
      await loadStockData(accessToken, tenant.companyId, tenant.branchId);
    } else {
      outbox.enqueueMutation({
        entity: "INVENTORY_COUNT",
        operation: "CREATE",
        payload: { ...countData, capturedAt: new Date().toISOString() },
        tenant,
        userId: user.id,
      });
      setSyncCount((c) => c + 1);
      showToast("Contagem de inventário guardada na Outbox offline.", "info");
    }
  };

  const handleSubmitTransfer = async (transferData: {
    sourceLocationId: string;
    destinationLocationId: string;
    reference: string;
    lines: Array<{ productId: string; quantity: number }>;
  }) => {
    if (!tenant || !user) return;
    if (isOnline && accessToken) {
      await stockManager.executeTransfer(apiUrl, accessToken, tenant, transferData);
      showToast("Transferência entre armazéns confirmada no servidor.", "success");
      await loadStockData(accessToken, tenant.companyId, tenant.branchId);
    } else {
      outbox.enqueueMutation({
        entity: "STOCK_TRANSFER",
        operation: "CREATE",
        payload: { ...transferData, capturedAt: new Date().toISOString() },
        tenant,
        userId: user.id,
      });
      setSyncCount((c) => c + 1);
      showToast("Transferência guardada na Outbox offline.", "info");
    }
  };

  const handleCreateCustomer = async (input: CustomerCreateInput): Promise<MobileCustomer> => {
    if (!tenant || !user) throw new Error("Sessão inválida");
    if (isOnline && accessToken) {
      const created = await customerManager.createCustomer(apiUrl, accessToken, tenant, input);
      showToast(`Cliente ${created.name} registado com sucesso.`, "success");
      await loadCustomerData(accessToken, tenant.companyId, tenant.branchId);
      return created;
    } else {
      const offlineCustomer: MobileCustomer = {
        id: `offline-cust-${Date.now()}`,
        name: input.name,
        nif: input.nif,
        phone: input.phone,
        email: input.email,
        address: input.address,
        active: true,
        creditLimitCents: input.creditLimitCents || 0,
        outstandingDebtCents: 0,
      };
      outbox.enqueueMutation({
        entity: "CUSTOMER",
        operation: "CREATE",
        payload: { ...input, capturedAt: new Date().toISOString() },
        tenant,
        userId: user.id,
      });
      setSyncCount((c) => c + 1);
      showToast(`Cliente ${input.name} guardado na Outbox offline.`, "info");
      return offlineCustomer;
    }
  };

  const handleRecordCustomerPayment = async (customerId: string, payment: CustomerPaymentInput) => {
    if (!tenant || !user) return;
    if (isOnline && accessToken) {
      await customerManager.recordCustomerPayment(apiUrl, accessToken, tenant, customerId, payment);
      showToast("Pagamento de conta corrente liquidado com sucesso.", "success");
      await loadCustomerData(accessToken, tenant.companyId, tenant.branchId);
    } else {
      outbox.enqueueMutation({
        entity: "RECEIVABLE_PAYMENT",
        operation: "CREATE",
        payload: { customerId, payment, capturedAt: new Date().toISOString() },
        tenant,
        userId: user.id,
      });
      setSyncCount((c) => c + 1);
      showToast("Pagamento de conta corrente guardado na Outbox offline.", "info");
    }
  };

  const handleSubmitReception = async (purchaseId: string, receipt: PurchaseReceiptInput) => {
    if (!tenant || !user) return;
    if (isOnline && accessToken) {
      await supplierManager.receivePurchase(apiUrl, accessToken, tenant, purchaseId, receipt);
      showToast("Receção de mercadoria concluída e stock atualizado.", "success");
      await Promise.all([
        loadStockData(accessToken, tenant.companyId, tenant.branchId),
        loadSupplierData(accessToken, tenant.companyId, tenant.branchId),
      ]);
    } else {
      outbox.enqueueMutation({
        entity: "PURCHASE_RECEIPT",
        operation: "CREATE",
        payload: { purchaseId, ...receipt, capturedAt: new Date().toISOString() },
        tenant,
        userId: user.id,
      });
      setSyncCount((c) => c + 1);
      showToast("Receção guardada na Outbox offline para conferência central.", "info");
    }
  };

  // Categorias únicas do catálogo
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.categoryId) set.add(p.categoryId);
    });
    return ["TODOS", ...Array.from(set)];
  }, [products]);

  // Produtos filtrados por categoria e pesquisa
  const filteredProducts = useMemo(() => {
    return catalogManager.filterProducts({
      query: catalogQuery,
      category: selectedCategory === "TODOS" ? undefined : selectedCategory,
    });
  }, [catalogManager, catalogQuery, selectedCategory, products]);

  const outboxSummary = outbox.getStatusSummary(tenant?.companyId);

  // Ecrã de Carregamento Inicial
  if (isLoadingSession) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4">
        <div className="text-4xl mb-3 animate-bounce">🇦🇴</div>
        <h2 className="text-lg font-bold">VendaJá Angola Mobile</h2>
        <p className="text-slate-400 text-sm mt-1">A carregar segurança e integridade...</p>
      </main>
    );
  }

  // Ecrã de Login Online
  if (authState === "LOGGED_OUT") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-2xl">
          <div className="text-center mb-5">
            <span className="text-4xl">🇦🇴</span>
            <h1 className="text-xl font-black mt-2 text-sky-400">VendaJá Angola</h1>
            <p className="text-slate-400 text-xs">Terminal POS & ERP Android / Tablet</p>
          </div>

          <div className="p-3 bg-sky-950/60 border border-sky-800 rounded-xl text-xs text-sky-200 text-center mb-4 leading-relaxed">
            Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
          </div>

          {!isOnline && (
            <div className="bg-amber-950/80 border border-amber-700 text-amber-200 p-3 rounded-xl text-xs mb-4">
              ⚠️ <strong>Dispositivo Offline:</strong> O primeiro início de sessão requer ligação ativa ao backend para autenticação e segregação do tenant.
            </div>
          )}

          {loginError && (
            <div className="bg-red-950 border border-red-800 text-red-200 p-3 rounded-xl text-xs mb-4">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLoginOnline} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Utilizador ou E-mail:</label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="Ex: admin ou operador"
                className="w-full h-11 bg-slate-800 border border-slate-700 rounded-xl px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Password ou PIN:</label>
              <input
                type="password"
                required
                minLength={4}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 bg-slate-800 border border-slate-700 rounded-xl px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || !isOnline}
              className="w-full h-12 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors shadow-lg mt-2"
            >
              {isLoggingIn ? "A autenticar..." : "Entrar no Terminal"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  const isTablet = formFactor === "tablet";
  const isSplitPos = isTablet && activeTab === "pos";

  return (
    <div className={`min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans ${isTablet ? "pb-0" : "pb-16"}`}>
      {/* Toast de Notificação */}
      {toastMessage && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 border animate-fadeIn ${
            toastMessage.type === "success"
              ? "bg-emerald-950 border-emerald-700 text-emerald-200"
              : toastMessage.type === "error"
              ? "bg-rose-950 border-rose-700 text-rose-200"
              : "bg-slate-800 border-slate-700 text-sky-200"
          }`}
        >
          <span>{toastMessage.type === "success" ? "✓" : toastMessage.type === "error" ? "⚠️" : "ℹ️"}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Cabeçalho Mobile / Tablet */}
      <MobileHeader
        user={user}
        tenant={tenant}
        isOnline={isOnline}
        pendingOutboxCount={outboxSummary.pending + outboxSummary.retryable}
        onOpenOutbox={() => setIsOutboxModalOpen(true)}
        onOpenTenantSelector={() => setIsTenantModalOpen(true)}
        onQuickLock={() => setAuthState("LOCKED")}
        onLogout={handleLogout}
        isTablet={isTablet}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
      />

      {/* Faixa de Aviso de Modo Offline */}
      {!isOnline && (
        <div className="bg-amber-900/90 text-amber-200 px-4 py-2 text-xs font-semibold flex items-center justify-between border-b border-amber-800">
          <span>⚠️ Modo Offline Ativo: As operações emitidas são provisórias e aguardam validação central.</span>
          <span className="font-mono text-[11px] bg-amber-950 px-2 py-0.5 rounded">
            Outbox: {outboxSummary.pending}
          </span>
        </div>
      )}

      {/* Conteúdo Principal Adaptativo */}
      <main className="flex-1 p-3 md:p-4 overflow-y-auto">
        {/* ABA 1: TERMINAL POS TOUCH-FIRST */}
        {activeTab === "pos" && (
          <section aria-label="Terminal POS" className="h-full">
            <div className={`grid gap-4 ${isSplitPos ? (orientation === "landscape" ? "grid-cols-[1.3fr_0.7fr]" : "grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]") : "grid-cols-1"}`}>
              {/* PAINEL ESQUERDO: Catálogo, Scanner & Filtros */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-sky-400">🛒 POS Touch</h2>
                    {(() => {
                      const pending = cashManager.getPendingAction();
                      if (pending?.status === "PENDING_CENTRAL_VALIDATION") {
                        return (
                          <button
                            onClick={() => setIsCashModalOpen(true)}
                            className="text-xs px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 bg-amber-950/60 border-amber-800 text-amber-300"
                          >
                            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                            <span>Pendente de validação central</span>
                          </button>
                        );
                      }
                      if (pending?.status === "CONFLICT") {
                        return (
                          <button
                            onClick={() => setIsCashModalOpen(true)}
                            className="text-xs px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 bg-rose-950/60 border-rose-800 text-rose-300"
                          >
                            <span className="w-2 h-2 rounded-full bg-current" />
                            <span>Caixa: Conflito detetado</span>
                          </button>
                        );
                      }
                      return (
                        <button
                          onClick={() => setIsCashModalOpen(true)}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 ${
                            activeCashSession
                              ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                              : "bg-rose-950/60 border-rose-800 text-rose-300"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                          {activeCashSession ? "Caixa Aberto" : "Caixa Fechado"}
                        </button>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTriggerPermission("camera", "Necessário para leitura ótica de códigos de barras.")}
                      className="h-10 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-2"
                    >
                      <span>📷</span>
                      <span>Scanner</span>
                    </button>
                    {isOnline && (
                      <button
                        type="button"
                        onClick={() => tenant && accessToken && loadCatalog(accessToken, tenant.companyId, tenant.branchId)}
                        disabled={isLoadingCatalog}
                        className="h-10 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200"
                        title="Recarregar Catálogo"
                      >
                        {isLoadingCatalog ? "⏳" : "🔄"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de Pesquisa */}
                <div className="relative">
                  <input
                    type="text"
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.target.value)}
                    placeholder="Pesquisar produto por nome, SKU ou passe o leitor..."
                    className="w-full h-11 bg-slate-800 border border-slate-700 rounded-xl px-4 pl-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans"
                  />
                  <span className="absolute left-3.5 top-3 text-slate-400 text-sm">🔍</span>
                  {catalogQuery && (
                    <button
                      onClick={() => setCatalogQuery("")}
                      className="absolute right-3 top-3 text-slate-400 hover:text-white text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtro de Categorias */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                        selectedCategory === cat
                          ? "bg-sky-600 text-white shadow-md"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Grelha Tátil de Produtos */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        cartManager.addProduct(p, 1);
                        refreshCartState();
                      }}
                      className="group p-3 bg-slate-800 hover:bg-slate-750 active:scale-95 border border-slate-700 hover:border-sky-500/80 rounded-xl text-left transition flex flex-col justify-between min-h-[90px]"
                    >
                      <div>
                        <div className="font-semibold text-xs sm:text-sm text-white line-clamp-2 leading-tight">
                          {p.name}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{p.sku}</span>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="font-bold text-xs sm:text-sm text-emerald-400">
                          {formatKwanza(p.priceCents)}
                        </span>
                        <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">
                          +{1}
                        </span>
                      </div>
                    </button>
                  ))}

                  {filteredProducts.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                      {isLoadingCatalog ? "A carregar catálogo..." : "Nenhum produto encontrado neste filtro."}
                    </div>
                  )}
                </div>
              </div>

              {/* PAINEL DIREITO: Carrinho, Cliente & Totais */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between min-h-[360px]">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <span>🛍️ Carrinho</span>
                      <span className="text-xs font-mono bg-sky-950 text-sky-300 px-2 py-0.5 rounded-full border border-sky-800">
                        {cartTotals.itemCount} itens
                      </span>
                    </h3>
                    {cartLines.length > 0 && (
                      <button
                        onClick={() => {
                          cartManager.clear();
                          refreshCartState();
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  {/* Seleção Rápida de Cliente para a Venda */}
                  <div className="mt-2 p-2 bg-slate-800/80 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div className="truncate">
                      <span className="text-[10px] text-slate-400 block">Cliente Associado:</span>
                      <span className="text-xs font-semibold text-white">
                        {selectedCartCustomer ? selectedCartCustomer.name : "Consumidor Final"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCustomerModalOpen(true)}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold text-white whitespace-nowrap"
                    >
                      {selectedCartCustomer ? "Alterar" : "Selecionar"}
                    </button>
                  </div>

                  {/* Lista de Linhas do Carrinho */}
                  <div className="space-y-2 mt-3 max-h-[260px] overflow-y-auto pr-1">
                    {cartLines.map((line) => (
                      <div
                        key={line.productId}
                        className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs text-white truncate">{line.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {formatKwanza(line.unitPriceCents)} x {line.quantity}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              cartManager.updateLineQuantity(line.productId, line.quantity - 1);
                              refreshCartState();
                            }}
                            className="w-10 h-10 min-w-[40px] min-h-[40px] sm:w-11 sm:h-11 sm:min-w-[44px] sm:min-h-[44px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-base flex items-center justify-center transition active:scale-95"
                            aria-label="Diminuir quantidade"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-mono font-bold text-white">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              cartManager.updateLineQuantity(line.productId, line.quantity + 1);
                              refreshCartState();
                            }}
                            className="w-10 h-10 min-w-[40px] min-h-[40px] sm:w-11 sm:h-11 sm:min-w-[44px] sm:min-h-[44px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-base flex items-center justify-center transition active:scale-95"
                            aria-label="Aumentar quantidade"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <div className="font-bold text-xs text-emerald-400">
                            {formatKwanza(line.lineTotalCents)}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              cartManager.removeLine(line.productId);
                              refreshCartState();
                            }}
                            className="p-2 text-slate-500 hover:text-rose-400 min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-xs transition"
                            title="Remover Item"
                            aria-label="Remover Item"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}

                    {cartLines.length === 0 && (
                      <div className="py-10 text-center text-slate-500 text-xs">
                        O carrinho está vazio. Selecione produtos no catálogo ou utilize o scanner.
                      </div>
                    )}
                  </div>
                </div>

                {/* Totais e Botão de Finalização */}
                <div className="pt-3 border-t border-slate-800 space-y-2 mt-4">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Subtotal / Incidência:</span>
                    <span className="font-mono text-slate-200">{formatKwanza(cartTotals.subtotalCents)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>
                      {cartTotals.hasTaxPolicy
                        ? "IVA Indicativo (política sincronizada):"
                        : "Impostos sujeitos a validação central:"}
                    </span>
                    <span className="font-mono text-slate-200">
                      {cartTotals.hasTaxPolicy
                        ? formatKwanza(cartTotals.taxCents)
                        : "A calcular centralmente"}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-white pt-1 border-t border-slate-800">
                    <span>
                      {cartTotals.hasTaxPolicy
                        ? "Total a Pagar:"
                        : "Total provisório sujeito a validação central:"}
                    </span>
                    <span className="text-emerald-400 font-mono">{formatKwanza(cartTotals.totalCents)}</span>
                  </div>
                  {!cartTotals.hasTaxPolicy && (
                    <div className="text-[10px] text-amber-400 font-medium">
                      ⚠️ Impostos sujeitos a validação central (taxCents=0 não é imposto final)
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={cartLines.length === 0}
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="w-full min-h-[52px] py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 text-white font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    <span>💳</span>
                    <span>Cobrar Venda ({formatKwanza(cartTotals.totalCents)})</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ABA 2: CATÁLOGO DE PRODUTOS COMPLETO */}
        {activeTab === "products" && (
          <section aria-label="Produtos" className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-base text-sky-400">🏷️ Catálogo de Produtos ({products.length})</h3>
                <span className="text-xs text-slate-400">Filial: {tenant?.branchName || "Sede"}</span>
              </div>
              <div className="space-y-2">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-800 rounded-xl border border-slate-700 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-semibold text-sm text-white">{p.name}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        SKU: {p.sku} {p.barcode ? `| EAN: ${p.barcode}` : ""}
                      </div>
                      <span className="inline-block mt-1 text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                        {p.categoryId || "Geral"}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-emerald-400">{formatKwanza(p.priceCents)}</div>
                      <div className="text-xs text-slate-400">IVA: {((p.taxRate ?? 0.14) * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ABA 3: GESTÃO DE STOCK & ARMAZÉNS (FASE 4) */}
        {activeTab === "stock" && (
          <section aria-label="Stock" className="space-y-3">
            {/* Ações Superiores de Stock */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-sky-400">📦 Gestão de Stock & Armazéns</h3>
                <p className="text-xs text-slate-400">
                  Armazéns autorizados: {warehouses.length} | Filial: {tenant?.branchName || "Sede"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsInventoryModalOpen(true)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow"
                >
                  <span>📋</span>
                  <span>Inventário Físico</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow"
                >
                  <span>🔄</span>
                  <span>Transferência</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsReceptionModalOpen(true)}
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow"
                >
                  <span>📥</span>
                  <span>Receção de Compras</span>
                </button>
              </div>
            </div>

            {/* Alerta de Reposição (Reorder Suggestions) */}
            {reorderSuggestions.length > 0 && (
              <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <span>⚠️</span>
                  <span>{reorderSuggestions.length} Produto(s) com Stock em Nível Crítico / Reposição Necessária:</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {reorderSuggestions.map((s) => (
                    <div
                      key={s.productId}
                      className="p-2 bg-slate-900/90 rounded-xl border border-amber-900/60 text-xs min-w-[200px]"
                    >
                      <div className="font-semibold text-white truncate">{s.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">SKU: {s.sku}</div>
                      <div className="mt-1 flex justify-between text-[11px]">
                        <span className="text-rose-400 font-bold">Atual: {s.currentStock}</span>
                        <span className="text-sky-300">Sugerido: +{s.suggestedQuantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Armazéns & Localizações Cadastradas */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-slate-300 mb-2">Armazéns & Localizações Ativas:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {warehouses.map((w) => (
                  <div key={w.id} className="p-3 bg-slate-800 rounded-xl border border-slate-700">
                    <div className="font-bold text-xs text-white flex items-center justify-between">
                      <span>🏢 {w.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">({w.code})</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {w.locations.map((loc) => (
                        <div
                          key={loc.id}
                          className="text-[11px] text-slate-300 flex justify-between items-center bg-slate-900/60 px-2 py-1 rounded"
                        >
                          <span>📍 {loc.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">{loc.code}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {warehouses.length === 0 && (
                  <div className="col-span-full py-6 text-center text-slate-500 text-xs">
                    Nenhum armazém configurado para este tenant.
                  </div>
                )}
              </div>
            </div>

            {/* Saldos de Stock */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-slate-300 mb-2">Saldos de Stock por Armazém:</h4>
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {stockBalances.map((sb) => (
                  <div
                    key={sb.id}
                    className="p-3 bg-slate-800 rounded-xl border border-slate-700 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-semibold text-xs text-white">{sb.product.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        SKU: {sb.product.sku} | Armazém: {sb.location.warehouse.name} ({sb.location.name})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xs text-emerald-400 font-mono">{sb.quantity} un.</div>
                      <span className="text-[10px] text-slate-400">
                        {sb.quantity <= 5 ? "Stock Baixo" : "Disponível"}
                      </span>
                    </div>
                  </div>
                ))}
                {stockBalances.length === 0 && (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Nenhum saldo de stock registado nas localizações deste armazém.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ABA 4: CAIXA & TURNOS */}
        {activeTab === "cash" && (
          <section aria-label="Caixa" className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-bold text-base text-sky-400">💵 Turno de Caixa</h3>
                  <p className="text-xs text-slate-400">Terminal: #{tenant?.terminalId || "01"}</p>
                </div>
                <button
                  onClick={() => setIsCashModalOpen(true)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs ${
                    activeCashSession
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-amber-600 hover:bg-amber-500 text-white"
                  }`}
                >
                  {activeCashSession ? "Gerir Turno" : "Abrir Turno"}
                </button>
              </div>

              {(() => {
                const pendingCash = cashManager.getPendingAction();
                if (pendingCash?.status === "PENDING_CENTRAL_VALIDATION") {
                  return (
                    <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800 space-y-3">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>Pendente de validação central</span>
                      </div>
                      <p className="text-xs text-amber-200 leading-relaxed">
                        Existe uma operação de caixa (<strong>{pendingCash.type === "OPEN" ? "Abertura de Turno" : pendingCash.type === "CLOSE" ? "Fecho de Caixa" : pendingCash.type}</strong>) submetida offline e enfileirada na outbox com chave estável de idempotência.
                      </p>
                      <p className="text-[11px] text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-700/60">
                        <strong>Aviso Fiscal & Controlo:</strong> O turno não é considerado oficialmente aberto ou fechado, e nenhum total definitivo, divergência confirmada ou saldo reconciliado é exibido antes da validação oficial pelo backend.
                      </p>
                      <button
                        onClick={() => setIsCashModalOpen(true)}
                        className="py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white"
                      >
                        Ver Detalhes do Turno Pendente
                      </button>
                    </div>
                  );
                }
                if (pendingCash?.status === "CONFLICT") {
                  return (
                    <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-800 space-y-3">
                      <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                        <span>⚠️ Conflito no Turno de Caixa</span>
                      </div>
                      <p className="text-xs text-rose-200 leading-relaxed">
                        {pendingCash.errorDiagnostic || "Conflito detetado na validação central do turno. A mutação foi retida na outbox."}
                      </p>
                      <button
                        onClick={() => setIsCashModalOpen(true)}
                        className="py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-600 font-bold text-xs text-white"
                      >
                        Gerir Conflito de Turno
                      </button>
                    </div>
                  );
                }
                if (pendingCash?.status === "REJECTED") {
                  return (
                    <div className="p-4 rounded-xl bg-red-950/70 border border-red-800 space-y-3">
                      <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                        <span>❌ Operação Rejeitada pelo Servidor Central</span>
                      </div>
                      <p className="text-xs text-red-200 leading-relaxed">
                        {pendingCash.errorDiagnostic || "A operação de caixa foi rejeitada pelo backend. A mutação foi retida na outbox para auditoria."}
                      </p>
                      <button
                        onClick={() => setIsCashModalOpen(true)}
                        className="py-2.5 px-4 rounded-xl bg-red-700 hover:bg-red-600 font-bold text-xs text-white"
                      >
                        Ver Detalhes da Rejeição
                      </button>
                    </div>
                  );
                }

                if (activeCashSession) {
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-3 bg-slate-800 rounded-xl">
                          <span className="text-[11px] text-slate-400 block">Operador</span>
                          <span className="font-bold text-xs text-white">{activeCashSession.operatorName || user?.displayName}</span>
                        </div>
                        <div className="p-3 bg-slate-800 rounded-xl">
                          <span className="text-[11px] text-slate-400 block">Fundo Abertura</span>
                          <span className="font-bold text-xs text-emerald-400">
                            {((activeCashSession.openingCents || 0) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                          </span>
                        </div>
                        <div className="p-3 bg-slate-800 rounded-xl">
                          <span className="text-[11px] text-slate-400 block">Vendas no Turno</span>
                          <span className="font-bold text-xs text-white">{activeCashSession.summary?.salesCount ?? 0}</span>
                        </div>
                        <div className="p-3 bg-slate-800 rounded-xl">
                          <span className="text-[11px] text-slate-400 block">Esperado em Dinheiro</span>
                          <span className="font-bold text-xs text-sky-300">
                            {(((activeCashSession.summary?.expectedCashCents ?? activeCashSession.openingCents)) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => setIsCashModalOpen(true)}
                          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-bold text-xs text-white"
                        >
                          Registar Sangria / Suprimento
                        </button>
                        <button
                          onClick={() => setIsCashModalOpen(true)}
                          className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold text-xs text-white"
                        >
                          Fecho Cego de Caixa
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-6 bg-slate-800/60 rounded-xl text-center space-y-3">
                    <span className="text-3xl block">🔒</span>
                    <div className="text-sm font-bold text-white">Nenhum turno de caixa aberto</div>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Para registar vendas com pagamento em numerário é obrigatório abrir um turno com fundo de maneio.
                    </p>
                    <button
                      onClick={() => setIsCashModalOpen(true)}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-bold text-xs"
                    >
                      Abrir Turno Agora
                    </button>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* ABA 5: MAIS & CONFIGURAÇÕES & ERP */}
        {activeTab === "more" && (
          <section aria-label="Mais" className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <h3 className="font-bold text-base text-sky-400 mb-3">🏢 Módulos Comerciais & ERP Mobile</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700 flex items-center justify-between"
                >
                  <span>👥 Clientes & Contas Correntes</span>
                  <span className="text-sky-400">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsReceptionModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700 flex items-center justify-between"
                >
                  <span>📥 Receção de Mercadorias (Compras)</span>
                  <span className="text-amber-400">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsInventoryModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700 flex items-center justify-between"
                >
                  <span>📋 Inventário Físico Touch</span>
                  <span className="text-emerald-400">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700 flex items-center justify-between"
                >
                  <span>🔄 Transferência entre Armazéns</span>
                  <span className="text-sky-400">→</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-base text-amber-400">⚖️ Conformidade, Fiscalidade & Administração</h3>
                <span className="text-[10px] bg-amber-950 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-800">
                  Homologação AGT Pendente
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mb-3">
                Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setIsDocumentsModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700 flex items-center justify-between"
                >
                  <span>📄 Documentos & Reimpressão</span>
                  <span className="text-amber-400">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiscalModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700 flex items-center justify-between"
                >
                  <span>⚖️ Fiscalidade & Tesouraria</span>
                  <span className="text-amber-400">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdminModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700 flex items-center justify-between"
                >
                  <span>🛡️ Gestão & ERP Corporativo</span>
                  <span className="text-amber-400">→</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-base text-sky-400">📡 Periféricos & Hardware</h3>
                <button
                  type="button"
                  onClick={() => setIsDeviceDiagnosticsOpen(true)}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-xs font-bold text-white shadow min-h-[44px]"
                >
                  Abrir Diagnóstico Completo
                </button>
              </div>
              <div className="space-y-2">
                {peripheralsList.map((p) => (
                  <div
                    key={p.type}
                    className="p-3 bg-slate-800 rounded-xl border border-slate-700 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-bold text-xs text-white">{p.label}</div>
                      <div className="text-[11px] text-slate-400">{p.description}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <h3 className="font-bold text-base text-white mb-3">Ações Rápidas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setIsTenantModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700"
                >
                  🏢 Alternar Empresa / Filial
                </button>
                <button
                  type="button"
                  onClick={() => setIsOutboxModalOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700"
                >
                  📦 Fila Outbox ({outboxSummary.total})
                </button>
                <button
                  type="button"
                  onClick={() => setAuthState("LOCKED")}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-left text-white border border-slate-700"
                >
                  🔒 Bloquear com PIN
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Navegação Inferior para Smartphone */}
      {!isTablet && <BottomNavigation activeTab={activeTab} onChangeTab={setActiveTab} />}

      {/* Menu Lateral para Tablet */}
      <TabletSidebar
        isOpen={isSidebarOpen}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        tenant={tenant}
        onOpenOutbox={() => setIsOutboxModalOpen(true)}
        onOpenTenantSelector={() => setIsTenantModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* MODAIS DO SISTEMA */}
      {authState === "LOCKED" && (
        <PinUnlockModal user={user} onUnlock={handlePinUnlock} onLogout={handleLogout} />
      )}

      <TenantSelectorModal
        isOpen={isTenantModalOpen}
        onClose={() => setIsTenantModalOpen(false)}
        memberships={memberships}
        currentTenant={tenant}
        onSelectTenant={handleSelectTenant}
        isLoading={false}
      />

      <OutboxDiagnosticsModal
        isOpen={isOutboxModalOpen}
        onClose={() => setIsOutboxModalOpen(false)}
        items={outbox.getAllDiagnostics(tenant?.companyId)}
        summary={outboxSummary}
        tenant={tenant}
        onRetryMutation={(id) => {
          if (!tenant) return { success: false, message: "Sem tenant ativo." };
          const res = outbox.retryMutation(id, tenant);
          setSyncCount((c) => c + 1);
          return res;
        }}
        onSyncNow={handleSyncOutbox}
        isSyncing={isSyncing}
      />

      {permissionModalConfig && (
        <PermissionModal
          isOpen={permissionModalConfig.isOpen}
          type={permissionModalConfig.type}
          rationale={permissionModalConfig.rationale}
          onConfirm={handleConfirmPermission}
          onCancel={() => setPermissionModalConfig(null)}
        />
      )}

      {/* MODAL: Checkout de Pagamento */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        totals={cartTotals}
        customer={cartManager.getCustomer()}
        onConfirmPayment={handleConfirmPayment}
        isOnline={isOnline}
        activeCashSessionId={activeCashSession?.id || null}
        offlineCashValidation={
          user && tenant
            ? cashManager.canCreateOfflineCashSale({
                companyId: tenant.companyId,
                branchId: tenant.branchId,
                terminalId: tenant.terminalId,
                userId: user.id,
              })
            : {
                allowed: false,
                reason:
                  "Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor.",
              }
        }
      />

      {/* MODAL: Turnos de Caixa */}
      {tenant && (
        <CashSessionModal
          isOpen={isCashModalOpen}
          onClose={() => setIsCashModalOpen(false)}
          cashManager={cashManager}
          outboxManager={outbox}
          isOnline={isOnline}
          apiUrl={apiUrl}
          token={accessToken}
          tenant={tenant}
          companyId={tenant.companyId}
          branchId={tenant.branchId}
          operatorName={user?.displayName || user?.username || "Operador"}
          terminalId={tenant.terminalId}
          onSessionUpdated={(s) => setActiveCashSession(s)}
        />
      )}

      {/* MODAL: Comprovativo Provisório */}
      <ProvisionalReceiptModal
        receiptData={provisionalReceiptData}
        onClose={() => setProvisionalReceiptData(null)}
      />

      {/* MODAL: Leitor Ótico */}
      <CameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* MODAIS DA FASE 4 */}
      <InventoryCountModal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        warehouses={warehouses}
        products={products}
        onSubmitCount={handleSubmitInventoryCount}
        isOnline={isOnline}
      />

      <StockTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        warehouses={warehouses}
        products={products}
        onSubmitTransfer={handleSubmitTransfer}
        isOnline={isOnline}
      />

      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customers={customers}
        receivables={receivables}
        onSelectCustomer={(c) => {
          cartManager.setCustomer(c);
          refreshCartState();
        }}
        onCreateCustomer={handleCreateCustomer}
        onRecordPayment={handleRecordCustomerPayment}
        isOnline={isOnline}
        activeCashSessionId={activeCashSession?.id || null}
      />

      <GoodsReceptionModal
        isOpen={isReceptionModalOpen}
        onClose={() => setIsReceptionModalOpen(false)}
        purchases={purchases}
        warehouses={warehouses}
        onSubmitReception={handleSubmitReception}
        isOnline={isOnline}
      />

      {/* MODAIS DA FASE 5: Documentos, Fiscalidade e Administração ERP */}
      {isDocumentsModalOpen && tenant && (
        <DocumentsModal
          serverUrl={apiUrl}
          token={accessToken}
          companyId={tenant.companyId}
          branchId={tenant.branchId}
          userRole={user?.role || "OPERATOR"}
          onClose={() => setIsDocumentsModalOpen(false)}
        />
      )}

      {isFiscalModalOpen && tenant && (
        <FiscalTreasuryModal
          serverUrl={apiUrl}
          token={accessToken}
          companyId={tenant.companyId}
          branchId={tenant.branchId}
          userRole={user?.role || "OPERATOR"}
          isOnline={isOnline}
          onClose={() => setIsFiscalModalOpen(false)}
        />
      )}

      {isAdminModalOpen && tenant && (
        <AdminEnterpriseModal
          serverUrl={apiUrl}
          token={accessToken}
          companyId={tenant.companyId}
          branchId={tenant.branchId}
          terminalId={tenant.terminalId}
          userRole={user?.role || "OPERATOR"}
          isOnline={isOnline}
          pendingOutboxCount={outboxSummary.pending}
          onClose={() => setIsAdminModalOpen(false)}
        />
      )}

      {/* MODAL DA FASE 6: Diagnóstico de Periféricos & Hardware */}
      <DeviceDiagnosticsModal
        isOpen={isDeviceDiagnosticsOpen}
        onClose={() => setIsDeviceDiagnosticsOpen(false)}
        onTriggerCamera={() => setIsCameraScannerOpen(true)}
        onBarcodeTested={handleBarcodeScanned}
      />
    </div>
  );
}
