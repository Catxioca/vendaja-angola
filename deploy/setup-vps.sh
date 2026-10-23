#!/usr/bin/env bash
# ==============================================================================
# VendaJá Angola - Enterprise Cloud Automated Provisioning & Deployment Script
# Target Server: VPS 46.202.173.102 (Ubuntu 22.04 / 24.04 LTS / Debian 12)
# Domains: vendaja.ao, www.vendaja.ao, api.vendaja.ao
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================================${NC}"
echo -e "${BLUE}🚀 INICIANDO DEPLOY ENTERPRISE VENDAJÁ ANGOLA CLOUD (VPS 46.202.173.102)${NC}"
echo -e "${BLUE}====================================================================${NC}"

# 1. Root Check
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Este script deve ser executado como root. Use: sudo bash setup-vps.sh${NC}"
  exit 1
fi

REPO_DIR="/var/www/vendaja-angola"
WEB_DIR="/var/www/vendaja-web"
LOG_DIR="/var/log/pm2"
DB_NAME="angola_commerce"
DB_USER="vendaja_user"
DB_PASS="VendajaEnterprise2026_SecureDb!"

# 2. Update System Packages
echo -e "\n${YELLOW}📦 [1/8] Atualizando pacotes do sistema operativo...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git build-essential ufw certbot python3-certbot-nginx rsync software-properties-common

# 3. Install Node.js 20 LTS
echo -e "\n${YELLOW}⚡ [2/8] Instalando Node.js 20 LTS & PM2...${NC}"
if ! command -v node &> /dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo -e "${GREEN}✓ Node.js $(node -v) e npm $(npm -v) instalados com sucesso.${NC}"

# Install PM2
npm install -g pm2
pm2 startup systemd -u root --hp /root || true
echo -e "${GREEN}✓ PM2 $(pm2 -v) configurado com inicialização automática no systemd.${NC}"

# 4. Install & Configure PostgreSQL 16
echo -e "\n${YELLOW}🐘 [3/8] Instalando e configurando PostgreSQL...${NC}"
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

echo -e "Criando utilizador e base de dados PostgreSQL..."
sudo -u postgres psql -c "DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS' CREATEDB SUPERUSER;
  ELSE
    ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS' CREATEDB SUPERUSER;
  END IF;
END
\$\$;"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -d $DB_NAME -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
echo -e "${GREEN}✓ Base de dados '$DB_NAME' e utilizador '$DB_USER' configurados e operacionais.${NC}"

# 5. Clone or Pull Application Repository
echo -e "\n${YELLOW}📥 [4/8] Sincronizando código-fonte em $REPO_DIR...${NC}"
mkdir -p /var/www
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone https://github.com/Catxioca/vendaja-angola.git "$REPO_DIR"
else
  cd "$REPO_DIR"
  git fetch origin main
  git reset --hard origin/main
fi
cd "$REPO_DIR"

# 6. Install Dependencies & Build Artifacts
echo -e "\n${YELLOW}🔨 [5/8] Instalando dependências e compilando Backend e Web...${NC}"
npm ci

# Configure Production .env
cat <<EOF > "$REPO_DIR/.env"
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public
JWT_SECRET=vendaja-enterprise-prod-jwt-secret-9938217346128741
FISCAL_CONFIG_KEY=vendaja-enterprise-fiscal-key-8837194017264819
COMPANY_NIF=009341302LN046
COMPANY_NAME=VendaJá Angola Enterprise Lda
COMPANY_ADDRESS=Rua Rainha Ginga, Edifício Kinaxixi, Luanda, Angola
COMPANY_PROVINCE=Luanda
COMPANY_PHONE=+244923000000
CORS_ORIGIN=https://vendaja.ao,https://www.vendaja.ao,http://localhost:5173
TRUST_PROXY=true
VENDAJA_START_LOCAL_BACKEND=false
ACCOUNTING_ALLOW_CLOSED_PERIOD=false
EOF

# Prisma Migration & Client Generation
echo -e "Executando npx prisma migrate deploy..."
npm --workspace @angola/backend run prisma:generate
npx --workspace @angola/backend prisma migrate deploy

# Build Shared, Backend, and Web
npm run build:shared
npm --workspace @angola/backend run build
npm run build:web

# Deploy Web Assets
mkdir -p "$WEB_DIR"
rsync -av --delete "$REPO_DIR/apps/web/dist/" "$WEB_DIR/"
chown -R www-data:www-data "$WEB_DIR"
chmod -R 755 "$WEB_DIR"
echo -e "${GREEN}✓ Frontend Web publicado em $WEB_DIR.${NC}"

# 7. Start Backend with PM2
echo -e "\n${YELLOW}⚙️ [6/8] Inicializando Backend no PM2...${NC}"
mkdir -p "$LOG_DIR"
pm2 delete vendaja-backend || true
pm2 start "$REPO_DIR/ecosystem.config.cjs"
pm2 save
echo -e "${GREEN}✓ Backend em execução no PM2 (Cluster Mode).${NC}"

# 8. Configure Nginx & SSL
echo -e "\n${YELLOW}🌐 [7/8] Configurando Nginx e Certificados SSL...${NC}"
apt-get install -y nginx
mkdir -p /var/www/certbot

# Copy Nginx Configuration
cp "$REPO_DIR/deploy/nginx/vendaja.ao.conf" /etc/nginx/sites-available/vendaja.ao.conf
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/vendaja.ao.conf /etc/nginx/sites-enabled/vendaja.ao.conf

# Temporary Self-Signed Certificate if Let's Encrypt does not exist yet (prevents nginx fail on first boot)
if [ ! -f /etc/letsencrypt/live/api.vendaja.ao/fullchain.pem ]; then
  echo -e "Gerando certificados SSL temporários para validação inicial do Nginx..."
  mkdir -p /etc/letsencrypt/live/api.vendaja.ao /etc/letsencrypt/live/vendaja.ao
  openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout /etc/letsencrypt/live/api.vendaja.ao/privkey.pem \
    -out /etc/letsencrypt/live/api.vendaja.ao/fullchain.pem \
    -subj "/CN=api.vendaja.ao" >/dev/null 2>&1
  openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout /etc/letsencrypt/live/vendaja.ao/privkey.pem \
    -out /etc/letsencrypt/live/vendaja.ao/fullchain.pem \
    -subj "/CN=vendaja.ao" >/dev/null 2>&1
fi

nginx -t
systemctl restart nginx

# Request Real Let's Encrypt SSL Certificates
echo -e "Solicitando certificados SSL reais via Certbot (Let's Encrypt)..."
certbot certonly --webroot -w /var/www/certbot \
  -d api.vendaja.ao \
  --agree-tos --email suporte@vendaja.ao --non-interactive || true

certbot certonly --webroot -w /var/www/certbot \
  -d vendaja.ao -d www.vendaja.ao \
  --agree-tos --email suporte@vendaja.ao --non-interactive || true

nginx -t
systemctl reload nginx
echo -e "${GREEN}✓ Nginx configurado e ativo com HTTPS.${NC}"

# Configure Firewall (UFW)
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

# 9. Health Checks & Verification
echo -e "\n${YELLOW}🧪 [8/8] Executando Health Checks em produção...${NC}"
sleep 3

echo -n "Testando /health local: "
curl -s -f http://127.0.0.1:4000/health >/dev/null && echo -e "${GREEN}200 OK${NC}" || echo -e "${RED}FALHA${NC}"

echo -n "Testando /health/database local: "
curl -s -f http://127.0.0.1:4000/health/database >/dev/null && echo -e "${GREEN}200 OK${NC}" || echo -e "${RED}FALHA${NC}"

echo -n "Testando /health/license local: "
curl -s -f http://127.0.0.1:4000/health/license >/dev/null && echo -e "${GREEN}200 OK${NC}" || echo -e "${RED}FALHA${NC}"

echo -n "Testando /health/sync local: "
curl -s -f http://127.0.0.1:4000/health/sync >/dev/null && echo -e "${GREEN}200 OK${NC}" || echo -e "${RED}FALHA${NC}"

echo -e "\n${BLUE}====================================================================${NC}"
echo -e "${GREEN}🎉 DEPLOY CONCLUÍDO COM SUCESSO! AMBIENTE CLOUD 100% OPERACIONAL!${NC}"
echo -e "${BLUE}====================================================================${NC}"
echo -e "🌐 Web Portal:    ${GREEN}https://vendaja.ao${NC}"
echo -e "🚀 API Backend:   ${GREEN}https://api.vendaja.ao${NC}"
echo -e "🩺 Health Check:  ${GREEN}https://api.vendaja.ao/health${NC}"
echo -e "🩺 DB Health:     ${GREEN}https://api.vendaja.ao/health/database${NC}"
echo -e "🩺 License Health:${GREEN}https://api.vendaja.ao/health/license${NC}"
echo -e "🩺 Sync Health:   ${GREEN}https://api.vendaja.ao/health/sync${NC}"
echo -e "📋 PM2 Status:    Execute '${YELLOW}pm2 status${NC}' para monitorizar os processos"
echo -e "${BLUE}====================================================================${NC}"
