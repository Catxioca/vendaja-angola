import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import {
  buildRobotsTxtContent,
  buildSitemapXmlContent,
  buildStructuredDataJsonLd,
  resolveCanonicalOrigin,
} from "./src/site/seo";

function vendajaSeoOriginPlugin(configuredOrigin: string | null): Plugin {
  let outDir = path.resolve(process.cwd(), "dist");
  const canonicalOrigin = resolveCanonicalOrigin({ configuredOrigin });

  return {
    name: "vendaja-seo-origin",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      if (!canonicalOrigin) {
        return html;
      }

      const structuredData = buildStructuredDataJsonLd(canonicalOrigin);
      const productionHeadTags = [
        `    <link rel="canonical" href="${canonicalOrigin}/" />`,
        `    <meta property="og:url" content="${canonicalOrigin}/" />`,
        structuredData
          ? `    <script type="application/ld+json">\n${structuredData}\n    </script>`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      return html.replace("</head>", `${productionHeadTags}\n  </head>`);
    },
    closeBundle() {
      if (!fs.existsSync(outDir)) {
        return;
      }

      fs.writeFileSync(path.join(outDir, "robots.txt"), buildRobotsTxtContent(canonicalOrigin), "utf-8");

      const sitemapPath = path.join(outDir, "sitemap.xml");
      const sitemapContent = buildSitemapXmlContent(canonicalOrigin);
      if (sitemapContent) {
        fs.writeFileSync(sitemapPath, sitemapContent, "utf-8");
      } else if (fs.existsSync(sitemapPath)) {
        fs.unlinkSync(sitemapPath);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredOrigin = env.VITE_PUBLIC_SITE_ORIGIN || env.PUBLIC_SITE_ORIGIN || null;

  return {
    base: "./",
    plugins: [react(), vendajaSeoOriginPlugin(configuredOrigin)],
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "vendor-react";
            }
            if (id.includes("@angola/shared") || id.includes("packages/shared")) {
              return "vendor-shared";
            }
          },
        },
      },
    },
  };
});
