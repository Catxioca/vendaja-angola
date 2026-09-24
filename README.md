# Angola Commerce Platform

## Fiscal module

The backend provides SAF-T AO XML export (`/api/v1/fiscal/saft`), deterministic invoice hashes, RSA-SHA1/RSA-SHA256 signing helpers, AGT-style receipt QR data and SVG rendering, VAT-zero exemption enforcement, and admin-only encrypted certificate/licence configuration APIs.

Set `SAFT_AO_XSD_PATH` to the current official AGT XSD to enable configured-file validation. Without it, the exporter performs structural XML checks only. This implementation is **not a claim of AGT legal homologation or certification**; verify the applicable AGT specification, XSD, exemption codes, signing/certificate requirements, and deployment controls before production use.

Secrets submitted to `/api/v1/fiscal/config` are encrypted at rest with `FISCAL_CONFIG_KEY` (falling back to `JWT_SECRET` for development) and are never returned by the API.

## Offline-first POS

The desktop renderer and PWA use the shared `@angola/shared` storage API. Sales, customers, cash movements, and the sync outbox are stored in IndexedDB (with a memory fallback for non-browser runtimes), then flushed to `/api/v1/sync` when connectivity returns. Set `VITE_API_URL` and store the bearer token in `localStorage.accessToken`; a stable `localStorage.deviceId` is generated automatically. The Electron app does not start PostgreSQL in offline mode: the local backend is started only when `VENDAJA_START_LOCAL_BACKEND=true` and `DATABASE_URL` is configured. The PostgreSQL backend remains a server-mode dependency; it is never silently created or migrated by the desktop installer.

The web build includes a manifest and a service worker that caches only same-origin application assets. API responses, bearer tokens, and secrets are deliberately excluded from the cache. The outbox is persisted transactionally in IndexedDB/Capacitor SQLite, survives restarts, and reports rejected mutations through the sync result callback for explicit conflict handling.

Build the PWA with `npm run build:web`, the Electron renderer with `npm run build:desktop`, or sync the generated PWA into Capacitor with `npm run cap:sync`. Native Android/iOS projects need the usual Capacitor platform installation/sync on the build machine. Receipt bytes are ESC/POS-compatible; use `NetworkPrinter`, `WebBluetoothPrinter`, or `ElectronPrinter` adapters supplied by the shared package. Fiscal hash/QR helpers are offline hooks and do not replace AGT certification.

## Deployment

Install and validate dependencies:

```sh
npm install
npm run db:generate
npm run typecheck
npm test --workspaces --if-present
```

Android (run on a machine with the Android SDK and JDK configured):

```sh
npm run build:web
npm run cap:sync:android
npm run android:assemble   # APK: android/app/build/outputs/apk/release
npm run android:bundle     # AAB: android/app/build/outputs/bundle/release
```

Offline, reproducible tablet artifacts can be built from the checked-in npm and
Gradle caches (no signing credentials are read):

```sh
npm run android:assemble:offline  # unsigned APK
npm run android:bundle:offline    # unsigned AAB
```

The offline commands run the web build and Capacitor Android sync first, then
invoke Gradle with `--offline`. They fail rather than downloading a missing
dependency. Sign the resulting artifact in a separate release environment.

Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`), `JAVA_HOME`, and `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, and `ANDROID_KEY_PASSWORD` in the
release environment. Configure the corresponding signing values in
`android/gradle.properties` or CI secrets; never commit them.

iOS requires macOS, Xcode, CocoaPods, and an Apple signing identity:

```sh
npm run build:web
npm run cap:sync:ios
npm run ios:open
```

Use `APPLE_TEAM_ID`, `APPLE_SIGNING_IDENTITY`, and an App Store provisioning profile
through Xcode or CI secrets. Native SQLite plugin changes require running the platform
sync command again.

Desktop installers:

```sh
npm run desktop:dist
# produces Windows NSIS, Linux .deb, and macOS .dmg (macOS builds require macOS)
```

For an offline Windows installer, pre-populate the Electron/electron-builder
caches once, then run:

```sh
npm run desktop:installer:offline
```

The desktop build explicitly compiles the shared package, runs Prisma Client generation, compiles the backend, creates `apps/backend/dist/bundle.js` for Electron, and then builds the renderer. Web, typecheck, and test scripts also build the shared package first, so a clean checkout does not depend on ignored package output. A clean checkout therefore does not depend on a manually copied backend bundle. `npm run lint` performs repository safety checks for tracked secrets and reproducible-install metadata; `npm test` runs workspace tests.

## Stock, purchases, and commercial documents

Stock is recorded through the location-aware ledger at `/api/v1/stock`. Warehouses and
locations are explicit, balances are locked during each transaction, negative balances
are rejected, and every movement retains its origin, reference, operator, and date.
`POST /api/v1/stock/transfers` performs the source and destination movements in one
transaction. `POST /api/v1/stock/inventory-counts` records a physical count and applies
the difference through the same ledger; its reference is idempotent and conflicting
replays are rejected.

Creating a purchase does not change stock. Only
`POST /api/v1/purchases/:id/receipts` does so, allowing partial and repeated receipts
without exceeding the ordered quantity. Supplier-specific prices are available through
`/api/v1/suppliers/:id/prices`. Commercial, non-fiscal documents are available through
`/api/v1/commercial-documents` for quotes, customer orders, delivery notes, customer
returns, and credit/debit notes; line and document discounts are persisted. Fiscal
invoicing and AGT validation remain in the existing fiscal module and are not replaced
by these documents.

The migration
`apps/backend/prisma/migrations/20260923150000_stock_purchases_documents/migration.sql`
is versioned but is not applied automatically by the desktop installer. Stock
replenishment thresholds and suggestions are stored per product, and tracked products
require lots or serial numbers; expired lots and insufficient lot quantities are
rejected. Inventory valuation uses weighted average cost per location:
`totalCostCents / quantity`, with outgoing movements valued at the current average.
Delivery notes reduce stock, customer returns increase it, and supplier returns reduce
it. Document series allocate numbers transactionally and validate the document type.
Procurement requests, supplier quotations, and purchase orders are separate audited
entities; receiving remains the only purchase operation that increases stock.

The PostgreSQL integration test is available as `npm --workspace @angola/backend run
test:integration` and requires `TEST_DATABASE_URL` pointing to a disposable database.
Without that variable the test is intentionally skipped, so local unit tests never
contact an external service.

This produces an unsigned NSIS installer with a deterministic
`<product>-<version>-win-<arch>.exe` name, never publishes, and never attempts
certificate discovery. The command fails if a required builder artifact is not
already cached.

Set `CSC_LINK`/`CSC_KEY_PASSWORD` for Electron Windows/macOS signing and
`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` where separate Windows credentials are used.
Linux packages can be signed separately with the distribution repository tooling.

### Dependency audit

`npm audit --json` currently reports **0 vulnerabilities** (0 low, 0 moderate,
0 high, 0 critical) after pinning Prisma 6.12.0 and upgrading Electron to 44.3.0.
Re-run the command after dependency changes; audit advisories can change independently
of application code.
# Contabilidade integrada

O módulo contabilístico usa partidas dobradas em `Journal`/`JournalLine` e mantém
`JournalEntry` para compatibilidade com dados históricos. Vendas, compras e
despesas confirmadas geram lançamentos idempotentes por `sourceType`/`sourceId`.
Os períodos são criados mensalmente quando necessário e impedem lançamentos
posteriores ao fecho. O endpoint `/api/v1/accounting/financial-statements`
expõe balancete, balanço e demonstração de resultados por intervalo.

As regras de IVA são configuráveis em `TaxRule`; as contas padrão são apenas uma
base operacional e devem ser revistas pelo contabilista da empresa. A integração
com AGT/SAF-T continua dependente do XSD oficial e de homologação externa; este
software não declara conformidade fiscal sem essa validação.
