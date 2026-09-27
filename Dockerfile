FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN apk add --no-cache postgresql-client \
    && npm ci --omit=dev

COPY . .

# Run the bot as the unprivileged Node user. A compromised bot process should
# not have root privileges inside the container.
USER node

EXPOSE 3000

CMD ["npm", "start"]
