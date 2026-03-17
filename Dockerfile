FROM node:18-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Usar el puerto estándar de Hugging Face
ENV PORT=7860
EXPOSE 7860

CMD ["node", "dist/index.js"]