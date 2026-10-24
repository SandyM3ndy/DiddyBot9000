# Beacon — Official Branding

**Name:** Beacon

**Official motto (exact copy):** Your community's all-in-one Discord assistant.

The motto is Beacon's permanent brand line. Campaign copy may describe leaderboards or features but must not replace this line. Beacon is an all-in-one assistant, not just a leveling bot.

## Where to use it

- Main public interfaces such as /help, /botinfo, /invite, /support and project descriptions: prominently display the official motto.
- Ordinary command replies, error and success messages: use src/utils/embeds.js createEmbed so the official motto appears in the default footer.
- Contextual footer messages: use formatBeaconFooter from src/config/bot.js to preserve pagination, reset or safety information and append short Beacon attribution.
- Custom EmbedBuilder dashboards (tickets, reactions, verification, applications, logging, security, welcome, search): use a clear Beacon feature title or a branded contextual footer.
- Audit trails: use buildStandardLogEmbed and applyLogFooter for consistent attribution without hiding the responsible moderator/server.
- User-authored content from the Embed Studio, custom announcements and similar tools: preserve the user's own design. Brand Beacon's *controls*, not someone else's authored output.
- Small private confirmation messages: avoid repeating the full motto when a straightforward response is clearer.

## Safeguards

Keep existing colors and functional details. Do not change XP, permissions, storage, behavior or user content for branding purposes.

tests/beaconBranding.test.js checks the official wording and ensures default/custom command and audit footers stay consistently branded.
