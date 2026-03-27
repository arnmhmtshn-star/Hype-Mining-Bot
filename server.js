import express from "express";
import dotenv from "dotenv";
import bot from "./bot/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

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
  await bot.init();
  console.log("✅ Bot başlatıldı");

  app.listen(PORT, () => {
    console.log(`🚀 Sunucu çalışıyor: ${PORT}`);
  });
}

main().catch(console.error);
