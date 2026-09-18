FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN npm install
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm --workspace @angola/shared run build && npm --workspace @angola/backend run prisma:generate && npm --workspace @angola/backend run build
EXPOSE 4000
CMD ["node","apps/backend/dist/server.js"]
