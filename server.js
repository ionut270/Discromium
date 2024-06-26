require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const commands = [
    {
        name: 'play',
        description: 'Plays a YouTube video in a voice channel',
        options: [
            {
                name: 'url',
                type: 3, // STRING
                description: 'The URL of the YouTube video',
                required: true
            }
        ]
    }
];

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') {
        const videoUrl = interaction.options.getString('url');
        if (!videoUrl) {
            await interaction.reply('No URL provided');
            return;
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            await interaction.reply('You need to be in a voice channel to use this command');
            return;
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        await interaction.reply(`Downloading and playing ${videoUrl}`);

        try {
            const info = await ytdl.getInfo(videoUrl);
            const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_'); // Clean title for filename
            const filePath = path.join(__dirname, 'downloads', `${title}.mp3`);

            const stream = ytdl(videoUrl, { quality: 'highestaudio' });

            ffmpeg(stream)
                .audioBitrate(128)
                .toFormat('mp3')
                .on('error', (err) => {
                    console.error(err);
                    interaction.followUp('Failed to convert video to MP3');
                })
                .save(filePath)
                .on('end', () => {
                    const player = createAudioPlayer();
                    const resource = createAudioResource(filePath);

                    player.play(resource);
                    connection.subscribe(player);

                    player.on(AudioPlayerStatus.Idle, () => {
                        connection.destroy();
                        fs.unlinkSync(filePath); // Delete the file after playing
                    });
                });

        } catch (error) {
            console.error(error);
            await interaction.followUp('Failed to download video');
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
