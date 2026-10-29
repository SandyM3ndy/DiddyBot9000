/** Beacon Network visual identity, based on the owner's existing logo. */
export const BEACON_PALETTE=Object.freeze({
 deepTeal:'#173131',signal:'#13C9D2',gold:'#D6B55B',white:'#F3F7F5',
});
export const BEACON_IDENTITY=Object.freeze({
 name:'Beacon',network:'Beacon Network',hq:'Beacon HQ',
 presenceEmoji:'🌐',
 summary:'One community has its own story. Beacon gives it the tools to stay safe, the goals to grow, and shared experiences that reach beyond one server.',
 networkIntro:'Every server keeps its own identity. Beacon connects the things members choose to share: progression, global Sand Coins, rank cards and Dispatch careers.',
 networkJourney:'Earn Sand Coins by contributing in one community. Use them towards rank-card cosmetics for another. Your Dispatch career travels with you, while every server keeps its own settings and progression privacy.',
 pillars:Object.freeze(['Protect','Grow','Reward']),
 // One identity language for high-visibility Network experiences. No new product
 // features or cross-server data access are implied by these presentation labels.
 surfaces:Object.freeze({
  wallet:'Beacon Network • Sand Coins',
  dispatch:'Beacon Dispatch',
  shop:'Beacon Network • Rank Card Shop',
  treasury:'Beacon Network • Community Treasury',
  progression:'Beacon Progression',
  ranking:'Beacon Network • World Rankings',
 }),
});
