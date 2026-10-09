FROM node:20-alpine

# Dependencias para compilar better-sqlite3 (módulo nativo)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Datos persistentes de SQLite
VOLUME ["/app/data"]

EXPOSE 80 6061

CMD ["node", "server.js"]
