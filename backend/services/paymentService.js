import bot from "../../bot/index.js";

export async function sendPremiumInvoice(telegramId) {
  await bot.api.sendInvoice(
    telegramId,
    "👑 Premium Üyelik",
    "1 aylık premium üyelik: 3x madencilik hızı, günlük +500 bonus coin, özel rozet ve daha fazlası!",
    "premium_monthly",
    "XTR",
    [{ label: "Premium - 1 Ay", amount: 99 }]
  );
}
