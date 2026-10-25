/**
 * Goal-oriented command discovery. Uses the loaded Discord command registry,
 * not a static hard-coded command list, so results never advertise features
 * that are no longer installed.
 */
const CONCEPTS = Object.freeze({
  support: ['ticket', 'report'],
  tickets: ['ticket'],
  inbox: ['ticket queue'],
  queue: ['ticket queue', 'music queue'],
  feedback: ['suggest', 'report'],
  suggestion: ['suggest'],
  suggestions: ['suggest'],
  ideas: ['suggest'],
  complaint: ['report'],
  security: ['antinuke', 'roleaudit', 'lockdown', 'diagnose'],
  safety: ['antinuke', 'roleaudit', 'diagnose'],
  audit: ['roleaudit', 'logging', 'cases'],
  logs: ['logging', 'cases'],
  cases: ['cases', 'warnings'],
  appeal: ['cases'],
  setup: ['dashboard', 'diagnose', 'verification', 'reactroles'],
  configuration: ['dashboard', 'diagnose'],
  settings: ['dashboard'],
  roles: ['reactroles', 'autorole', 'roleaudit'],
  rolepicker: ['reactroles'],
  selfroles: ['reactroles'],
  verification: ['verification', 'verify', 'autoverify'],
  levels: ['levels', 'rank', 'progression'],
  levelling: ['levels', 'rank', 'progression'],
  leveling: ['levels', 'rank', 'progression'],
  xp: ['levels', 'rank', 'progression'],
  goals: ['progression quests', 'progression weekly'],
  challenges: ['progression quests', 'progression weekly'],
  missions: ['progression quests', 'progression weekly'],
  daily: ['progression quests'],
  weekly: ['progression weekly'],
  ranking: ['progression leaderboard', 'progression rank', 'rank'],
  leaderboard: ['progression leaderboard', 'rank'],
  server: ['serverinfo', 'dashboard'],
  games: ['flip', 'roll', 'count'],
  game: ['flip', 'roll'],
  fun: ['flip', 'roll'],
  music: ['music', 'play', 'queue'],
  songs: ['play', 'music'],
  raffle: ['giveaway', 'gcreate'],
  giveaway: ['giveaway', 'gcreate'],
  announcement: ['announcement'],
  welcome: ['greet', 'autorole'],
});

const clean = text => String(text || '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/^\//, '').replace(/[^a-z0-9]+/g, ' ').trim();

function commandJSON(command) {
  const data=command?.data;
  return typeof data?.toJSON==='function' ? data.toJSON() : data;
}

function expandEntries(command) {
  const json=commandJSON(command);
  if (!json?.name || command.legacyOnly) return [];
  const category=String(command.category||'Core').replace(/_/g,' ');
  const common={
    category,
    baseName:json.name,
    ownerOnly: Boolean(command.ownerOnly),
  };
  const options=Array.isArray(json.options)?json.options:[];
  const entries=[];
  for(const option of options){
    if(option.type===1){
      entries.push({...common,name:json.name+' '+option.name,
        description:option.description||json.description||'No description provided'});
    }else if(option.type===2){
      for(const nested of option.options||[]){
        if(nested.type===1)entries.push({...common,
          name:json.name+' '+option.name+' '+nested.name,
          description:nested.description||option.description||json.description||'No description provided'});
      }
    }
  }
  return entries.length?entries:[{...common,name:json.name,
    description:json.description||'No description provided'}];
}

export function searchBeaconCommandsByIntent(commands, query) {
  const needle=clean(query);
  if(!needle) return [];
  const words=needle.split(' ').filter(Boolean);
  const alt=[...new Set(words.flatMap(word=>CONCEPTS[word]||[]))];
  const results=[];
  for(const cmd of commands||[]){
    for(const entry of expandEntries(cmd)){
      const name=clean(entry.name),description=clean(entry.description),category=clean(entry.category);
      const full=name+' '+description+' '+category;
      const exact=name===needle;
      const starts=name.startsWith(needle);
      const inName=name.includes(needle);
      const inDescription=description.includes(needle);
      const inCategory=category.includes(needle);
      const allTokens=words.every(word=>full.includes(word));
      const semantic=alt.some(alias=>name===clean(alias)||name.startsWith(clean(alias)+' '));
      if(!exact&&!starts&&!inName&&!inDescription&&!inCategory&&!allTokens&&!semantic)continue;
      const score=exact?1000:starts?850:inName?710:allTokens?650:inDescription?500:inCategory?250:semantic?180:0;
      results.push({...entry,score});
    }
  }
  return results.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))
    .map(({score,...item})=>item);
}
