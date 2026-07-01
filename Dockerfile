# Etapa 1: Construcción (Builder)
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .

# Etapa 2: Producción (Imagen final ligera)
FROM node:18-alpine
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/server.js ./server.js

COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/initial_data.js ./initial_data.js

RUN mkdir -p uploads 

EXPOSE 3000
CMD [ "node", "server.js" ]