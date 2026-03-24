import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { webhookCallback } from "grammy";
import bot from "./bot/index.js";
import { initDB } from "./backend/db.js";
import apiRoutes from "./backend/routes/api.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.MINI_APP_URL,
  credentials: true,
}));
app.use(express.json());

app.use("/api", apiRoutes);

if (process.env.NODE_ENV === "production") {
  const webhookPath = `/webhook/${process.env.BOT_TOKEN}`;
  app.use(webhookPath, webhookCallback(bot, "express"));
  console.log(`🔗 Webhook aktif: ${webhookPath}`);
} else {
  bot.start({
    onStart: () => console.log("🤖 Bot polling ile başladı"),
  });
}

async function main() {
  await initDB();

  app.listen(PORT, () => {
    console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
  });

  if (process.env.NODE_ENV === "production" && process.env.WEBHOOK_URL) {
    await bot.api.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.BOT_TOKEN}`);
    console.log("✅ Webhook ayarlandı");
  }
}

main().catch(console.error);
