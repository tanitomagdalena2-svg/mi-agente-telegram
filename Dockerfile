FROM node:18-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Cambia a un puerto diferente
ENV PORT=8000
EXPOSE 8000

# Modifica también en el código (necesitarás cambiar src/index.ts)
CMD ["node", "dist/index.js"]