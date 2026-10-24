# Beacon v1.1 — Major Experience Revamps

**Official motto:** Your community's all-in-one Discord assistant.

These additions are committed to `main`. They require live Discord verification before a production v1.1 release. No leagues, server XP resets, forced settings changes or paywall changes were added.

## 1. Error Rescue

Centralized typed error replies now include a **How to Fix** control plus the Beacon Support link. Troubleshooting is tailored to permissions, configuration, PostgreSQL, expired Discord interactions, connectivity and validation. Public panel messages are preserved when an already-acknowledged component fails. System errors retain support references without exposing internal stack traces.

## 2. Dashboard Favourites and Undo

- Open `/dashboard`; use **Favourites** to pin/unpin up to four frequently used features. Press **Refresh** for the new shortcut selector.
- Pins persist per server AND per manager in their own PostgreSQL-backed KV key. They do not overwrite guild configuration.
- Dashboard changes submitted through the settings form now save a guarded single-setting Undo snapshot. The **Undo** button shows a private confirmation; restoring requires Manage Server permissions, plus server ownership for progression changes.
- Undo compares current values against the saved snapshot and refuses to overwrite newer changes. Its one-use status is persisted and never expires automatically.
- Existing setup wizard and specialized ticket/verification dashboards keep their own update flows. The new Undo does **not** claim to reverse those workflows. The UI describes it as undoing the latest *dashboard setting* rather than every bot action.

## 3. Ticket Command Center

- Use `/ticket queue` as authorized support staff. The private staff inbox has filters: All Open, Unclaimed, Urgent, Needs Reply, and Closed.
- It includes seven tickets per page, Previous / Next / Refresh, priorities, assignments, relative age and summary stats.
- **Needs Reply** means a ticket lacks a stored first staff reply or is explicitly flagged as awaiting staff. It does not infer whether the requester has responded.
- Every filter button independently verifies staff permissions against current configuration and reads existing persistent ticket records. Paging and filtering never mutate tickets.

## 4. Reaction Role Studio

- Use `/reactroles studio` (administrators) for a visual preview of previously saved role panels.
- Preview shows destination channel, role names, and warnings about deleted or uncached roles, dangerous permissions, managed roles and Discord's bot-role hierarchy.
- Create Panel opens the existing guarded creation form. Edit Selected opens the existing panel management editor. No data is changed when simply previewing a panel.
- Existing saved panels are not automatically deleted after Discord cache misses or temporary fetch failures.

## Data and release guardrails

- Never delete a stored panel on an autocomplete or preview cache miss.
- Saved dashboard favourites, undo history and ticket status are persistent records, not in-memory collectors.
- Bot startup fails loudly if newly required controls failed to register, rather than shipping buttons that say the bot didn't respond.
- CI tests cover permission and UI wiring, favoured settings after simulated restarts, guarded Undo, inbox filters, role preflight and error-rescue advice.
- **Live verification still needed:** test all four interfaces inside Discord, with normal and restricted roles; restart Beacon and verify persisted favourites/snapshots; confirm PostgreSQL backup/restore and Docker deployment.
