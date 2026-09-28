FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN apk add --no-cache postgresql-client \
    && npm ci --omit=dev

COPY . .

# Run as the unprivileged Node user, while granting it ownership of runtime-write directories.
RUN mkdir -p /usr/src/app/logs /usr/src/app/backups \
    && chown -R node:node /usr/src/app
USER node

EXPOSE 3000

CMD ["npm", "start"]
