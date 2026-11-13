export { SiteHeader, type SiteHeaderProps } from "./SiteHeader";
export { SiteFooter, type SiteFooterProps } from "./SiteFooter";
export { HomePage, type HomePageProps } from "./HomePage";
export { SolutionsPage, type SolutionsPageProps } from "./SolutionsPage";
export { ModulesPage, type ModulesPageProps, MODULES_DETAILED_CATALOG } from "./ModulesPage";
export { LoginPage, type LoginPageProps } from "./LoginPage";
export { BootstrapPage, type BootstrapPageProps } from "./BootstrapPage";
export { SecurityPage, type SecurityPageProps } from "./SecurityPage";
export { FiscalCompliancePage, type FiscalCompliancePageProps } from "./FiscalCompliancePage";
export { PrivacyPolicyPage, type PrivacyPolicyPageProps } from "./PrivacyPolicyPage";
export { TermsPage, type TermsPageProps } from "./TermsPage";
export { StatusPage, type StatusPageProps } from "./StatusPage";
export { ContactPage, type ContactPageProps } from "./ContactPage";
export {
  SITE_SEO_CATALOG,
  PUBLIC_INDEXABLE_SEO_CATALOG,
  NON_INDEXABLE_SEO_CATALOG,
  PRIVATE_DISALLOW_PATHS,
  resolveCanonicalOrigin,
  buildRobotsTxtContent,
  buildSitemapXmlContent,
  buildStructuredDataJsonLd,
  updatePageSeo,
  type PageSeoMetadata,
} from "./seo";
export { SobrePage } from "./SobrePage";
export * from "./session";
export * from "./router";
