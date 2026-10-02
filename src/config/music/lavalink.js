import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function parseNodesFromEnv() {
    const raw = process.env.LAVALINK_NODES?.trim();
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function loadNodesFromFile() {
    const nodesFile = process.env.LAVALINK_NODES_FILE?.trim()
        || path.join(projectRoot, 'lavalink', 'nodes.json');

    if (!existsSync(nodesFile)) return null;

    try {
        const parsed = JSON.parse(readFileSync(nodesFile, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.nodes)) return parsed.nodes;
    } catch {
        // Fall through to the single-node environment configuration.
    }

    return null;
}

export function getLavalinkNodes() {
    // An explicit environment node always wins. This is important for production
    // deployments where Beacon runs beside its own always-on Lavalink service.
    const envNodes = parseNodesFromEnv();
    if (envNodes?.length) return envNodes;

    const explicitHost = process.env.LAVALINK_HOST?.trim();
    if (explicitHost) {
        return [{
            host: explicitHost,
            port: Number(process.env.LAVALINK_PORT || 2333),
            password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
            secure: parseBoolean(process.env.LAVALINK_SECURE, false),
            name: process.env.LAVALINK_NAME || 'Beacon-Main',
        }];
    }

    const fromFile = loadNodesFromFile();
    if (fromFile?.length) return fromFile;

    return [{
        host: 'localhost',
        port: 2333,
        password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: parseBoolean(process.env.LAVALINK_SECURE, false),
        name: process.env.LAVALINK_NAME || 'Main',
    }];
}

export const lavalinkConfig = {
    nodes: getLavalinkNodes(),
    defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
    restVersion: process.env.LAVALINK_REST_VERSION || 'v4',
};

export default lavalinkConfig;
