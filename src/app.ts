// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/** @typedef {import("discord.js").TextChannel} TC */

// Dependencies
import * as Discord from "discord.js";
import { Cron } from "croner";

import * as conf from "./utils/configHandler";
import log from "./utils/logger";

// Handler
import messageHandler from "./handler/messageHandler";
import messageDeleteHandler from "./handler/messageDeleteHandler";
import BdayHandler from "./handler/bdayHandler";
import AoCHandler from "./handler/aocHandler";
import * as fadingMessageHandler from "./handler/fadingMessageHandler";
import * as storage from "./storage/storage";

// Other commands
import * as ban from "./commands/modcommands/ban";
import * as poll from "./commands/poll";
import GuildRagequit from "./storage/model/GuildRagequit";
import reactionHandler from "./handler/reactionHandler";
import {
    handleInteractionEvent,
    messageCommandHandler,
    registerAllApplicationCommandsAsGuildCommands
} from "./handler/commandHandler";
import { quoteReactionHandler } from "./handler/quoteHandler";
import NicknameHandler from "./handler/nicknameHandler";
import { assert } from "console";
import { connectAndPlaySaufen } from "./handler/voiceHandler";
import { reminderHandler } from "./commands/erinnerung";
import { endAprilFools, startAprilFools } from "./handler/aprilFoolsHandler";
import { Message, MessageReaction, User } from "discord.js";

const version = conf.getVersion();
const appname = conf.getName();
const devname = conf.getAuthor();

const splashPadding = 12 + appname.length + version.toString().length;

console.log(
    `\n #${"-".repeat(splashPadding)}#\n` +
    ` # Started ${appname} v${version} #\n` +
    ` #${"-".repeat(splashPadding)}#\n\n` +
    ` Copyright (c) ${(new Date()).getFullYear()} ${devname}\n`
);

log.info("Started.");

const config = conf.getConfig();
const client = new Discord.Client({
    partials: [
        "MESSAGE",
        "REACTION",
        "USER"
    ],
    /* allowedMentions: {
        parse: ["users", "roles"],
        repliedUser: true
    }, */
    intents: ["DIRECT_MESSAGES",
        "GUILDS",
        "GUILD_BANS",
        "GUILD_EMOJIS_AND_STICKERS",
        "GUILD_INTEGRATIONS",
        "GUILD_INVITES",
        "GUILD_MEMBERS",
        "GUILD_MESSAGES",
        "GUILD_MESSAGE_REACTIONS",
        "GUILD_MESSAGE_TYPING",
        "GUILD_PRESENCES",
        "GUILD_VOICE_STATES",
        "GUILD_WEBHOOKS"]
});

// @ts-ignore
process.on("unhandledRejection", (err, promise) => log.error(`Unhandled rejection (promise: ${promise}, reason: ${err.stack})`));
process.on("uncaughtException", (err, origin) => log.error(`Uncaught exception (origin: ${origin}, error: ${err})`));
process.on("SIGTERM", (signal) => log.error(`Received Sigterm: ${signal}`));
process.on("beforeExit", code => {
    log.warn(`Process will exit with code: ${code}`);
    process.exit(code);
});
process.on("exit", code => {
    log.warn(`Process exited with code: ${code}`);
});

const leetTask = async() => {
    const csz = client.guilds.cache.get(config.ids.guild_id);
    if (!csz) {
        log.error(`Could not find CSZ. Fix your stuff. Looked or guild with it: "${config.ids.guild_id}"`);
        return;
    }

    const hauptchat = csz.channels.cache.get(config.ids.hauptchat_id);
    if (!hauptchat) {
        log.error(`Could not find hauptChat. Fix your stuff. Looked or guild with it: "${config.ids.hauptchat_id}"`);
        return;
    }

    if (hauptchat.type !== "GUILD_TEXT") {
        log.error(`Hauptchat is of unsupported type "${hauptchat.type}"`);
        return;
    }

    await hauptchat.send("Es ist `13:37` meine Kerle.\nBleibt hydriert! :grin: :sweat_drops:");

    // Auto-kick members
    const sadPinguEmote = csz.emojis.cache.find(e => e.name === "sadpingu");
    const dabEmote = csz.emojis.cache.find(e => e.name === "Dab");

    const membersToKick = csz.members.cache
        .filter(m => m.roles.cache.filter(r => r.name !== "@everyone").size === 0)
        .filter(m => m.joinedTimestamp !== null && (Date.now() - m.joinedTimestamp >= 48 * 3_600_000));

    log.info(`Identified ${membersToKick.size} members that should be kicked.`);

    if (membersToKick.size > 0) {
        // I don't have trust in this code, so ensure that we don't kick any regular members :harold:
        assert(false, membersToKick.some(m => m.roles.cache.some(r => r.name === "Nerd")));

        await Promise.all([
            ...membersToKick.map(member => member.kick())
        ]);

        await hauptchat.send(`Hab grad ${membersToKick.size} Jockel*innen gekickt ${dabEmote}`);

        log.info(`Auto-kick: ${membersToKick.size} members kicked.`);
    }
    else {
        await hauptchat.send(`Heute leider keine Jockel*innen gekickt ${sadPinguEmote}`);
    }
};

let firstRun = true;

client.on("ready", async(_client) => {
    try {
        log.info("Running...");
        log.info(`Got ${client.users.cache.size} users, in ${client.channels.cache.size} channels of ${client.guilds.cache.size} guilds`);
        client.user!.setActivity(config.bot_settings.status);

        // When the application is ready, slash commands should be registered
        await registerAllApplicationCommandsAsGuildCommands(client);

        const cronOptions = {
            timezone: "Europe/Berlin"
        } as const;

        const bday = new BdayHandler(client);
        const aoc = new AoCHandler(client);
        log.info("Starting Nicknamehandler ");
        const nicknameHandler = new NicknameHandler(client);
        if (firstRun) {
            await storage.initialize();
            firstRun = false; // Hacky deadlock ...

            log.info("Scheduling 1338 Cronjob...");
            // eslint-disable-next-line no-unused-vars
            const l33tJob = new Cron("37 13 * * *", leetTask, cronOptions);

            log.info("Scheduling Birthday Cronjob...");
            // eslint-disable-next-line no-unused-vars
            const bDayJob = new Cron("1 0 * * *", async() => {
                log.debug("Entered Birthday cronjob");
                await bday.checkBdays();
            }, cronOptions);
            await bday.checkBdays();

            log.info("Scheduling Advent of Code Cronjob...");
            // eslint-disable-next-line no-unused-vars
            const aocJob = new Cron("0 20 1-25 12 *", async() => {
                log.debug("Entered AoC cronjob");
                await aoc.publishLeaderBoard();
            }, cronOptions);

            log.info("Scheduling Nickname Cronjob");
            // eslint-disable-next-line no-unused-vars
            const nicknameJob = new Cron("0 0 * * 0", async() => {
                log.debug("Entered Nickname cronjob");
                await nicknameHandler.rerollNicknames();
            }, cronOptions);

            log.info("Scheduling Saufen Cronjob");
            // eslint-disable-next-line no-unused-vars
            const saufenJob = new Cron("36 0-23 * * FRI-SAT,SUN", async() => {
                log.debug("Entered Saufen cronjob");
                await connectAndPlaySaufen(_client);
            }, cronOptions);

            log.info("Scheduling Reminder Cronjob");
            // eslint-disable-next-line no-unused-vars
            const reminderJob = new Cron("* * * * *", async() => {
                log.debug("Entered reminder cronjob");
                await reminderHandler(_client);
            }, cronOptions);

            // eslint-disable-next-line no-unused-vars
            const startAprilFoolsJob = new Cron("2022-04-01T00:00:00", async() => {
                log.debug("Entered start april fools cronjob");
                await startAprilFools(client);
            }, cronOptions);

            // eslint-disable-next-line no-unused-vars
            const stopAprilFoolsJob = new Cron("2022-04-02T00:00:00", async() => {
                log.debug("Entered end april fools cronjob");
                await endAprilFools(client);
            }, cronOptions);
        }

        ban.startCron(client);

        await poll.importPolls();
        poll.startCron(client);

        // Not awaiting this promise because it's basically an infinite loop (that can be cancelled)
        // Possible TODO: Refactor this to a cron job
        void fadingMessageHandler.startLoop(client);
    }
    catch (err) {
        log.error(`Error in Ready handler: ${err}`);
    }
});


/**
 * This is an additional Message handler, that we use as a replacement
 * for the "old commands". This way we can easily migrate commands to slash commands
 * and still have the option to use the textual commands. Win-Win :cooldoge:
 */
client.on("messageCreate", async(message) => {
    try {
        await messageCommandHandler(message, client);
    }
    catch (err) {
        log.error(`[messageCreate] Error on message ${message.id}. Cause: ${err}`);
    }
});

client.on("interactionCreate", async(interaction) => {
    try {
        await handleInteractionEvent(interaction, client);
    }
    catch (err) {
        log.error(`[interactionCreate] Error on interaction ${interaction.id}. Cause: ${err}`);
    }
});

client.on("guildCreate", guild => void log.info(`New guild joined: ${guild.name} (id: ${guild.id}) with ${guild.memberCount} members`));

client.on("guildDelete", guild => void log.info(`Deleted from guild: ${guild.name} (id: ${guild.id}).`));

client.on("guildMemberAdd", async member => {
    const numRagequits = await GuildRagequit.getNumRagequits(member.guild.id, member.id);
    if (numRagequits === 0) {
        return;
    }

    if (member.roles.cache.has(config.ids.shame_role_id)) {
        log.debug(`Member "${member.id}" already has the shame role, skipping`);
        return;
    }

    const shameRole = member.guild.roles.cache.get(config.ids.shame_role_id);
    if (!shameRole) {
        log.error(`Shame role not found: "${config.ids.shame_role_id}"`);
        return;
    }

    await member.roles.add(shameRole);

    const hauptchat = member.guild.channels.cache.get(config.ids.hauptchat_id);
    if (!hauptchat) {
        log.error(`Could not find hauptChat. Fix your stuff. Looked or guild with it: "${config.ids.hauptchat_id}"`);
        return;
    }

    if (hauptchat.type !== "GUILD_TEXT") {
        log.error(`Hauptchat is of unsupported type "${hauptchat.type}"`);
        return;
    }

    await hauptchat.send({
        content: `Haha, schau mal einer guck wer wieder hergekommen ist! <@${member.id}> hast es aber nicht lange ohne uns ausgehalten. ${numRagequits > 1 ? "Und das schon zum " + numRagequits + ". mal" : ""}`,
        allowedMentions: {
            users: [member.id]
        }
    });
});

client.on("guildMemberRemove", async(member) => {
    try {
        await GuildRagequit.incrementRagequit(member.guild.id, member.id);
    }
    catch (err) {
        log.error(`[guildMemberRemove] Error on incrementing ragequit of ${member.id}. Cause: ${err}`);
    }
});

client.on("messageCreate", async(message) => {
    try {
        await messageHandler(message, client);
    }
    catch (err) {
        log.error(`[messageCreate] Error on message ${message.id}. Cause: ${err}`);
    }
});

client.on("messageDelete", async(message) => {
    try {
        await messageDeleteHandler(message as Message, client);
    }
    catch (err) {
        log.error(`[messageDelete] Error for ${message.id}. Cause: ${err}`);
    }
});

client.on("messageUpdate", async(_, newMessage) => {
    try {
        await messageHandler(newMessage as Message, client);
    }
    catch (err) {
        log.error(`[messageUpdate] Error on message ${newMessage.id}. Cause: ${err}`);
    }
});

client.on("error", e => void log.error(`Discord Client Error: ${e}`));
client.on("warn", w => void log.warn(`Discord Client Warning: ${w}`));
client.on("debug", d => {
    if (d.includes("Heartbeat")) {
        return;
    }

    log.debug(`Discord Client Debug: ${d}`);
});
client.on("rateLimit", rateLimitData => void log.error(`Discord Client RateLimit Shit: ${JSON.stringify(rateLimitData)}`));
client.on("invalidated", () => void log.debug("Client invalidated"));

client.on("messageReactionAdd", async(event, user) => reactionHandler(event as MessageReaction, user as User, client, false));
client.on("messageReactionAdd", async(event, user) => quoteReactionHandler(event as MessageReaction, user as User, client));
client.on("messageReactionRemove", async(event, user) => reactionHandler(event as MessageReaction, user as User, client, true));

client.login(config.auth.bot_token).then(() => {
    log.info("Token login was successful!");
}, err => {
    log.error(`Token login was not successful: "${err}"`);
    log.error("Shutting down due to incorrect token...\n\n");
    process.exit(1);
});