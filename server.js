import express from "express";
import dotenv from "dotenv";
import { webhookCallback } from "grammy";
import bot from "./bot/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const webhookPath = `/webhook/${process.env.BOT_TOKEN}`;
app.use(webhookPath, webhookCallback(bot, "express"));

app.get("/", (req, res) => {
  res.send("Bot çalışıyor! ✅");
});

async function main() {
  app.listen(PORT, () => {
    console.log(`🚀 Sunucu çalışıyor: ${PORT}`);
  });

  await bot.api.setWebhook(
    `${process.env.WEBHOOK_URL}/webhook/${process.env.BOT_TOKEN}`
  );
  console.log("✅ Webhook ayarlandı");
}

main().catch(console.error);
