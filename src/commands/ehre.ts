import {SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandUserOption} from "@discordjs/builders";

import {Client, CommandInteraction, InteractionReplyOptions, MessagePayload} from "discord.js";

import {ApplicationCommand, CommandResult} from "./command";
import {EhreGroups, EhrePoints, EhreVotes} from "../storage/model/Ehre";


async function createEhreTable(client: Client<boolean>): Promise<MessagePayload | InteractionReplyOptions> {
    const userInGroups = await EhrePoints.getUserInGroups();
    return {
        embeds: [{
            color: 2007432,
            author: {
                name: client.user?.username
            },
            fields: [
                userInGroups.best ? {
                    name: "Ehrenpate",
                    value: userInGroups.best ? `<@${userInGroups.best}>` : "",
                    inline: false
                } : {
                    name: "Fangt an",
                    value: "Noch ist niemand geährt worden"
                },
                ...(userInGroups.middle.length > 0 ? [{
                    name: "Ehrenbrudis",
                    value: userInGroups.middle.map(user => `<@${user}>`).join(","),
                    inline: false
                }] : []),
                ...(userInGroups.bottom.length > 0 ? [{
                    name: "Ehrenhafte User",
                    value: userInGroups.bottom.map(user => `<@${user}>`).join(","),
                    inline: false
                }] : [])
            ]
        }],
        ephemeral: false
    };
}

function getVote(userInGroups: EhreGroups, voter: string): number {
    if (userInGroups.best === voter) {
        return 5;
    }
    else if (userInGroups.middle.includes(voter)) {
        return 2;
    }
    return 1;
}

async function handleVote(voter: string, user: string) {
    const userInGroups = await EhrePoints.getUserInGroups();
    await EhreVotes.insertVote(voter);
    await EhrePoints.addPoints(user, getVote(userInGroups, voter));
}

export class EhreCommand implements ApplicationCommand {
    modCommand: boolean = false;
    name: string = "ehre";
    description: string = "Fügt Ehre hinzu & Zeigt die tabelle an";

    get applicationCommand(): Pick<SlashCommandBuilder, "toJSON"> {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("add")
                    .setDescription("test")
                    .addUserOption(new SlashCommandUserOption()
                        .setRequired(true)
                        .setName("user").setDescription("Dem ehrenhaften User")))
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("tabelle")
                    .setDescription("Alle Ehrenuser")
            );
    }

    async handleInteraction(command: CommandInteraction, client: Client<boolean>): Promise<CommandResult> {
        const subcommand = command.options.getSubcommand();
        if (subcommand === "tabelle") {
            return command.reply(await createEhreTable(client));
        }
        const user = command.options.getUser("user", true);
        if (subcommand === "add") {
            if (command.user.id === user.id) {
                await EhrePoints.destroy({
                    where: {
                        userId: user.id
                    }
                });
                return command.reply("Willst dich selber ähren? Dreckiger Abschaum. Sowas verdient einfach kein Respekt!");
            }
            if (await EhreVotes.hasVoted(command.user.id)) {
                return command.reply("Ey, Einmal pro tag. Nicht gierig werden");
            }
            await handleVote(command.user.id, user.id);
        }
        return command.reply(`<@${command.user.id}> hat <@${user.id}> geährt`);
    }
}

