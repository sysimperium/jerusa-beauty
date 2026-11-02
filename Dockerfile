FROM node:22-alpine

WORKDIR /app

# Em Node 22, o node:sqlite é nativo e não precisa de dependências externas de compilação
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts || true

COPY . .

# Pasta persistente para o banco SQLite
RUN mkdir -p /app/data

ENV PORT=3000
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "server.mjs"]
