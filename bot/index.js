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
  }
});

const MINI_APP_URL = process.env.MINI_APP_URL;

bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("👥 Arkadaşlarını Davet Et", "referral")
    .row()
    .text("📊 İstatistikler", "stats")
    .row()
    .text("🎯 Görevler", "tasks")
    .text("👑 Premium", "premium");

  await ctx.reply(
    `🪙 *Hoş Geldin, ${ctx.from.first_name}!*\n\n` +
    `⛏️ *CryptoMiner'a* katıldın!\n\n` +
    `💰 Başlangıç bonusu: *+100 COIN* hesabına eklendi!\n\n` +
    `🚀 Arkadaşlarını davet et, her arkadaş için *+500 COIN* kazan!`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

bot.callbackQuery("referral", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = ctx.from.id.toString();
  const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=${telegramId}`;

  await ctx.reply(
    `👥 *Referans Sistemin*\n\n` +
    `🔗 Referans linkin:\n\`${referralLink}\`\n\n` +
    `💡 Her davet ettiğin kişi için *500 COIN* kazanırsın!`,
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(`📊 *Profilim*\n\nİstatistiklerin yükleniyor...`, { parse_mode: "Markdown" });
});

bot.callbackQuery("tasks", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🎯 *Günlük Görevler*\n\n` +
    `• 📺 Reklam izle → *+50 COIN*\n` +
    `• 📢 Kanalımıza katıl → *+200 COIN*\n` +
    `• 🐦 Twitter'ı takip et → *+150 COIN*\n` +
    `• 👥 3 arkadaş davet et → *+1000 COIN*`,
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("premium", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `👑 *Premium Üyelik*\n\n` +
    `• ⚡ 3x daha hızlı coin üretimi\n` +
    `• 💎 Özel premium rozeti\n` +
    `• 🚀 Günlük +500 bonus coin\n\n` +
    `💰 *Fiyat:* 99 Telegram Stars / ay`,
    { parse_mode: "Markdown" }
  );
});

bot.catch((err) => {
  console.error("Bot hatası:", err);
});

export default bot;
