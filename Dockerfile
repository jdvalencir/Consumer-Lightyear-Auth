# Imagen base oficial de Node.js
FROM bitnami/node:latest

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Comando para iniciar la app
CMD ["node", "index.js"]