# Beacon v1.1 — Next Polish Ideas

Official motto: **Your community's all-in-one Discord assistant.**

This is a living design shortlist, not a promise that the ideas below are implemented or ready for production. Build on `main`; never reset existing configuration, moderation logs, ticket history, server XP, or founding badges.

## Already implemented in the current polish wave

- **Help Quick Start:** Guided owner / moderator / community-member journey with working buttons and back navigation.
- **Actionable /diagnose:** Specific fixes for ticket routing, archive privacy, role hierarchy, logging and PostgreSQL; optional modules are not treated as failures.
- **Reaction-role autocomplete safety:** Cache misses and Discord fetch issues cannot silently delete saved panel records.
- **/serverinfo 2.0:** Public community snapshot by default, optional private view, real channel/boost data and progression status.
- **/firstmsg 2.0:** Jump button, original author/date, optional channel, permission checks, and private cross-channel response.
- **Community Suggestions Review:** Staff can save and publish Planned / Accepted / Declined / Under Review states without losing the existing public vote reactions.

## Highest-value next ideas — implement after stability review

1. **Dashboard Favourites & Recently Used:** Pin 3–5 settings to the top of /dashboard, so a moderator doesn't scroll through every module. Store per-server customisation and an Undo option.
2. **Setup Preset Preview:** One-click Gaming, Support Desk or Creator Community templates with a safe diff/preview and confirmation. NEVER silently create/delete roles or overwrite existing configured channels.
3. **Ticket Queue Command Center:** Filter unclaimed, urgent, awaiting-user and closed requests; show response time and staff assignment; don't expose private request contents outside staff context.
4. **Config Snapshot + Undo:** Every dashboard edit writes an audit revision with before/after field diff and a permission-checked restore. A failed save must leave the previous config intact.
5. **Reaction Role Panel Studio:** Preview the role picker, icons and descriptions before publishing, verify role hierarchy, and support safe re-posting without deleting old records on temporary Discord API failures.
6. **Command Search Synonyms:** /help understands 'verification', 'reports', 'bans', 'level', 'rank', 'welcomes' and common typos and shows relevant commands.
7. **Status and Error Rescue:** A central friendly error response with missing permissions, an actionable next step and a copyable support reference; don't overwrite the live dashboard.
8. **Moderation Case Timeline:** Staff-only chronological evidence, changes and appeals with a read-only export that respects privacy.
9. **Announcement Draft and Preview:** Preview embeds and mentions, add a confirmation screen before a broadcast, and save drafts without accidentally sending announcements.
10. **One-Click Health Summary:** /diagnose can share a sanitised setup report with staff without revealing private tokens, archived tickets or configuration secrets.
11. **Member Privacy Self-Service:** Show a member what Beacon stores about their contribution profile, then provide a deletion request path; do not promise instant erasure from historical backups.
12. **Release Notes + Optional Update Notices:** Let server owners subscribe to relevant Beacon releases and breaking changes without unsolicited DMs or channel spam.

## Guardrails

- No leagues, seasonal XP resets or paywalls for existing moderation, security or core progression.
- Follow the official branding rules in docs/BEACON_BRANDING.md.
- Privileged functions require explicit member permissions. Collectors may expire, but saved settings and review decisions must survive bot restarts.
- Never call v1.1.0 officially released without two live Discord smoke tests, PostgreSQL restore verification and a verified Docker deployment.
