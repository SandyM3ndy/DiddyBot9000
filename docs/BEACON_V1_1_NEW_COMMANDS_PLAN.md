# Beacon v1.1 — Proposed New Commands (Planning Only)

**Status:** Design approved as candidates, **not implemented or registered**.
This document records the required overlap audit and implementation order before touching slash command registration.

## Code inspected

- `/dashboard` (`src/commands/Core/dashboard.js`) already provides setup/configuration controls, but does not run a consolidated read-only health report.
- `ConfigService` (`src/services/config/configService.js`) already validates configuration values and detects certain conflicts; the future diagnosis system should reuse its schemas and guild config.
- `permissionGuard.js` already checks command access and bot/channel permissions on individual operations, not server-wide readiness.
- `/antinuke` and `antinukeService.js` already detect *new* dangerous role permission changes and expose the `DANGEROUS_PERMISSIONS` list. `roleCreate.js`, `roleUpdate.js` and `roleDelete.js` already have real-time protection. A role audit must not duplicate or alter this event handling.
- `/suggest` (`src/commands/Community/suggest.js`) posts a suggestion embed and reaction emojis without a persistent suggestion record. `/poll` has now been consolidated into one reaction-based voting command; it is not a substitute for suggestion review, approval or tracking.

## Recommended sequence

### 1. `/diagnose` — first

**Purpose:** Read-only, administrator-facing report of bot permissions and server configuration health.

Proposed checks:
- Guild-level availability of Beacon's own member object and key permissions.
- For configured welcome, update, audit log and ticket channels, confirm the channels still exist and Beacon can view/write them.
- Report whether configured moderator/staff/verification roles exist, can be accessed and are assignable given Beacon's actual role hierarchy.
- Verify whether the ticket system's configured roles/channels are present; report optional music dependencies as *unavailable* rather than saying music works without testing.
- Distinguish `Critical` (blocks a configured feature), `Warning` (degraded), `Informational` (optional/not configured).
- Do **not** create channels, grant permissions or modify config.

**Access:** Manage Server or server owner; ephemeral output. Cap fetches and messages; show "Not checked" on API errors rather than guessed successes.

**Acceptance:** Unit tests for diagnostic rule classification and channel permission mappings; two live test servers (configured and incomplete) before release.

### 2. `/roleaudit` — second

**Purpose:** Snapshot of roles with high-impact permissions; read-only and private.

Reuse **`DANGEROUS_PERMISSIONS`** from `src/services/antinukeService.js` as the base registry rather than maintaining contradictory lists.
Flag `Administrator` as critical, `Manage Roles`, `Manage Webhooks` as high, and other sensitive permissions at graded severity. Mark managed/integration roles and `@everyone` separately. Include role ID, permission names and whether Beacon's own hierarchy permits changes, but **never** automatically revoke roles or punish anyone.

**Access:** Manage Server/owner, private results, paginated output for servers with many roles. Test bitfields and managed roles.

### 3. `/suggestions` — third

**Purpose:** Manage submissions from existing `/suggest`: list, filter, review, approve/reject, report vote counts, and link to the original posts.

First decide a durable storage model with `guildId`, `channelId`, `messageId`, `creatorId`, `text`, `status`, `createdAt` and vote records. The existing emoji-reacted messages do **not** provide reliable historical vote records across database changes; show legacy results only as clearly labeled reaction-count estimates, or migrate carefully.

Keep `/suggest` as the submission command. Do not merge it with `/poll`; `/poll` is independently consolidated after owner approval. Restrict moderation actions to Manage Server or a configured suggestion reviewer role. Preserve existing messages and support data deletion/retention policies.

**Acceptance:** multi-guild data isolation, one vote per user, tie/changed-vote handling, deleted message recovery, a 25-option pagination limit, status-change audit trails and database persistence tests.

## Hard constraints before any registration change

- No new commands in `src/commands/` until implementation is reviewed and tested.
- The `/poll` merge was approved and completed in the v1.1 cleanup; preserve both legacy input styles.
- Preserve existing free and safety-critical functionality.
- Run `npm run preflight`, Docker build, migrations and security audit; perform actual Discord smoke tests before release.
- Keep `package.json` at v1.0.0 until v1.1 is accepted and launched.
