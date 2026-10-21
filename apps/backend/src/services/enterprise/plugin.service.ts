import crypto from "node:crypto";
import { prisma } from "../../db.js";

export interface PluginManifest {
  id: string;
  key: string;
  name: string;
  version: string;
  author: string;
  category: "PAYMENT" | "HOSPITALITY" | "ECOMMERCE" | "COMPLIANCE" | "BI" | "MESSAGING";
  description: string;
  permissions: string[];
  status: "AVAILABLE" | "INSTALLED" | "ACTIVE" | "DISABLED";
  enabled: boolean;
  icon: string;
}

export class EnterprisePluginMarketplaceService {
  private static catalog: PluginManifest[] = [
    {
      id: "ext-multicaixa-gpo",
      key: "ext-multicaixa-gpo",
      name: "Multicaixa TPA Direct Link",
      version: "1.4.0",
      author: "EMIS Angola & VendaJá",
      category: "PAYMENT",
      description: "Comunicação direta com terminais TPA físicos por USB, Série e Rede Local.",
      permissions: ["POS.Hardware", "Payment.Process"],
      status: "ACTIVE",
      enabled: true,
      icon: "💳",
    },
    {
      id: "ext-saft-agt-auto",
      key: "ext-saft-agt-auto",
      name: "Validador & Submissor Automático SAF-T AO",
      version: "1.1.0",
      author: "Consultoria Fiscal Angola",
      category: "COMPLIANCE",
      description: "Auditoria automática à estrutura XML do SAF-T antes do envio oficial ao portal da AGT.",
      permissions: ["Accounting.Export", "Audit.View"],
      status: "ACTIVE",
      enabled: true,
      icon: "📜",
    },
    {
      id: "ext-whatsapp-bot",
      key: "ext-whatsapp-bot",
      name: "WhatsApp Business CRM Bot",
      version: "2.3.0",
      author: "VendaJá Omnichannel",
      category: "MESSAGING",
      description: "Envio automático de faturas PDF, lembretes de cobrança e confirmações de encomenda via WhatsApp.",
      permissions: ["CRM.Read", "CRM.Write"],
      status: "ACTIVE",
      enabled: true,
      icon: "💬",
    },
    {
      id: "vj-kitchen-display",
      key: "vj-kitchen-display",
      name: "KDS — Ecrã de Cozinha & Bar",
      version: "2.0.1",
      author: "VendaJá Food Services",
      category: "HOSPITALITY",
      description: "Visualização em tempo real de pedidos de restauração agrupados por posto de confeção.",
      permissions: ["POS.Orders.Read", "POS.Orders.Update"],
      status: "INSTALLED",
      enabled: true,
      icon: "🍳",
    },
    {
      id: "vj-ecom-sync",
      key: "vj-ecom-sync",
      name: "E-Commerce Bridge (Shopify / WooCommerce)",
      version: "1.2.0",
      author: "VendaJá Digital",
      category: "ECOMMERCE",
      description: "Sincronização bidirecional de stock, catálogo e encomendas de lojas virtuais.",
      permissions: ["API.Products.Read", "API.Sales.Write"],
      status: "AVAILABLE",
      enabled: false,
      icon: "🛍️",
    },
    {
      id: "vj-bi-analytics",
      key: "vj-bi-analytics",
      name: "Power BI Executive Pack",
      version: "2.1.0",
      author: "VendaJá Enterprise",
      category: "BI",
      description: "Templates pré-construídos de dashboards e conexão de streaming com Power BI Service.",
      permissions: ["Reports.View", "API.Sales.Read"],
      status: "ACTIVE",
      enabled: true,
      icon: "📊",
    },
  ];

  /**
   * Lists all extensions in the marketplace
   */
  public static async listPlugins(): Promise<PluginManifest[]> {
    return this.catalog;
  }

  public static async listMarketplace(): Promise<PluginManifest[]> {
    return this.catalog;
  }

  /**
   * Installs an extension
   */
  public static async installPlugin(pluginKeyOrId: string, companyId?: string): Promise<{ success: boolean; plugin: PluginManifest }> {
    const plugin = this.catalog.find((p) => p.id === pluginKeyOrId || p.key === pluginKeyOrId);
    if (!plugin) throw new Error("Extensão não encontrada no marketplace");

    plugin.status = "ACTIVE";
    plugin.enabled = true;

    try {
      await prisma.enterpriseExtension.upsert({
        where: { extensionKey: plugin.key },
        create: {
          id: crypto.randomUUID(),
          companyId: companyId ?? null,
          extensionKey: plugin.key,
          name: plugin.name,
          version: plugin.version,
          author: plugin.author,
          description: plugin.description,
          status: "ACTIVE",
          permissions: plugin.permissions as unknown as object,
        },
        update: {
          status: "ACTIVE",
        },
      });
    } catch {
      // offline fallback
    }

    return { success: true, plugin };
  }

  /**
   * Toggles extension state (enable / disable)
   */
  public static async togglePlugin(pluginKeyOrId: string, active: boolean): Promise<{ success: boolean; plugin: PluginManifest }> {
    const plugin = this.catalog.find((p) => p.id === pluginKeyOrId || p.key === pluginKeyOrId);
    if (!plugin) throw new Error("Extensão não encontrada");

    plugin.status = active ? "ACTIVE" : "DISABLED";
    plugin.enabled = active;

    try {
      await prisma.enterpriseExtension.update({
        where: { extensionKey: plugin.key },
        data: { status: plugin.status },
      });
    } catch {
      // offline fallback
    }

    return { success: true, plugin };
  }

  public static async setPluginState(pluginKey: string, active: boolean): Promise<PluginManifest> {
    const res = await this.togglePlugin(pluginKey, active);
    return res.plugin;
  }

  /**
   * Uninstalls an extension
   */
  public static async uninstallPlugin(pluginKeyOrId: string): Promise<{ success: boolean }> {
    const plugin = this.catalog.find((p) => p.id === pluginKeyOrId || p.key === pluginKeyOrId);
    if (plugin) {
      plugin.status = "AVAILABLE";
      plugin.enabled = false;
    }

    try {
      if (plugin) {
        await prisma.enterpriseExtension.delete({
          where: { extensionKey: plugin.key },
        });
      }
    } catch {
      // offline fallback
    }

    return { success: true };
  }
}

export { EnterprisePluginMarketplaceService as PluginService, EnterprisePluginMarketplaceService as EnterprisePluginService };
