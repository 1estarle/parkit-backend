# Etapa 1: Construcción (Builder)
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .

# Etapa 2: Producción (Imagen final ligera)
FROM node:18-alpine
WORKDIR /usr/src/app
# Solo copiamos lo necesario de la etapa anterior
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/server.js ./server.js
# Crear carpeta uploads para las fotos de ParkIt
RUN mkdir -p uploads 

EXPOSE 3000
CMD [ "node", "server.js" ]