import { createEmbed } from '../utils/embeds.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { claimSandDaily } from '../services/sandCoinsService.js';

const format = amount => amount.toLocaleString('en-US') + ' SC';

/** Shared handler for /daily and /sandcoins daily: one global wallet. */
export async function respondSandDaily(interaction) {
 const result = await claimSandDaily(interaction.client, { userId: interaction.user.id });
 const next = '<t:' + result.nextClaimAt + ':R>';
 if (!result.claimed) {
  return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({
   title: '🪙 Daily Sand Coins Already Claimed',
   description: 'You already claimed your daily reward today. Come back ' + next + '!',
   fields: [
    { name: 'Current streak', value: '**' + result.streak + '/7 days**', inline: true },
    { name: 'Next reward', value: format(result.nextReward), inline: true },
    { name: 'Your balance', value: format(result.balance), inline: true },
   ],
   color: 'info',
   footer: 'One daily claim per person across all Beacon servers • UTC reset',
  })] });
 }
 const max = result.streak === 7;
 return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({
  title: max ? '👑 Maximum Daily Streak!' : '🪙 Daily Sand Coins Claimed!',
  description: '**+' + format(result.amount) + '** added to your global Sand Coins wallet!',
  fields: [
   { name: '🔥 Daily Streak', value: '**Day ' + result.streak + '/7**' + (max ? ' • MAX' : ''), inline: true },
   { name: '🪙 New balance', value: '**' + format(result.balance) + '**', inline: true },
   { name: 'Next claim', value: next, inline: true },
  ],
  color: 'success',
  footer: 'Claim every UTC day to keep your streak • Miss a day and it resets to 1',
 })] });
}
