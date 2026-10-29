# Beacon — Network Identity and Product Design

## Approved identity foundation

**Product:** Beacon • **Ecosystem:** Beacon Network • **Dashboard:** Beacon HQ.

The user-provided existing Beacon logo is the official reference: deep teal
background, central golden beacon/beam mark, thin cyan ring, uncluttered white
BEACON wordmark. Do not automatically replace this design with radio-tower
imagery or invent a new logo.

**Digital palette (approximate, until sampled from the logo):** deep teal
`#173131` • cyan `#13C9D2` • warm gold `#D6B55B` • white `#F3F7F5`.
Use cyan for primary interactions, gold for economy/rewards, and meaningful
success/warning colours for operational statuses.

## What Beacon is

Beacon is a connected community ecosystem with three pillars:

- **Protect:** moderation, security, anti-nuke, tickets and private cases.
- **Grow:** quests, server progression, contributions, rank cards.
- **Reward:** global Sand Coins, permanent Dispatch careers, cosmetics,
  and strictly opt-in Treasury Wars.

Every Discord server retains its own identity, privacy choices and rules.
Beacon Network connects experiences; it does not merge moderation
jurisdictions or make private records global.

**Beacon HQ** remains `/dashboard`, not another command. Help points to the
live features. Keep user-facing terminology natural and familiar.
Beacon Dispatch is an optional, more immersive experience; serious security
tools stay plain and direct.

**Network Pulse is explicitly excluded.** Do not add it or scheduled
community network digests.

## Slogan and voice

The old motto, `Your community's all-in-one Discord assistant.`, remains
a **legacy compatibility line** in existing UI/footers. The owner has rejected
proposed replacement slogans and **has not approved a new one**.
Do not unilaterally choose an official slogan; update the shared constant,
footer, public descriptions and docs together after approval.

Product writing: distinctive but conversational; no generic AI marketing
phrases, empty superlatives, or incessant metaphors about light and signals.
Warm in community experiences, professional in safety, immersed in Dispatch
only when opted in. Give concise instructions, not complicated jargon.

The Beacon Development Team can thank communities in suitable welcome/help
surfaces. Never add celebratory copy to punishments, security incidents,
error reports, tickets or evidence. Respect custom user-created messages.

## Command consolidation policy

Prefer meaningful existing groups, rather than standalone commands for every
minor operation. Creator maintenance belongs under `/ownerstats`, moderator
staff notes under `/cases`, and economy under `/sandcoins`.
Leave dangerous recovery controls, separate permission domains, and widely
used workflows alone when merging would make them less safe or harder to find.
Keep old handler modules for text-prefix/compatibility rather than deleting
their functionality. Add Help redirects from retired slash names.

No deletion or migration of saved wallet, XP, inventory, founder, case or
staff-note data is authorised by a navigation or branding change.

## Technical defaults

Use `src/config/beaconIdentity.js` for network copy and brand colour tokens.
Use `createEmbed` and `formatBeaconFooter` for branded default/status
embeds; preserve role/permission restrictions. Avoid irreversible rebranding
of existing user-created panels.
