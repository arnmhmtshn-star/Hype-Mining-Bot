import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN, {
  botInfo: {
    id: 7997418140,
    is_bot: true,
    first_name: "Hype Mining Bot",
    username: "Hype_Mining_Bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false
  }
});

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
