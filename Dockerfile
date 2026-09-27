FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN apk add --no-cache postgresql-client \
    && npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
