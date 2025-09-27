// 必要なライブラリを読み込みます
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

// === 設定情報を環境変数から取得します ===
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const FORWARD_CHANNEL_ID = process.env.FORWARD_CHANNEL_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// === 起動時に設定情報が揃っているかチェックします ===
if (!TARGET_USER_ID || !FORWARD_CHANNEL_ID || !BOT_TOKEN) {
    console.error("エラー: 必要な環境変数（TARGET_USER_ID, FORWARD_CHANNEL_ID, DISCORD_BOT_TOKEN）が設定されていません。");
    console.error("RenderのEnvironmentタブで設定を確認してください。");
    process.exit(1); // 設定がなければ起動せずに終了する
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// ボットが起動したときに一度だけ実行される処理です
client.on('ready', () => {
    console.log(`${client.user.tag} としてログインしました！`);
    console.log(`監視対象ユーザーID: ${TARGET_USER_ID}`);
    console.log(`転送先チャンネルID: ${FORWARD_CHANNEL_ID}`);
    console.log('監視を開始します...');
});

// (これ以降のコードは変更ありません)
// メッセージが送信されるたびに実行される処理です
client.on('messageCreate', async (message) => {
    if (message.author.id === TARGET_USER_ID) {
        try {
            const forwardChannel = await client.channels.fetch(FORWARD_CHANNEL_ID);
            if (!forwardChannel) return;

            const embed = new EmbedBuilder()
                .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                .setDescription(message.content || '（メッセージ本文がありません）')
                .setColor(0x00BFFF)
                .addFields(
                    { name: '送信元チャンネル', value: `<#${message.channel.id}>`, inline: true },
                    { name: 'メッセージへのリンク', value: `[ジャンプ](${message.url})`, inline: true }
                )
                .setTimestamp(message.createdAt)
                .setFooter({ text: 'メッセージが転送されました' });

            if (message.attachments.size > 0) {
                const attachment = message.attachments.first();
                if (attachment.url) embed.setImage(attachment.url);
            }

            const cancelButton = new ButtonBuilder()
                .setCustomId(`cancel-msg_${message.channel.id}_${message.id}`)
                .setLabel('送信取消')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(cancelButton);
            await forwardChannel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('メッセージの転送中にエラーが発生しました:', error);
        }
    }
});

// ボタンが押されたときに実行される処理です
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('cancel-msg_')) return;

    const originalEmbed = interaction.message.embeds[0];
    if (!originalEmbed) return;

    const fields = originalEmbed.fields.filter(field => field.name !== '処理結果');
    
    const [, originalChannelId, originalMessageId] = interaction.customId.split('_');

    try {
        const originalChannel = await client.channels.fetch(originalChannelId);
        const originalMessage = await originalChannel.messages.fetch(originalMessageId);

        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (Date.now() - originalMessage.createdAt.getTime() > twentyFourHours) {
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setFields(fields)
                .addFields({ name: '処理結果', value: '⚠️ **24時間経過**\nメッセージの送信から24時間が経過しているため、削除できませんでした。' });
            await interaction.update({ embeds: [updatedEmbed] });
            return;
        }

        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('メッセージが削除されました')
                .setColor(0xFF0000)
                .setDescription("以下のメッセージはCerinal AIによって、Agentに転送される前に削除されました。Cerinalのガイドラインに違反している、またはAgentが事前に設定した、「回答が難しいトピック」に抵触している可能性があるためです。問題があるメッセージは、お客様が送信してから24時間以内に削除されます。")
                .addFields(
                    { name: '削除されたメッセージ本文', value: originalMessage.content || '（本文なし）' },
                    { name: '送信元チャンネル', value: `<#${originalChannel.id}>` }
                );
            await originalMessage.author.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            console.error('ユーザーへのDM送信に失敗しました。', dmError);
        }

        await originalMessage.delete();

        const successEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(0x00FF00)
            .setFields(fields)
            .addFields({ name: '処理結果', value: `✅ **削除成功**\n実行者: ${interaction.user.tag}` })
            .setFooter({ text: 'このメッセージは正常に処理されました' });

        const disabledButton = new ButtonBuilder()
            .setCustomId(interaction.customId)
            .setLabel('処理済み')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
        const row = new ActionRowBuilder().addComponents(disabledButton);
        await interaction.update({ embeds: [successEmbed], components: [row] });

    } catch (error) {
        console.error('メッセージの削除処理中にエラーが発生しました:', error);
        let errorMessage = '❌ **不明なエラー**\nメッセージの削除に失敗しました。';
        if (error.code === 10008) { 
            errorMessage = 'ℹ️ **処理不要**\n元メッセージはすでに削除されています。';
        } else if (error.code === 50013) {
            errorMessage = '❌ **権限不足**\nボットに元チャンネルでの「メッセージの管理」権限があるか確認してください。';
        }

        const errorEmbed = EmbedBuilder.from(originalEmbed)
            .setFields(fields)
            .addFields({ name: '処理結果', value: errorMessage });
        
        await interaction.update({ embeds: [errorEmbed] });
    }
});

// ボットをDiscordに接続します
client.login(BOT_TOKEN);

// --- 常時稼働のための設定 ---
const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.write('Bot is running!');
    res.end();
}).listen(PORT, () => {
    console.log(`Webサーバーがポート ${PORT} で起動しました。`);
});
