FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN apk add --no-cache postgresql-client \
    && npm ci --omit=dev --no-audit --no-fund

COPY . .

# Do a lightweight source integrity check during the image build.
# Full npm run preflight (syntax, unit tests and command audit) is already a
# mandatory GitHub Actions gate; rerunning the entire suite here makes Railway
# spend extra build resources, which can trigger environment-specific failures.
RUN node --check src/app.js && node scripts/check.js

# Run as the unprivileged Node user, while granting it ownership of runtime-write directories.
RUN mkdir -p /usr/src/app/logs /usr/src/app/backups \
    && chown -R node:node /usr/src/app
USER node

EXPOSE 3000

CMD ["npm", "start"]
