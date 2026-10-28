# Beacon production image; keep Dockerfile builds explicit on Railway.
FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN apk add --no-cache postgresql-client \
    && npm ci --omit=dev --no-audit --no-fund

COPY . .

# Validate both syntax and live ESM imports for every event/component.
# An absent named export can pass node --check yet silently disable a handler
# at startup. Keep the full unit suite in GitHub CI to avoid Railway build
# timeouts while still stopping faulty deployments before startup.
RUN NODE_ENV=test node scripts/check.js \
    && NODE_ENV=test node --test tests/runtimeHandlerImportIntegrity.test.js \
    && NODE_ENV=test node --test tests/treasuryWars.test.js tests/diagnostics.test.js tests/requiredSlashCommands.test.js tests/v11CommandConsolidation.test.js tests/beaconCommandStreamlining.test.js tests/v11HelpIntentSearch.test.js tests/sandEconomyQoL.test.js tests/sandCoinsShopPreview.test.js

# Run as the unprivileged Node user, while granting it ownership of runtime-write directories.
RUN mkdir -p /usr/src/app/logs /usr/src/app/backups \
    && chown -R node:node /usr/src/app
USER node

EXPOSE 3000

CMD ["npm", "start"]
