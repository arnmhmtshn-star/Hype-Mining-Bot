import { Bot } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";
import dotenv from "dotenv";

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN, {
  client: {
    baseFetchConfig: {
      agent: new HttpsProxyAgent("socks5://172.16.0.1:1080"),
    },
  },
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
  await ctx.reply("Merhaba! Bot çalışıyor! 🎉");
});

bot.catch((err) => {
  console.error("Bot hatası:", err.message);
});

export default bot;
