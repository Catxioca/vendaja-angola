#!/usr/bin/env bash
# ==============================================================================
# VendaJá Angola - Zero-Downtime Routine Cloud Update Script
# Usage: sudo bash deploy-update.sh
# ==============================================================================

set -euo pipefail

REPO_DIR="/var/www/vendaja-angola"
WEB_DIR="/var/www/vendaja-web"

echo "🔄 Atualizando repositório VendaJá Angola em $REPO_DIR..."
cd "$REPO_DIR"

git fetch origin main
git reset --hard origin/main

echo "📦 Instalando dependências e executando migrações Prisma..."
npm ci
npm --workspace @angola/backend run prisma:generate
npx --workspace @angola/backend prisma migrate deploy

echo "🔨 Recompilando backend e web..."
npm run build:shared
npm --workspace @angola/backend run build
npm run build:web

echo "🌐 Atualizando ficheiros estáticos da Web em $WEB_DIR..."
rsync -av --delete "$REPO_DIR/apps/web/dist/" "$WEB_DIR/"
chown -R www-data:www-data "$WEB_DIR"

echo "⚡ Executando PM2 Zero-Downtime Reload..."
pm2 reload vendaja-backend

echo "🩺 Verificando endpoints de saúde..."
sleep 2
curl -f http://127.0.0.1:4000/health
echo ""
echo "✅ Atualização concluída com sucesso sem tempo de inatividade!"
