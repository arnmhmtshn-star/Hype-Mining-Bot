import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN);

bot.command("start", async (ctx) => {
  await ctx.reply(
    `🪙 Hoş Geldin, ${ctx.from.first_name}!\n\n` +
    `⛏️ CryptoMiner'a katıldın!\n\n` +
    `💰 Başlangıç bonusu: +100 COIN hesabına eklendi!\n\n` +
    `🚀 Arkadaşlarını davet et, her arkadaş için +500 COIN kazan!`
  );
});

bot.catch((err) => {
  console.error("Bot hatası:", err);
});

export default bot;
