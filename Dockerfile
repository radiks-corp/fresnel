FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=base /app /app
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
