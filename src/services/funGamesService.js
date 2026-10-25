import { randomInt } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../utils/embeds.js';

// All games are stateless: no collectors, per-server records or database writes.
export const EIGHT_BALL_ANSWERS = Object.freeze([
  'Absolutely. The stars agree. ✨',
  'It is looking very promising. 🌟',
  'Signs point to yes. ✅',
  'Without a doubt. 🎯',
  'You can count on it. 💜',
  'My circuits say... probably! ⚡',
  'Ask again in a moment. 🌫️',
  'Too early to tell. ⏳',
  'The universe is being suspiciously quiet. 🤫',
  'Hmm. That is a tricky one. 🤔',
  'I would not bet on it. 👀',
  'Outlook not so good. 🌧️',
  'Probably not this time. 🎲',
  'All signs say no. ❌',
  'Not in this timeline. 🌌',
  'My sources say absolutely not. 🛑',
]);
export const RPS_MOVES = Object.freeze({
  rock: {label: 'Rock', emoji: '🪨'},
  paper: {label: 'Paper', emoji: '📄'},
  scissors: {label: 'Scissors', emoji: '✂️'},
});
const RPS_NAMES = Object.keys(RPS_MOVES);
export function safeGameText(value, max = 180) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ')
    .replace(/@/g,'@\u200b').trim().slice(0, max);
}
export function pick8BallAnswer(random = randomInt) {
  return EIGHT_BALL_ANSWERS[random(EIGHT_BALL_ANSWERS.length)];
}
export function build8BallPayload(question, playerId, random = randomInt) {
  const safe = safeGameText(question);
  if (!safe || !/^\d{17,20}$/.test(String(playerId))) throw new Error('Invalid 8-ball request');
  const embed = createEmbed({
    title: '🎱 Beacon • Magic 8-Ball',
    description: '**' + pick8BallAnswer(random) + '**',
    fields: [{name:'❓ Your Question',value:safe,inline:false}],
    color: 'primary',
    footer: 'Beacon • Just for fun — not a real prediction',
  });
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fun_8ball_again:' + playerId)
      .setLabel('Ask Again').setEmoji('🔮').setStyle(ButtonStyle.Secondary),
  );
  return {embeds:[embed],components:[actions],allowedMentions:{parse:[]}};
}
export function resolveRps(playerMove, random = randomInt) {
  if (!RPS_MOVES[playerMove]) throw new Error('Unknown RPS move');
  const beaconMove = RPS_NAMES[random(RPS_NAMES.length)];
  const draw = playerMove === beaconMove;
  const wins = {rock:'scissors',paper:'rock',scissors:'paper'};
  const outcome = draw ? 'draw' : wins[playerMove] === beaconMove ? 'win' : 'lose';
  return {playerMove,beaconMove,outcome};
}
function actionRow(playerId, selection = true) {
  if (selection) {
    return new ActionRowBuilder().addComponents(RPS_NAMES.map(move=>
      new ButtonBuilder().setCustomId('fun_rps:' + move + ':' + playerId)
        .setLabel(RPS_MOVES[move].label).setEmoji(RPS_MOVES[move].emoji)
        .setStyle(ButtonStyle.Primary)));
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fun_rps:again:' + playerId)
      .setLabel('Play Again').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );
}
export function buildRpsChoicePayload(playerId) {
  if (!/^\d{17,20}$/.test(String(playerId))) throw new Error('Invalid RPS player');
  return {
    embeds:[createEmbed({
      title:'✊ Beacon • Rock, Paper, Scissors',
      description:'**Your move!** Choose Rock, Paper or Scissors.\n\nYou versus Beacon. One round at a time.',
      color:'primary',
      footer:'Beacon • A friendly game for your community',
    })],
    components:[actionRow(playerId)],
    allowedMentions:{parse:[]},
  };
}
export function buildRpsResultPayload(playerId, move, random = randomInt) {
  const result = resolveRps(move, random);
  const messages = {win:'🎉 You win! GG!',lose:'🤖 Beacon wins! Better luck next time!',draw:'🤝 It is a tie!'};
  return {
    embeds:[createEmbed({
      title:'✊ Beacon • Rock, Paper, Scissors',
      description:'**You:** ' + RPS_MOVES[move].emoji + ' ' + RPS_MOVES[move].label +
        '\n**Beacon:** ' + RPS_MOVES[result.beaconMove].emoji + ' ' +
        RPS_MOVES[result.beaconMove].label + '\n\n**' + messages[result.outcome] + '**',
      color:result.outcome==='win'?'success':'primary',
      footer:'Beacon • Fancy a rematch?',
    })],
    components:[actionRow(playerId,false)],
    allowedMentions:{parse:[]},
  };
}
