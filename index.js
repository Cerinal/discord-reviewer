const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const http = require('http'); // UptimeRobotのために追加

// ▼▼ 秘密情報（Secrets）から情報を読み込みます ▼▼
const targetUserId = process.env['TARGET_USER_ID'];
const gasUrl = process.env['GAS_URL'];
const discordToken = process.env['DISCORD_TOKEN'];
// ▲▲ ここは変更不要 ▲▲


// --- ここから下は変更不要です ---

// ★★★ UptimeRobotのためのウェブサーバー機能を追加 ★★★
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});
server.listen(3000, () => {
  console.log('🌐 Web server for UptimeRobot is running.');
});
// ★★★ ここまでが追加された部分 ★★★


if (!targetUserId || !gasUrl || !discordToken) {
  console.error('必要な情報（TARGET_USER_ID, GAS_URL, DISCORD_TOKEN）が設定されていません。Secrets機能を確認してください。');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', () => {
  console.log(`✅ ${client.user.tag}としてログインしました。`);
  console.log(`👂 ユーザーID: ${targetUserId} のメッセージを監視しています...`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.author.id === targetUserId) {
    console.log(`[検知] ${message.author.username}: ${message.content}`);
    const dataToSend = {
      author: { id: message.author.id, username: message.author.username },
      channel_name: message.channel.name || 'DM or Unknown Channel',
      content: message.content,
    };
    try {
      await axios.post(gasUrl, dataToSend);
      console.log(`[成功] スプレッドシートへの記録に成功しました。`);
    } catch (error) {
      console.error(`[失敗] GASへの送信中にエラーが発生しました。`);
    }
  }
});
client.login(discordToken);
