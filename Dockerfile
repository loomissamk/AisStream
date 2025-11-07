FROM node:18-slim
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* ./
RUN npm install || yarn install
COPY . .
CMD ["npm","run","dev"]
