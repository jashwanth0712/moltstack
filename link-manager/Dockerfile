FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
RUN mkdir -p data
EXPOSE 3100
CMD ["node", "server.js"]
