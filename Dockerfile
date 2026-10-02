FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/commet-push.sqlite

RUN mkdir -p /data

EXPOSE 8080

CMD ["npm", "start"]