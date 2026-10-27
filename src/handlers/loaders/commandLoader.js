import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';
import { isOwnerOnlyCommand } from '../../config/commands/commandCategories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;
export const REQUIRED_V11_COMMANDS = Object.freeze(['diagnose', 'roleaudit', 'ticket', 'giveaway', 'time', 'sandcoins', 'rank', 'treasury']);
// Economy commands appear immediately in every guild; account state stays global.
const GUILD_ECONOMY_COMMANDS = Object.freeze(['sandcoins']);
// /rank card is published per guild only. The global duplicate is deleted on sync.
const GUILD_IMMEDIATE_COMMANDS = Object.freeze([...GUILD_ECONOMY_COMMANDS,'rank']);
export const REQUIRED_GLOBAL_COMMANDS = Object.freeze(REQUIRED_V11_COMMANDS.filter(name => !GUILD_IMMEDIATE_COMMANDS.includes(name)));

export function getMissingRequiredCommands(names) {
    const available = new Set(names);
    return REQUIRED_V11_COMMANDS.filter(name => !available.has(name));
}

export function assertRequiredCommandsPresent(names, stage = 'loaded', required = REQUIRED_V11_COMMANDS) {
    const available = new Set(names);
    const missing = required.filter(name => !available.has(name));
    if (missing.length) throw new Error('Beacon v1.1 ' + stage + ' commands missing: ' + missing.map(x => '/' + x).join(', '));
}

// These are configuration commands that have been replaced by /dashboard.
// /dashboard itself must remain registered.
const HIDDEN_COMMANDS = new Set([
    'commands',
    'configWizard',
    'logging',
    'welcome',
    'jointocreate',
    // Owner/internal or superseded commands remain hidden.
    // /reactroles stays available as a standalone studio.
    'broadcast', 'shorten', 'generatepassword', 'randomuser',
    // Replaced by /help + /botinfo and /dashboard → Welcome & Goodbye.
    'invite', 'greet',
]);

// Legacy handlers remain loaded for old text-prefix usage, but their
// standalone slash names are replaced with the streamlined command groups.
export const LEGACY_SLASH_COMMANDS = new Set([
  'gcreate', 'gdelete', 'gend', 'greroll',
  'ticketadd', 'ticketremove', 'ticketrename', 'claim', 'close', 'priority', 'ticketstats',
  'levels', 'unixtime', 'warn', 'autoverify', 'lock', 'unlock', 'goodbye', 'popularity',
  'broadcast', 'shorten', 'generatepassword', 'randomuser',
  // Standalone slash names replaced by /random, /math, and /time.
  // Retained as internal implementations and prefix handlers, not slash commands.
  'flip', 'roll', 'calculate', 'baseconvert', 'countdown',
  // Consolidated into /music, /botinfo, /treasury and /sandcoins.
  'play', 'queue', 'nowplaying', 'join', 'ping', 'status', 'support', 'heist', 'daily',
]);

function getSubcommandInfo(commandData) {
    const subcommands = [];
    if (commandData.options) {
        for (const option of commandData.options) {
            if (option.type === 1) subcommands.push(option.name);
            else if (option.type === 2 && option.options) {
                for (const subOption of option.options) {
                    if (subOption.type === 1) subcommands.push(`${option.name}/${subOption.name}`);
                }
            }
        }
    }
    return subcommands;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            if (file.name === 'modules') continue;
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) fileList.push(filePath);
    }
    return fileList;
}

export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../../commands');
    const commandFiles = await getAllFiles(commandsPath);
    logger.info(`Found ${commandFiles.length} command files to load`);
    const uniqueCommandNames = new Set();

    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const commandName = path.basename(filePath, '.js');
            if (HIDDEN_COMMANDS.has(commandName)) {
                logger.debug(`Skipping hidden configuration command: ${commandName}`);
                continue;
            }
            const commandDir = path.dirname(filePath);
            const category = path.basename(commandDir);
            const commandModule = await import(pathToFileURL(filePath).href);
            const command = commandModule.default || commandModule;
            if (!command.data || !command.execute) {
                logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
                continue;
            }
            command.legacyOnly = LEGACY_SLASH_COMMANDS.has(command.data.name);
            command.ownerOnly = isOwnerOnlyCommand(command.data.name);
            command.category = command.ownerOnly ? 'BotOwner' : category;
            command.filePath = normalizedPath;
            const primaryCommandName = command.data.name;
            if (uniqueCommandNames.has(primaryCommandName)) {
                logger.warn(`Duplicate command /${primaryCommandName} in ${normalizedPath}; keeping the first registered implementation.`);
                continue;
            }
            uniqueCommandNames.add(primaryCommandName);
            client.commands.set(primaryCommandName, command);
            const subcommands = getSubcommandInfo(command.data.toJSON());
            logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`);
            if (subcommands.length > 0) logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }

    const commandsWithSubcommands = Array.from(client.commands.values()).filter(cmd => getSubcommandInfo(cmd.data.toJSON()).length > 0);
    const totalSubcommands = commandsWithSubcommands.reduce((total, cmd) => total + getSubcommandInfo(cmd.data.toJSON()).length, 0);
    const uniqueCommands = new Set();
    for (const [name, command] of client.commands.entries()) if (command.data?.name && !command.legacyOnly) uniqueCommands.add(command.data.name);
    assertRequiredCommandsPresent(uniqueCommands, 'loaded');
    logger.info(`Loaded ${uniqueCommands.size} commands`);
    return client.commands;
}

function collectCommandPayloads(client) {
    const commands = [];
    let totalSubcommands = 0;
    const registeredNames = new Set();
    for (const command of client.commands.values()) {
        if (command.legacyOnly) continue;
        if (!command.data || typeof command.data.toJSON !== 'function') {
            logger.warn(`Command missing data or toJSON method: ${command}`);
            continue;
        }
        const commandName = command.data.name;
        logger.debug(`Processing command for registration: ${commandName}`);
        if (registeredNames.has(commandName)) {
            logger.debug(`Skipping duplicate command: ${commandName}`);
            continue;
        }
        registeredNames.add(commandName);
        const commandJson = command.data.toJSON();
        commands.push(commandJson);
        totalSubcommands += getSubcommandInfo(commandJson).length;
        if (process.env.NODE_ENV !== 'production') logger.debug(`Registering command: ${commandName}`);
    }
    return { commands, totalSubcommands };
}

function validateCommands(commands) {
    const validationErrors = [];
    for (const cmd of commands) {
        if (cmd.name && cmd.name.length > 32) validationErrors.push(`Command ${cmd.name} has name longer than 32 chars: "${cmd.name}" (${cmd.name.length} chars)`);
        if (cmd.description && cmd.description.length > 110) validationErrors.push(`Command ${cmd.name} has description longer than 110 chars: "${cmd.description}" (${cmd.description.length} chars)`);
        if (!cmd.options) continue;
        for (const option of cmd.options) {
            if (option.name && option.name.length > 32) validationErrors.push(`Command ${cmd.name} option ${option.name} has name longer than 32 chars: "${option.name}" (${option.name.length} chars)`);
            if (option.description && option.description.length > 110) validationErrors.push(`Command ${cmd.name} option ${option.name} has description longer than 110 chars: "${option.description}" (${option.description.length} chars)`);
            if (option.choices) for (const choice of option.choices) {
                if (choice.name && choice.name.length > 110) validationErrors.push(`Command ${cmd.name} option ${option.name} choice ${choice.name} has name longer than 110 chars: "${choice.name}" (${choice.name.length} chars)`);
                if (choice.value && choice.value.length > 100) validationErrors.push(`Command ${cmd.name} option ${option.name} choice ${choice.name} has value longer than 100 chars: "${choice.value}" (${choice.value.length} chars)`);
            }
            if (!option.options) continue;
            for (const subOption of option.options) {
                if (subOption.name && subOption.name.length > 32) validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} has name longer than 32 chars: "${subOption.name}" (${subOption.name.length} chars)`);
                if (subOption.description && subOption.description.length > 110) validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} has description longer than 110 chars: "${subOption.description}" (${subOption.description.length} chars)`);
                if (subOption.choices) for (const choice of subOption.choices) {
                    if (choice.name && choice.name.length > 110) validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} choice ${choice.name} has value longer than 100 chars: "${choice.value}" (${choice.value.length} chars)`);
                }
            }
        }
    }
    if (validationErrors.length > 0) {
        logger.error('Command validation failed. Errors:');
        validationErrors.forEach(error => logger.error(`  - ${error}`));
        throw new Error(`Command validation failed with ${validationErrors.length} errors`);
    }
}

function prepareCommandsForRegistration(commands) {
    if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) logger.warn(`Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} global command limit`);
    if (commands.length <= MAX_COMMANDS) return commands;
    throw new Error(`Too many slash commands (${commands.length}). Refusing to silently hide commands above Discord's ${MAX_COMMANDS}-command limit.`);
}

/**
 * Per-guild upserts are available immediately, avoiding propagation delays
 * seen with the global Sand Coins command. Each POST changes ONE definition;
 * the currency, balance, and streak still live in a global account wallet.
 */
async function upsertEconomyGuildCommand(client,guildId,commandName,options={}){
 const clientId=options.clientId||client.config?.bot?.clientId;
 if(!clientId)throw new Error('CLIENT_ID is required for economy guild registration');
 if(!guildId)throw new Error('Guild ID is required for economy guild registration');
 if(!client.rest?.post)throw new Error('Discord REST client unavailable for economy guild registration');
 const command=client.commands?.get(commandName);
 if(!command?.data?.toJSON)throw new Error('Missing immediate guild command /'+commandName);
 const {dm_permission,contexts,integration_types,...payload}=command.data.toJSON();
 validateCommands([payload]);
 const route=`/applications/${clientId}/guilds/${guildId}/commands`;
 const result=await client.rest.post(route,{body:payload});
 if(!result||result.name!==commandName||!result.id||(result.guild_id&&result.guild_id!==guildId))
  throw new Error('Discord did not confirm /'+commandName+' in guild '+guildId);
 // Validate Discord's actual stored definition, not just the posted payload.
 // An old guild-scoped /rank can otherwise hide a working global /rank card.
 if(commandName==='rank' && !result.options?.some(option=>
  option.name==='card' && option.options?.some(field=>field.name==='server_id')))
  throw new Error('Discord did not confirm /rank card server_id in guild '+guildId);
 logger.info('Verified immediate /'+commandName+' guild registration in '+guildId);
 return result;
}
export function registerSandCoinsGuildCommand(client,guildId,options={}){
 return upsertEconomyGuildCommand(client,guildId,'sandcoins',options);
}
export function registerDailyGuildCommand(client,guildId,options={}){
 return upsertEconomyGuildCommand(client,guildId,'daily',options);
}
/**
 * Application guild scope is reserved for /sandcoins and /rank.
 * Prune stale CHAT_INPUT registrations one by one; never use bulk overwrite
 * or touch context menu commands. Verify the actual Discord response afterward.
 */
export async function reconcileGuildSlashCommands(client,guildId,options={}){
 const id=options.clientId||client.config?.bot?.clientId;
 if(!id||!guildId)throw new Error('Cannot verify guild slash commands without application and guild IDs');
 if(!client.rest?.get||!client.rest?.delete){
  logger.warn('Guild slash command verification unavailable in guild '+guildId);
  return {verified:false,removed:[]};
 }
 const route=`/applications/${id}/guilds/${guildId}/commands`;
 const records=await client.rest.get(route);
 if(!Array.isArray(records))throw new Error('Discord did not return a guild slash command list');
 const intended=new Set(GUILD_IMMEDIATE_COMMANDS);
 const stale=records.filter(cmd=>(cmd.type===undefined||cmd.type===1)&&!intended.has(cmd.name));
 for(const cmd of stale){
  if(!cmd.id)throw new Error('Stale guild command /'+cmd.name+' has no ID; refusing unsafe cleanup');
  await client.rest.delete(route+'/'+cmd.id);
 }
 const verified=await client.rest.get(route);
 if(!Array.isArray(verified))throw new Error('Discord did not confirm guild cleanup');
 const unexpected=verified.filter(cmd=>(cmd.type===undefined||cmd.type===1)&&!intended.has(cmd.name));
 const missing=[...intended].filter(name=>!verified.some(cmd=>
  (cmd.type===undefined||cmd.type===1)&&cmd.name===name));
 if(unexpected.length||missing.length)
  throw new Error('Guild slash registry mismatch '+guildId+': stale '+
   unexpected.map(cmd=>cmd.name).join(',')+'; missing '+missing.join(','));
 if(stale.length)logger.info('Removed '+stale.length+' stale guild slash command(s) in '+guildId+
  ': '+stale.map(cmd=>'/'+cmd.name).join(', '));
 return {verified:true,removed:stale.map(cmd=>cmd.name)};
}
/** Compatibility API for callers that previously only cleaned /daily. */
export async function removeLegacyDailyGuildCommand(client,guildId,options={}){
 const result=await reconcileGuildSlashCommands(client,guildId,options);
 return result.removed.includes('daily');
}
export async function registerGuildCommands(client,guildId,options={}){
 for(const name of GUILD_IMMEDIATE_COMMANDS)
  await upsertEconomyGuildCommand(client,guildId,name,options);
 await reconcileGuildSlashCommands(client,guildId,options);
 return GUILD_IMMEDIATE_COMMANDS.length;
}
export async function registerSandCoinsAllGuilds(client,options={}){
 const guilds=[...(client.guilds?.cache?.values()||[])];
 let registered=0;
 const failed=[];
 for(const guild of guilds){
  try{
   await registerGuildCommands(client,guild.id,options);
   registered++;
  }catch(error){
   failed.push(guild.id);
   logger.error('Immediate command registration failed for guild '+guild.id+': '+error.message);
  }
 }
 logger.info('Sand Coins + Rank guild sync: '+registered+'/'+guilds.length+' registered'+
  (failed.length?' (failed: '+failed.join(', ')+')':''));
 return {registered,total:guilds.length,failed};
}

export async function clearGuildScopedCommands(client, clientId = client.config?.bot?.clientId) {
    if (!clientId || !client.rest || !client.guilds?.cache?.size) return;

    for (const guild of client.guilds.cache.values()) {
        try {
            await client.rest.put(`/applications/${clientId}/guilds/${guild.id}/commands`, { body: [] });
            logger.info(`Cleared guild-scoped commands in ${guild.id} (${guild.name}); global commands remain available`);
        } catch (error) {
            logger.warn(`Failed to clear guild-scoped commands in guild ${guild.id} (${guild.name}): ${error.message}`);
        }
    }
}

async function registerGlobalCommands(client, clientId, commands, totalSubcommands) {
    if (!clientId) throw new Error('CLIENT_ID is required for global command registration');
    if (!client.rest) throw new Error('Discord REST client is not available for slash command registration');
    logger.info(`Preparing to register ${totalSubcommands + commands.length} commands globally`);
    validateCommands(commands);
    const commandsToRegister = prepareCommandsForRegistration(commands);
    assertRequiredCommandsPresent(commandsToRegister.map(command => command.name), 'outgoing', REQUIRED_GLOBAL_COMMANDS);
    const registered = await client.rest.put(`/applications/${clientId}/commands`, { body: commandsToRegister });

    // Discord's bulk overwrite response is the authoritative registration result.
    // Reject partial/missing registrations instead of announcing false success.
    if (!Array.isArray(registered)) {
        throw new Error('Discord did not return a command list to confirm global registration.');
    }
    assertRequiredCommandsPresent(registered.map(command => command.name), 'Discord-registered', REQUIRED_GLOBAL_COMMANDS);
    const expectedNames=new Set(commandsToRegister.map(command=>command.name));
    const confirmedNames=new Set(registered.map(command=>command.name));
    const obsolete=registered.filter(command=>!expectedNames.has(command.name));
    const missing=commandsToRegister.filter(command=>!confirmedNames.has(command.name));
    if(obsolete.length||missing.length||registered.length!==commandsToRegister.length)
      throw new Error('Discord global slash registry mismatch: extra '+
        obsolete.map(command=>'/'+command.name).join(',')+'; missing '+
        missing.map(command=>'/'+command.name).join(','));
    logger.info(`Registered ${registered.length} global commands; no stale global slash entries`);
    client._beaconHelpCommandCache = null;
}

export async function registerCommands(client, options = {}) {
    const { clientId = null } = options;
    try {
        const { commands } = collectCommandPayloads(client);
        assertRequiredCommandsPresent(commands.map(command => command.name), 'loaded');

        // The one-time legacy guild cleanup must run BEFORE economy command sync.
        if (process.env.BEACON_CLEAN_LEGACY_GUILD_COMMANDS === 'true') {
            logger.warn('Explicit legacy guild command cleanup enabled');
            await clearGuildScopedCommands(client, clientId);
        }

        // Guild registrations appear immediately; keep both commands as global
        // fallbacks if any guild rejects its registration.
        const sync = await registerSandCoinsAllGuilds(client, { clientId });
        // A global /rank alongside a guild /rank renders TWO slash entries.
        // Never globally publish /rank while the bot is in any guild. The
        // global PUT also deletes the previous duplicate on startup.
        // Keep only economy global fallbacks when any guild upsert fails.
        const globalCommands = commands.filter(command =>
            (sync.total===0 || command.name!=='rank') &&
            (sync.total===0 || sync.failed.length>0 || !GUILD_ECONOMY_COMMANDS.includes(command.name)));
        if(sync.failed.length)
            logger.warn('Retaining global economy fallbacks; /rank stays guild-only to prevent duplicate slash entries');
        const totalSubcommands = globalCommands.reduce((sum, command) => sum + getSubcommandInfo(command).length, 0);
        await registerGlobalCommands(client, clientId, globalCommands, totalSubcommands);
    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    if (!command) return { success: false, message: `Command "${commandName}" not found` };
    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());
        const newCommand = (await import(moduleUrl.href)).default;
        client.commands.set(commandName, newCommand);
        logger.info(`Reloaded command: ${commandName}`);
        return { success: true, message: `Successfully reloaded command "${commandName}"` };
    } catch (error) {
        logger.error(`Error reloading command "${commandName}":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}