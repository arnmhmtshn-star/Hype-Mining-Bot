import crypto from "crypto";

export function validateTelegramWebApp(req, res, next) {
  if (process.env.NODE_ENV === "development" && process.env.SKIP_AUTH === "true") {
    req.telegramUser = { telegram_id: req.headers["x-telegram-id"] || "test_user" };
    return next();
  }

  const initData = req.headers["x-telegram-init-data"];
  if (!initData) {
    return res.status(401).json({ error: "Telegram doğrulaması gerekli" });
  }

  try {
    const isValid = verifyTelegramWebAppData(initData, process.env.BOT_TOKEN);
    if (!isValid) {
      return res.status(401).json({ error: "Geçersiz Telegram verisi" });
    }

    const params = new URLSearchParams(initData);
    const userStr = params.get("user");
    if (!userStr) return res.status(401).json({ error: "Kullanıcı bilgisi yok" });

    const user = JSON.parse(decodeURIComponent(userStr));
    req.telegramUser = {
      telegram_id: user.id.toString(),
      username: user.username,
      first_name: user.first_name,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Doğrulama hatası" });
  }
}

function verifyTelegramWebAppData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return expectedHash === hash;
}
