import express from "express";
import dotenv from "dotenv";
import bot from "./bot/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Bot çalışıyor! ✅");
});

app.post("/webhook", async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

async function main() {
  app.listen(PORT, () => {
    console.log(`🚀 Sunucu çalışıyor: ${PORT}`);
  });

  await bot.api.setWebhook(
    `${process.env.WEBHOOK_URL}/webhook`
  );
  console.log("✅ Webhook ayarlandı");
}

main().catch(console.error);
