import { Bot, InlineKeyboard } from "grammy";
import { db } from "../backend/db.js";
import { getUserOrCreate, getReferralStats } from "../backend/services/userService.js";
import dotenv from "dotenv";

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN);
const MINI_APP_URL = process.env.MINI_APP_URL;

bot.command("start", async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const username = ctx.from.username || ctx.from.first_name;
  const startParam = ctx.match;

  const user = await getUserOrCreate({
    telegramId,
    username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name || "",
    referredBy: startParam || null,
  });

  if (startParam && startParam !== telegramId && user.isNew) {
    await db.query(
      `UPDATE users SET coins = coins + 500 WHERE telegram_id = $1`,
      [startParam]
    );
    await db.query(
      `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [startParam, telegramId]
    );
  }

  const keyboard = new InlineKeyboard()
    .webApp("⛏️ Madene Gir!", MINI_APP_URL)
    .row()
    .text("👥 Arkadaşlarını Davet Et", "referral")
    .text("📊 İstatistikler", "stats")
    .row()
    .text("🎯 Görevler", "tasks")
    .text("👑 Premium", "premium");

  await ctx.reply(
    `🪙 *Hoş Geldin, ${ctx.from.first_name}!*\n\n` +
    `⛏️ *CryptoMiner'a* katıldın!\n\n` +
    `💰 Başlangıç bonusu: *+100 COIN* hesabına eklendi!\n\n` +
    `🚀 Arkadaşlarını davet et, her arkadaş için *+500 COIN* kazan!\n\n` +
    `Aşağıdaki butona tıklayarak madene gir:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

bot.callbackQuery("referral", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = ctx.from.id.toString();
  const stats = await getReferralStats(telegramId);
  const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=${telegramId}`;

  const keyboard = new InlineKeyboard().switchInline(
    "🔗 Linki Paylaş",
    `⛏️ CryptoMiner'da beni yakala! Şu ana kadar ${stats.totalCoins} COIN kazandım!`
  );

  await ctx.reply(
    `👥 *Referans Sistemin*\n\n` +
    `🔗 Referans linkin:\n\`${referralLink}\`\n\n` +
    `📊 *İstatistiklerin:*\n` +
    `• Davet ettiğin kişi: *${stats.referralCount}* kişi\n` +
    `• Referanstan kazandığın: *${stats.referralEarnings} COIN*\n\n` +
    `💡 Her davet ettiğin kişi için *500 COIN* kazanırsın!`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

bot.callbackQuery("stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = ctx.from.id.toString();

  const result = await db.query(
    `SELECT u.coins, u.total_earned, u.level, u.created_at,
            COUNT(r.id) as referral_count,
            u.is_premium
     FROM users u
     LEFT JOIN referrals r ON r.referrer_id = u.telegram_id
     WHERE u.telegram_id = $1
     GROUP BY u.id`,
    [telegramId]
  );

  const user = result.rows[0];
  if (!user) return ctx.reply("Kullanıcı bulunamadı.");

  const joinDate = new Date(user.created_at).toLocaleDateString("tr-TR");

  await ctx.reply(
    `📊 *Profilim*\n\n` +
    `🪙 Mevcut Coin: *${Number(user.coins).toLocaleString()} COIN*\n` +
    `💰 Toplam Kazanç: *${Number(user.total_earned).toLocaleString()} COIN*\n` +
    `⚡ Seviye: *${user.level}*\n` +
    `👑 Premium: *${user.is_premium ? "✅ Aktif" : "❌ Yok"}*\n` +
    `👥 Davet Sayısı: *${user.referral_count}*\n` +
    `📅 Katılım: *${joinDate}*`,
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("tasks", async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .webApp("📋 Görevleri Gör", `${MINI_APP_URL}/tasks`);

  await ctx.reply(
    `🎯 *Günlük Görevler*\n\n` +
    `• 📺 Reklam izle → *+50 COIN*\n` +
    `• 📢 Kanalımıza katıl → *+200 COIN*\n` +
    `• 🐦 Twitter'ı takip et → *+150 COIN*\n` +
    `• 👥 3 arkadaş davet et → *+1000 COIN*`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

bot.callbackQuery("premium", async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .webApp("👑 Premium Al", `${MINI_APP_URL}/premium`);

  await ctx.reply(
    `👑 *Premium Üyelik*\n\n` +
    `• ⚡ 3x daha hızlı coin üretimi\n` +
    `• 🎯 Ekstra günlük görevler\n` +
    `• 💎 Özel premium rozeti\n` +
    `• 🚀 Günlük +500 bonus coin\n\n` +
    `💰 *Fiyat:* 99 Telegram Stars / ay`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

bot.on("pre_checkout_query", async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on("message:successful_payment", async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const payload = ctx.message.successful_payment.invoice_payload;

  if (payload === "premium_monthly") {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await db.query(
      `UPDATE users SET is_premium = true, premium_expires_at = $1 WHERE telegram_id = $2`,
      [expiresAt, telegramId]
    );

    await ctx.reply(
      `🎉 *Premium Aktivasyon Başarılı!*\n\n` +
      `👑 Premium üyeliğin aktif edildi!\n` +
      `📅 Bitiş tarihi: *${expiresAt.toLocaleDateString("tr-TR")}*`,
      { parse_mode: "Markdown" }
    );
  }
});

bot.catch((err) => {
  console.error("Bot hatası:", err);
});
