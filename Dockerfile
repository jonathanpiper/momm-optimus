FROM node:21-alpine3.19 AS builder
WORKDIR /app
COPY . .
RUN npm i && npm run build

FROM node:21-alpine3.19 AS final
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/files/global ./dist/files/global
COPY package.json .
COPY .env .
RUN npm i
EXPOSE 3000
CMD ["npm", "run", "start"]