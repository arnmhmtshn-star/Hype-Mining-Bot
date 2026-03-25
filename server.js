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

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

const webhookPath = `/webhook/${process.env.BOT_TOKEN}`;
app.use(webhookPath, webhookCallback(bot, "express"));

async function main() {
  await initDB();

  app.listen(PORT, () => {
    console.log(`🚀 Sunucu çalışıyor: ${PORT}`);
  });

  await bot.api.setWebhook(
    `${process.env.WEBHOOK_URL}/webhook/${process.env.BOT_TOKEN}`
  );
  console.log("✅ Webhook ayarlandı");
}

main().catch(console.error);
