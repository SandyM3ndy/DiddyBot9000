# Beacon Privacy Policy

**Effective date:** October 25, 2026

Beacon ("the Bot") is a Discord bot operated by SandyM3ndy. This policy explains the information Beacon may process when installed in a Discord server.

## Information Beacon may process
- Discord identifiers such as user IDs, guild/server IDs, channel IDs, role IDs, and message IDs when required for a configured feature.
- Server configuration such as selected channels, roles, moderation settings, ticket settings, logging settings, welcome settings, reaction-role settings, and other dashboard preferences.
- Feature data created by server members or staff, such as moderation cases, warnings, tickets, applications, giveaways, polls, and server progression/XP data, when those features are enabled.
- When Server Progression is enabled: eligible activity counts attributed to Discord user IDs, daily/weekly quest completion and reward history, server XP, rank metadata, founding-community badges, and contributor display preferences. Beacon's progression features do not need to store chat message contents in their contribution records.
- For community suggestions submitted with `/suggest`: suggestion text, the author's Discord user ID, server and channel identifiers, timestamps, and staff review status are stored to keep review decisions available after restarts. Suggestion votes continue to use Discord reactions; Beacon does not need to store a separate list of voters for this feature.
- Technical information needed to operate the service, such as command activity, error information, timestamps, and diagnostic trace IDs.

Beacon does not require the contents of private messages for its normal server features. Some Discord features may require message content access where Discord requires it for that feature to function.

## How information is used
Information is used to provide, maintain, troubleshoot, and improve Beacon's configured Discord features; enforce server settings; maintain moderation and ticket records requested by a server; and diagnose technical failures.

## Storage and retention
Data may be stored in the Bot's configured database. Retention can depend on the feature and the server's configuration. Server administrators can request deletion of Beacon's stored server data through the support server.

Server progression lifetime XP, founder status, and historical quest results are intended to persist while the service and associated server records exist. Daily and weekly contribution counters roll over, while cumulative contributor counts can remain stored for continuity. A member can use `/progression privacy hidden:true` to opt out of the **public contributor ranking**; this does not automatically erase their stored contribution counts. Members wishing to request deletion of their stored contribution records can contact the support server. Backup copies may remain until their configured retention period expires.

Progression archives and backups may contain Discord server and user IDs and should be accessible only to authorized operators.

## Sharing
Beacon's stored data is not intentionally sold or shared for advertising. Information may be processed by infrastructure providers used to host the Bot or its database as necessary to operate the service.

## Children's privacy
Beacon is a Discord application. Server owners and users are responsible for using Discord and Beacon in accordance with Discord's rules and applicable law.

## Changes
This policy may be updated when Beacon's data practices change.

## Contact
For privacy questions or deletion requests, use the Beacon support server listed by the Bot's `/support` command.

---
This document describes the Bot's intended data handling and is not legal advice.