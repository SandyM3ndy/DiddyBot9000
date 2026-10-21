# Beacon — Suggested commands (ideas only)
**Not implemented.** The user must approve additions or merges before development.

| Priority | Proposed command | Free/Paid concept | Why |
|---|---|---|---|
| Top | `/diagnose` | Free | Shows missing channel permissions and broken module setup for an administrator |
| Top | `/ticketstats` | Free summary / Pro history | Tickets opened, closed, first-response rate and claim activity |
| Top | `/roleaudit` | Free basic / Pro scheduled | Highlights roles with Administrator, Manage Roles or Manage Webhooks permissions |
| High | `/ticketnote` | Free | Staff-only internal notes linked to ticket ID, never visible to requester |
| High | `/modsummary` | Free | Action counts by date and type, with audit trail and permissions |
| High | `/suggestions` | Free | Lists suggestions, review status, and votes without manual scrolling |
| High | `/appstats` | Free basic / Pro trends | Accepted/denied/pending application summaries |
| Medium | `/commandsearch` | Free | Search by feature or keyword and get a clickable command mention |
| Medium | `/configexport` | Free | Server-admin export of safe configuration without secrets, IDs reviewed before sharing |
| Medium | `/logtest` | Free | Test whether configured channels can receive moderation/verification/ticket logs |
| Future | `/automodtest` | Free | Dry-run how automod would classify a message without taking actions |
| Future | `/schedule` | Pro possibility | Schedule staff announcements with timezone, permissions, cancel/edit controls |

Constraints: Avoid duplicating existing `/dashboard`, `/status`, `/cases`, `/apply status`, and the unresolved `/poll` variants. Keep moderation, security and core permissions free. Ticket metrics with historical storage should have appropriate privacy and retention controls.
