import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0");
const USDT_ADDRESS = process.env.USDT_ADDRESS || "";
const CHANNEL = "https://t.me/HypeMiningCommunity";
const DB_FILE = "./data.json";
const PUAN_TO_USDT = 5000;
const MIN_WITHDRAW = 50;
const MAX_DAILY_WITHDRAW = 100;
const WITHDRAW_WAIT_DAYS = 30;

// KAMPANYA
const KAMPANYA_AKTIF = true;
const KAMPANYA_MIN_DEPOSIT = 25;
const KAMPANYA_MAX_USERS = 1000;
const KAMPANYA_SURE_GUN = 30; // 1 ay

// MADENCİ SÜRE LİMİTİ
const MADENCI_SURE_GUN = 150; // 5 ay

// YARIŞMA
const YARIS_AKTIF = true;
const YARIS_SURE_GUN = 30; // 1 ay
const YARIS_MIN_DEPOSIT = 50;
const YARIS_ODULLER = [100, 50, 25]; // USDT


const MINERS = [
  { id: 1, tr: "🔰 Başlangıç", en: "🔰 Starter", price: 10, hourly: 35 },
  { id: 2, tr: "🥉 Bronze", en: "🥉 Bronze", price: 25, hourly: 87 },
  { id: 3, tr: "🥈 Silver", en: "🥈 Silver", price: 50, hourly: 174 },
  { id: 4, tr: "🥇 Gold", en: "🥇 Gold", price: 100, hourly: 347 },
  { id: 5, tr: "💎 Diamond", en: "💎 Diamond", price: 250, hourly: 868 },
];

const AD_PACKAGES = [
  { id: 1, tr: "📦 Starter", en: "📦 Starter", price: 20, users: 500 },
  { id: 2, tr: "🚀 Growth", en: "🚀 Growth", price: 50, users: 1250 },
  { id: 3, tr: "💎 Premium", en: "💎 Premium", price: 100, users: 2500 },
];

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, pending_deposits: [], pending_withdrawals: [], tasks: [], ads: [], pending_ads: [] }));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function getUser(db, id, name) {
  if (!db.users[id]) {
    db.users[id] = {
      id, name, puan: 100, usdt: 0, lang: null,
      last_bonus: null, last_gorev: null,
      miner: null, miner_last_claim: null, miner_start_date: null,
      has_deposited: false, deposit_date: null,
      last_withdraw_date: null, daily_withdrawn: 0,
      referrer: null, referral_count: 0,
      referral_total_deposit: 0,
      usdt_total_deposited: 0,
      completed_tasks: [],
      kampanya_2x: false, kampanya_bitis: null,
      yaris_katilim: false
    };
  }
  return db.users[id];
}

function isEN(user) { return user.lang === "en"; }
function t(user, tr, en) { return isEN(user) ? en : tr; }

function claimMiner(user) {
  if (!user.miner || !user.miner_last_claim) return 0;
  const miner = MINERS.find(m => m.id === user.miner);
  if (!miner) return 0;
  
  // Madenci süre kontrolü (5 ay = 150 gün)
  const minerStartDate = new Date(user.miner_start_date || user.miner_last_claim).getTime();
  const daysPassed = (Date.now() - minerStartDate) / 86400000;
  if (daysPassed >= MADENCI_SURE_GUN) {
    user.miner = null;
    user.miner_last_claim = null;
    user.miner_start_date = null;
    user.kampanya_2x = false;
    return -1; // Madenci süresi doldu
  }
  
  // Kampanya 2x kontrolü
  let hourlyRate = miner.hourly;
  if (user.kampanya_2x && user.kampanya_bitis) {
    if (Date.now() < new Date(user.kampanya_bitis).getTime()) {
      hourlyRate = miner.hourly * 2;
    } else {
      user.kampanya_2x = false;
    }
  }
  
  const hours = (Date.now() - new Date(user.miner_last_claim).getTime()) / 3600000;
  const earned = Math.floor(hours * hourlyRate);
  if (earned > 0) { user.puan += earned; user.miner_last_claim = new Date().toISOString(); }
  return earned;
}

// Yarışma puanı hesapla
function yarisSkoru(user, db) {
  if (!user.has_deposited || user.usdt_total_deposited < YARIS_MIN_DEPOSIT) return 0;
  let score = 0;
  // Kendi yatırımı: her 1 USDT = 1 puan
  score += Math.floor(user.usdt_total_deposited || 0);
  // Referans sayısı: her referans = 10 puan
  score += (user.referral_count || 0) * 10;
  // Referansların yatırımları: her 1 USDT = 2 puan
  score += Math.floor((user.referral_total_deposit || 0) * 2);
  return score;
}

function mainMenu(user) {
  return new InlineKeyboard()
    .text(t(user,"💰 Bakiye","💰 Balance"),"bakiye").text(t(user,"🏆 Liderlik","🏆 Leaderboard"),"liderlik").row()
    .text(t(user,"⛏️ Madenci","⛏️ Miner"),"madenci_menu").text(t(user,"🎮 Oyunlar","🎮 Games"),"oyunlar_menu").row()
    .text(t(user,"📋 Görevler","📋 Tasks"),"gorevler_menu").text(t(user,"🎁 Günlük Bonus","🎁 Daily Bonus"),"bonus").row()
    .text(t(user,"💳 Yatır","💳 Deposit"),"yatir").text(t(user,"💸 Çek","💸 Withdraw"),"cek_menu").row()
    .text(t(user,"👥 Referans","👥 Referral"),"referans").text(t(user,"📢 Reklam Ver","📢 Advertise"),"reklam_menu");
}

// START
bot.command("start", async (ctx) => {
  const db = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const args = ctx.match;
  if (args && args.startsWith("ref_") && !user.referrer) {
    const refId = parseInt(args.replace("ref_", ""));
    if (refId !== ctx.from.id && db.users[refId]) {
      user.referrer = refId;
      db.users[refId].puan += 500;
      db.users[refId].referral_count = (db.users[refId].referral_count || 0) + 1;
      await bot.api.sendMessage(refId, `🎉 Yeni referansın geldi! +500 puan kazandın!`).catch(() => {});
    }
  }
  saveDB(db);
  if (!user.lang) {
    const kb = new InlineKeyboard().text("🇹🇷 Türkçe","lang_tr").text("🇬🇧 English","lang_en");
    await ctx.reply("🌍 Dil seçin / Select language:", { reply_markup: kb });
    return;
  }
  await ctx.reply(t(user,
    `👋 Merhaba ${ctx.from.first_name}! Hype Mining Bot'a hoş geldin!\n\n🪙 Puan: ${user.puan}\n💵 USDT: ${user.usdt}\n\nAşağıdan işlem seç:`,
    `👋 Hello ${ctx.from.first_name}! Welcome to Hype Mining Bot!\n\n🪙 Points: ${user.puan}\n💵 USDT: ${user.usdt}\n\nChoose an option:`
  ), { reply_markup: mainMenu(user) });
});

bot.callbackQuery("lang_tr", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  user.lang = "tr"; saveDB(db); await ctx.answerCallbackQuery();
  await ctx.reply(`👋 Merhaba ${ctx.from.first_name}! Hype Mining Bot'a hoş geldin!\n\n🪙 Puan: ${user.puan}\n💵 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
});
bot.callbackQuery("lang_en", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  user.lang = "en"; saveDB(db); await ctx.answerCallbackQuery();
  await ctx.reply(`👋 Hello ${ctx.from.first_name}! Welcome to Hype Mining Bot!\n\n🪙 Points: ${user.puan}\n💵 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
});
bot.command("lang", async (ctx) => {
  const kb = new InlineKeyboard().text("🇹🇷 Türkçe","lang_tr").text("🇬🇧 English","lang_en");
  await ctx.reply("🌍 Dil seçin / Select language:", { reply_markup: kb });
});
bot.callbackQuery("ana_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  await ctx.reply(t(user,"Ana menü:","Main menu:"), { reply_markup: mainMenu(user) });
});

// BAKİYE
bot.callbackQuery("bakiye", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const earned = claimMiner(user); saveDB(db); await ctx.answerCallbackQuery();
  let msg = t(user, `💼 Bakiyeniz\n\n🪙 Puan: ${user.puan}\n💵 USDT: ${user.usdt}\n📊 ${PUAN_TO_USDT} puan = 1 USDT`, `💼 Your Balance\n\n🪙 Points: ${user.puan}\n💵 USDT: ${user.usdt}\n📊 ${PUAN_TO_USDT} points = 1 USDT`);
  if (earned === -1) {
    msg += t(user, `\n\n⚠️ Madencinin süresi doldu! Yeni madenci satın alman gerekiyor.`, `\n\n⚠️ Your miner expired! You need to buy a new one.`);
  } else if (earned > 0) {
    msg += t(user, `\n\n⛏️ Madenciden +${earned} puan!`, `\n\n⛏️ Miner earned +${earned} points!`);
  }
  // Kampanya bilgisi
  if (user.kampanya_2x && user.kampanya_bitis) {
    const kalan = Math.ceil((new Date(user.kampanya_bitis).getTime() - Date.now()) / 86400000);
    if (kalan > 0) msg += t(user, `\n🚀 Kampanya 2x aktif! ${kalan} gün kaldı`, `\n🚀 2x Campaign active! ${kalan} days left`);
  }
  if (user.miner) {
    const miner = MINERS.find(m => m.id === user.miner);
    msg += t(user, `\n⛏️ Aktif madenci: ${miner.tr} (${miner.hourly} puan/saat)`, `\n⛏️ Active miner: ${miner.en} (${miner.hourly} pts/hr)`);
  }
  await ctx.reply(msg, { reply_markup: mainMenu(user) });
});

// LİDERLİK
bot.callbackQuery("liderlik", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const sorted = Object.values(db.users).sort((a,b) => b.puan - a.puan).slice(0,10);
  let msg = t(user,"🏆 Liderlik Tablosu\n\n","🏆 Leaderboard\n\n");
  sorted.forEach((u,i) => { const m=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`; msg+=`${m} ${u.name} - ${u.puan}\n`; });
  await ctx.answerCallbackQuery(); await ctx.reply(msg, { reply_markup: mainMenu(user) });
});

// GÜNLÜK BONUS
bot.callbackQuery("bonus", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const bugun = new Date().toDateString(); await ctx.answerCallbackQuery();
  if (user.last_bonus === bugun) { await ctx.reply(t(user,"⏰ Günlük bonusunu zaten aldın!","⏰ Already claimed today!"), { reply_markup: mainMenu(user) }); return; }
  const bonus = Math.floor(Math.random()*50)+50; user.puan+=bonus; user.last_bonus=bugun; saveDB(db);
  await ctx.reply(t(user,`🎁 +${bonus} puan kazandın!\n🪙 Toplam: ${user.puan}`,`🎁 +${bonus} points earned!\n🪙 Total: ${user.puan}`), { reply_markup: mainMenu(user) });
});

// MADENCİ MENÜ
bot.callbackQuery("madenci_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  let msg = t(user,"⛏️ Madenci Satın Al\n\n","⛏️ Buy Miner\n\n");
  MINERS.forEach(m => { msg += t(user,`${m.tr}: ${m.price} USDT → ${m.hourly} puan/saat\n`,`${m.en}: ${m.price} USDT → ${m.hourly} pts/hr\n`); });
  const kb = new InlineKeyboard();
  MINERS.forEach(m => kb.text(t(user,m.tr,m.en), `buy_miner_${m.id}`));
  kb.row().text(t(user,"🔙 Geri","🔙 Back"),"ana_menu");
  await ctx.reply(msg, { reply_markup: kb });
});

MINERS.forEach(miner => {
  bot.callbackQuery(`buy_miner_${miner.id}`, async (ctx) => {
    const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
    await ctx.answerCallbackQuery();
    if (user.usdt < miner.price) {
      await ctx.reply(t(user,`❌ Yetersiz USDT! Gerekli: ${miner.price} USDT`,`❌ Not enough USDT! Required: ${miner.price} USDT`), { reply_markup: mainMenu(user) }); return;
    }
    user.usdt = parseFloat((user.usdt - miner.price).toFixed(2));
    user.miner = miner.id; 
    user.miner_last_claim = new Date().toISOString();
    user.miner_start_date = new Date().toISOString();
    saveDB(db);
    await ctx.reply(t(user,`✅ ${miner.tr} satın aldın! Saatte ${miner.hourly} puan kazanmaya başladın.`,`✅ ${miner.en} purchased! Earning ${miner.hourly} pts/hr.`), { reply_markup: mainMenu(user) });
  });
});

// OYUNLAR
bot.callbackQuery("oyunlar_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text(t(user,"🎰 Şans Çarkı","🎰 Spin Wheel"),"cark_menu").row()
    .text(t(user,"🎲 Zar Oyunu","🎲 Dice Game"),"zar_menu").row()
    .text(t(user,"🔙 Geri","🔙 Back"),"ana_menu");
  await ctx.reply(t(user,"🎮 Oyunlar","🎮 Games"), { reply_markup: kb });
});

// ŞANS ÇARKI
bot.callbackQuery("cark_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("🪙 50","cark_p_50").text("🪙 100","cark_p_100").text("🪙 500","cark_p_500").row()
    .text("💵 1 USDT","cark_u_1").text("💵 5 USDT","cark_u_5").row()
    .text(t(user,"🔙 Geri","🔙 Back"),"oyunlar_menu");
  await ctx.reply(t(user,"🎰 Şans Çarkı\n\n%60 kaybet | 1.5x | 2x | 3x\n\nNe kadar yatırmak istiyorsun?","🎰 Spin Wheel\n\n60% lose | 1.5x | 2x | 3x\n\nHow much to bet?"), { reply_markup: kb });
});

async function carkOyna(ctx, tip, miktar) {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (tip==="puan" && user.puan<miktar) { await ctx.reply(t(user,"❌ Yetersiz puan!","❌ Not enough points!"), { reply_markup: mainMenu(user) }); return; }
  if (tip==="usdt" && user.usdt<miktar) { await ctx.reply(t(user,"❌ Yetersiz USDT!","❌ Not enough USDT!"), { reply_markup: mainMenu(user) }); return; }
  const rand = Math.random();
  let carpan, sonuc;
  if (rand<0.60) { carpan=0; sonuc=t(user,"💀 Kaybettin!","💀 You lost!"); }
  else if (rand<0.80) { carpan=1.5; sonuc=t(user,"🔥 1.5x Kazandın!","🔥 1.5x Win!"); }
  else if (rand<0.93) { carpan=2; sonuc=t(user,"⭐ 2x Kazandın!","⭐ 2x Win!"); }
  else { carpan=3; sonuc=t(user,"💎 3x Kazandın!","💎 3x Win!"); }
  if (tip==="puan") {
    const fark = Math.floor(miktar*carpan)-miktar; user.puan+=fark;
    await ctx.reply(`🎰 ${sonuc}\n\n${fark>=0?"+"+fark:fark} ${t(user,"puan","pts")}\n🪙 ${t(user,"Puan","Points")}: ${user.puan}`, { reply_markup: mainMenu(user) });
  } else {
    const fark = parseFloat((miktar*carpan-miktar).toFixed(2)); user.usdt=parseFloat((user.usdt+fark).toFixed(2));
    await ctx.reply(`🎰 ${sonuc}\n\n${fark>=0?"+"+fark:fark} USDT\n💵 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
  }
  saveDB(db);
}
bot.callbackQuery("cark_p_50", async (ctx) => { await ctx.answerCallbackQuery(); await carkOyna(ctx,"puan",50); });
bot.callbackQuery("cark_p_100", async (ctx) => { await ctx.answerCallbackQuery(); await carkOyna(ctx,"puan",100); });
bot.callbackQuery("cark_p_500", async (ctx) => { await ctx.answerCallbackQuery(); await carkOyna(ctx,"puan",500); });
bot.callbackQuery("cark_u_1", async (ctx) => { await ctx.answerCallbackQuery(); await carkOyna(ctx,"usdt",1); });
bot.callbackQuery("cark_u_5", async (ctx) => { await ctx.answerCallbackQuery(); await carkOyna(ctx,"usdt",5); });

// ZAR OYUNU
bot.callbackQuery("zar_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("🪙 50","zar_p_50").text("🪙 100","zar_p_100").text("🪙 500","zar_p_500").row()
    .text("💵 1 USDT","zar_u_1").text("💵 5 USDT","zar_u_5").row()
    .text(t(user,"🔙 Geri","🔙 Back"),"oyunlar_menu");
  await ctx.reply(t(user,"🎲 Zar Oyunu\n\n1-3: 0x | 4: 0.5x | 5: 1.5x | 6: 2x\n\nNe kadar yatırmak istiyorsun?","🎲 Dice Game\n\n1-3: 0x | 4: 0.5x | 5: 1.5x | 6: 2x\n\nHow much to bet?"), { reply_markup: kb });
});

async function zarOyna(ctx, tip, miktar) {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (tip==="puan" && user.puan<miktar) { await ctx.reply(t(user,"❌ Yetersiz puan!","❌ Not enough points!"), { reply_markup: mainMenu(user) }); return; }
  if (tip==="usdt" && user.usdt<miktar) { await ctx.reply(t(user,"❌ Yetersiz USDT!","❌ Not enough USDT!"), { reply_markup: mainMenu(user) }); return; }
  const zar = Math.floor(Math.random()*6)+1;
  const emojiler = ["","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣"];
  let carpan, sonuc;
  if (zar<=3) { carpan=0; sonuc=t(user,"💀 Kaybettin!","💀 You lost!"); }
  else if (zar===4) { carpan=0.5; sonuc=t(user,"😐 0.5x","😐 0.5x"); }
  else if (zar===5) { carpan=1.5; sonuc=t(user,"🔥 1.5x Kazandın!","🔥 1.5x Win!"); }
  else { carpan=2; sonuc=t(user,"🎉 2x Kazandın!","🎉 2x Win!"); }
  if (tip==="puan") {
    const fark = Math.floor(miktar*carpan)-miktar; user.puan+=fark;
    await ctx.reply(`🎲 ${emojiler[zar]} ${sonuc}\n\n${fark>=0?"+"+fark:fark} ${t(user,"puan","pts")}\n🪙 ${t(user,"Puan","Points")}: ${user.puan}`, { reply_markup: mainMenu(user) });
  } else {
    const fark = parseFloat((miktar*carpan-miktar).toFixed(2)); user.usdt=parseFloat((user.usdt+fark).toFixed(2));
    await ctx.reply(`🎲 ${emojiler[zar]} ${sonuc}\n\n${fark>=0?"+"+fark:fark} USDT\n💵 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
  }
  saveDB(db);
}
bot.callbackQuery("zar_p_50", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"puan",50); });
bot.callbackQuery("zar_p_100", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"puan",100); });
bot.callbackQuery("zar_p_500", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"puan",500); });
bot.callbackQuery("zar_u_1", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"usdt",1); });
bot.callbackQuery("zar_u_5", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"usdt",5); });

// GÖREVLER
bot.callbackQuery("gorevler_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text(t(user,"📢 Kanala Katıl","📢 Join Channel"),"task_channel").row()
    .text(t(user,"🎁 Günlük Görev","🎁 Daily Task"),"daily_task").row();
  if (db.tasks && db.tasks.filter(t => t.active).length > 0) {
    db.tasks.filter(t => t.active).forEach(task => {
      kb.text(`${task.icon} ${isEN(user)?task.title_en:task.title} (+${task.puan} puan)`, `do_task_${task.id}`).row();
    });
  }
  kb.text(t(user,"🔙 Geri","🔙 Back"),"ana_menu");
  await ctx.reply(t(user,"📋 Görevler\n\nGörevleri tamamla, puan kazan!","📋 Tasks\n\nComplete tasks, earn points!"), { reply_markup: kb });
});

bot.callbackQuery("task_channel", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  if (user.channel_joined) { await ctx.reply(t(user,"✅ Kanala zaten katıldın!","✅ Already joined!"), { reply_markup: mainMenu(user) }); return; }
  const kb = new InlineKeyboard().url(t(user,"📢 Kanala Katıl","📢 Join Channel"), "https://t.me/HypeMiningCommunity").row().text(t(user,"✅ Katıldım","✅ Joined"), "verify_channel");
  await ctx.reply(t(user,"📢 Kanalımıza katıl ve +300 puan kazan!","📢 Join our channel and earn +300 points!"), { reply_markup: kb });
});

bot.callbackQuery("verify_channel", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  if (user.channel_joined) { await ctx.reply(t(user,"✅ Zaten tamamlandı!","✅ Already done!"), { reply_markup: mainMenu(user) }); return; }
  user.channel_joined = true; user.puan += 300; saveDB(db);
  await ctx.reply(t(user,"✅ Teşekkürler! +300 puan kazandın!","✅ Thanks! +300 points earned!"), { reply_markup: mainMenu(user) });
});

bot.callbackQuery("daily_task", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const bugun = new Date().toDateString(); await ctx.answerCallbackQuery();
  if (user.last_gorev === bugun) { await ctx.reply(t(user,"✅ Bugünkü görevini tamamladın!","✅ Daily task done!"), { reply_markup: mainMenu(user) }); return; }
  const gorevler = [
    { tr:"🎲 Zar oyununu 3 kez oyna", en:"🎲 Play dice 3 times", puan:150 },
    { tr:"🎰 Şans çarkını 2 kez çevir", en:"🎰 Spin the wheel 2 times", puan:200 },
    { tr:"🎁 Günlük bonusunu al", en:"🎁 Claim daily bonus", puan:100 },
  ];
  const gorev = gorevler[Math.floor(Math.random()*gorevler.length)];
  user.last_gorev = bugun; user.puan += gorev.puan; saveDB(db);
  await ctx.reply(t(user,`📋 ${gorev.tr}\n\n✅ Tamamlandı! +${gorev.puan} puan kazandın!`,`📋 ${gorev.en}\n\n✅ Done! +${gorev.puan} points earned!`), { reply_markup: mainMenu(user) });
});

bot.callbackQuery(/do_task_(.+)/, async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const taskId = parseInt(ctx.match[1]);
  const task = db.tasks.find(t => t.id === taskId);
  await ctx.answerCallbackQuery();
  if (!task || !task.active) { await ctx.reply(t(user,"❌ Görev bulunamadı!","❌ Task not found!"), { reply_markup: mainMenu(user) }); return; }
  if (user.completed_tasks.includes(taskId)) { await ctx.reply(t(user,"✅ Bu görevi zaten tamamladın!","✅ Already completed!"), { reply_markup: mainMenu(user) }); return; }
  const kb = new InlineKeyboard().url("🔗 "+t(user,task.title,task.title_en), task.url && task.url.startsWith("http") ? task.url : "https://t.me/HypeMiningCommunity").row().text(t(user,"✅ Tamamladım","✅ Done"), `verify_task_${taskId}`);
  await ctx.reply(t(user,`📋 ${task.title}\n\nGörevi tamamla ve +${task.puan} puan kazan!`,`📋 ${task.title_en}\n\nComplete and earn +${task.puan} points!`), { reply_markup: kb });
});

bot.callbackQuery(/verify_task_(.+)/, async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const taskId = parseInt(ctx.match[1]);
  const task = db.tasks.find(t => t.id === taskId);
  await ctx.answerCallbackQuery();
  if (!task) return;
  if (user.completed_tasks.includes(taskId)) { await ctx.reply(t(user,"✅ Zaten tamamlandı!","✅ Already done!"), { reply_markup: mainMenu(user) }); return; }
  user.completed_tasks.push(taskId); user.puan += task.puan; saveDB(db);
  await ctx.reply(t(user,`✅ Görev tamamlandı! +${task.puan} puan kazandın!`,`✅ Task done! +${task.puan} points earned!`), { reply_markup: mainMenu(user) });
});

// YATIRIM
bot.callbackQuery("yatir", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  await ctx.reply(t(user,
    `💳 USDT Yatırma (TRC20)\n\nAşağıdaki adrese USDT gönder:\n\n${USDT_ADDRESS}\n\nGönderdikten sonra:\n/txhash HASH_KODU`,
    `💳 USDT Deposit (TRC20)\n\nSend USDT to:\n\n${USDT_ADDRESS}\n\nAfter sending:\n/txhash HASH_CODE`
  ), { reply_markup: mainMenu(user) });
});

bot.command("txhash", async (ctx) => {
  const hash = ctx.match;
  if (!hash) { await ctx.reply("Kullanım: /txhash HASH_KODU"); return; }
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  db.pending_deposits.push({ user_id: ctx.from.id, name: ctx.from.first_name, hash, date: new Date().toISOString() }); saveDB(db);
  await ctx.reply(t(user,"✅ TX hash alındı! Admin onayladıktan sonra bakiyene yansıyacak.","✅ TX hash received! Will be added after admin approval."), { reply_markup: mainMenu(user) });
  if (ADMIN_ID) {
    const kb = new InlineKeyboard()
      .text("✅ 10 USDT", `dep_ok_${ctx.from.id}_10`).text("✅ 25 USDT", `dep_ok_${ctx.from.id}_25`).text("✅ 50 USDT", `dep_ok_${ctx.from.id}_50`).row()
      .text("✅ 100 USDT", `dep_ok_${ctx.from.id}_100`).text("✅ 250 USDT", `dep_ok_${ctx.from.id}_250`).row()
      .text("❌ Reddet", `dep_no_${ctx.from.id}`);
    await bot.api.sendMessage(ADMIN_ID, `💳 Yatırım talebi!\n👤 ${ctx.from.first_name} (${ctx.from.id})\n🔗 ${hash}`, { reply_markup: kb });
  }
});

// ÇEKİM
bot.callbackQuery("cek_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();

  // Puan → USDT çevirme seçeneği
  const kb = new InlineKeyboard()
    .text(t(user,"💵 USDT Çek","💵 Withdraw USDT"),"cek_usdt").row()
    .text(t(user,"🪙 Puan → USDT Çevir","🪙 Convert Points → USDT"),"puan_cevir").row()
    .text(t(user,"🔙 Geri","🔙 Back"),"ana_menu");
  await ctx.reply(t(user,"💸 Çekim menüsü:","💸 Withdrawal menu:"), { reply_markup: kb });
});

bot.callbackQuery("puan_cevir", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  await ctx.reply(t(user,
    `🪙 Puan → USDT Çevir\n\n${PUAN_TO_USDT} puan = 1 USDT\n\nMevcut puan: ${user.puan}\nÇevrilebilir: ${(user.puan/PUAN_TO_USDT).toFixed(4)} USDT\n\nKullanım: /puancevir MİKTAR\nÖrnek: /puancevir 5000`,
    `🪙 Convert Points → USDT\n\n${PUAN_TO_USDT} points = 1 USDT\n\nCurrent points: ${user.puan}\nConvertible: ${(user.puan/PUAN_TO_USDT).toFixed(4)} USDT\n\nUsage: /convertpoints AMOUNT\nExample: /convertpoints 5000`
  ), { reply_markup: mainMenu(user) });
});

bot.command("puancevir", async (ctx) => {
  const miktar = parseInt(ctx.match);
  if (!miktar || miktar < PUAN_TO_USDT) { await ctx.reply(`Minimum ${PUAN_TO_USDT} puan çevrilebilir.`); return; }
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (user.puan < miktar) { await ctx.reply(t(user,"❌ Yetersiz puan!","❌ Not enough points!")); return; }
  const usdt = parseFloat((miktar / PUAN_TO_USDT).toFixed(4));
  user.puan -= miktar; user.usdt = parseFloat((user.usdt + usdt).toFixed(4)); saveDB(db);
  await ctx.reply(t(user,`✅ ${miktar} puan → ${usdt} USDT çevrildi!`,`✅ Converted ${miktar} points → ${usdt} USDT!`), { reply_markup: mainMenu(user) });
});

bot.callbackQuery("cek_usdt", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  if (!user.has_deposited) { await ctx.reply(t(user,"❌ Çekim yapabilmek için önce para yatırman gerekiyor!","❌ You need to make a deposit first!"), { reply_markup: mainMenu(user) }); return; }
  await ctx.reply(t(user,
    `💸 USDT Çekme\n\nMin: ${MIN_WITHDRAW} USDT\nGünlük max: ${MAX_DAILY_WITHDRAW} USDT\nBekleme: ${WITHDRAW_WAIT_DAYS} gün\n\nKullanım: /cek MİKTAR TRC20_ADRES`,
    `💸 Withdraw USDT\n\nMin: ${MIN_WITHDRAW} USDT\nDaily max: ${MAX_DAILY_WITHDRAW} USDT\nWait: ${WITHDRAW_WAIT_DAYS} days\n\nUsage: /withdraw AMOUNT TRC20_ADDRESS`
  ), { reply_markup: mainMenu(user) });
});

bot.command("cek", async (ctx) => {
  const args = ctx.match.split(" ");
  if (args.length < 2) { await ctx.reply("Kullanım: /cek MİKTAR ADRES"); return; }
  const miktar = parseFloat(args[0]); const adres = args[1];
  if (isNaN(miktar) || miktar < MIN_WITHDRAW) { await ctx.reply(`❌ Minimum çekim: ${MIN_WITHDRAW} USDT`); return; }
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (!user.has_deposited) { await ctx.reply(t(user,"❌ Çekim için önce para yatırman gerekiyor!","❌ Deposit required first!")); return; }
  if (user.usdt < miktar) { await ctx.reply(t(user,`❌ Yetersiz bakiye: ${user.usdt} USDT`,`❌ Insufficient balance: ${user.usdt} USDT`)); return; }

  // 30 gün kontrol
  if (user.deposit_date) {
    const days = (Date.now() - new Date(user.deposit_date).getTime()) / 86400000;
    if (days < WITHDRAW_WAIT_DAYS) { await ctx.reply(t(user,`❌ ${Math.ceil(WITHDRAW_WAIT_DAYS-days)} gün daha beklemeniz gerekiyor.`,`❌ Wait ${Math.ceil(WITHDRAW_WAIT_DAYS-days)} more days.`)); return; }
  }

  // Günlük limit
  const bugun = new Date().toDateString();
  if (user.last_withdraw_date === bugun && user.daily_withdrawn + miktar > MAX_DAILY_WITHDRAW) {
    await ctx.reply(t(user,`❌ Günlük çekim limitine ulaştın: ${MAX_DAILY_WITHDRAW} USDT`,`❌ Daily limit reached: ${MAX_DAILY_WITHDRAW} USDT`)); return;
  }

  user.usdt = parseFloat((user.usdt - miktar).toFixed(2));
  user.daily_withdrawn = user.last_withdraw_date === bugun ? user.daily_withdrawn + miktar : miktar;
  user.last_withdraw_date = bugun;
  db.pending_withdrawals.push({ user_id: ctx.from.id, name: ctx.from.first_name, miktar, adres, date: new Date().toISOString() }); saveDB(db);
  await ctx.reply(t(user,`✅ ${miktar} USDT çekim talebi alındı!`,`✅ Withdrawal of ${miktar} USDT requested!`), { reply_markup: mainMenu(user) });
  if (ADMIN_ID) {
    const kb = new InlineKeyboard().text("✅ Gönderildi",`wit_ok_${ctx.from.id}`).text("❌ Reddet",`wit_no_${ctx.from.id}_${miktar}`);
    await bot.api.sendMessage(ADMIN_ID, `💸 Çekim talebi!\n👤 ${ctx.from.first_name} (${ctx.from.id})\n💵 ${miktar} USDT\n📬 ${adres}`, { reply_markup: kb });
  }
});

// REFERANS
bot.callbackQuery("referans", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const refLink = `https://t.me/Hype_Mining_Bot?start=ref_${ctx.from.id}`;
  await ctx.reply(t(user,
    `👥 Referans Sistemi\n\n🔗 Referans linkin:\n${refLink}\n\n📊 Toplam referansın: ${user.referral_count || 0}\n\n✅ Her kayıt: +500 puan\n✅ İlk yatırımda: %10 USDT bonus`,
    `👥 Referral System\n\n🔗 Your link:\n${refLink}\n\n📊 Total referrals: ${user.referral_count || 0}\n\n✅ Each signup: +500 points\n✅ First deposit: 10% USDT bonus`
  ), { reply_markup: mainMenu(user) });
});

// REKLAM MENÜ
bot.callbackQuery("reklam_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  let msg = t(user,"📢 Reklam Ver\n\nBotumuzda reklam ver, binlerce kullanıcıya ulaş!\n\n","📢 Advertise\n\nReach thousands of users!\n\n");
  AD_PACKAGES.forEach(p => { msg += t(user,`${p.tr}: ${p.price} USDT → ${p.users} kullanıcıya görev\n`,`${p.en}: ${p.price} USDT → ${p.users} users task\n`); });
  const kb = new InlineKeyboard();
  AD_PACKAGES.forEach(p => kb.text(t(user,p.tr,p.en), `buy_ad_${p.id}`));
  kb.row().text(t(user,"🔙 Geri","🔙 Back"),"ana_menu");
  await ctx.reply(msg, { reply_markup: kb });
});

AD_PACKAGES.forEach(pkg => {
  bot.callbackQuery(`buy_ad_${pkg.id}`, async (ctx) => {
    const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
    await ctx.answerCallbackQuery();
    await ctx.reply(t(user,
      `📢 ${pkg.tr} Paketi\n\n💵 Fiyat: ${pkg.price} USDT\n👥 ${pkg.users} kullanıcıya görev\n\nÖdeme adımları:\n1. ${USDT_ADDRESS} adresine ${pkg.price} USDT gönder\n2. /adtxhash HASH BASLIK URL PUAN formatında gönder\n\nÖrnek:\n/adtxhash abc123 YouTube Kanalı https://youtube.com/... 100`,
      `📢 ${pkg.en} Package\n\n💵 Price: ${pkg.price} USDT\n👥 Task for ${pkg.users} users\n\nPayment:\n1. Send ${pkg.price} USDT to ${USDT_ADDRESS}\n2. Use /adtxhash HASH TITLE URL POINTS\n\nExample:\n/adtxhash abc123 YouTube Channel https://youtube.com/... 100`
    ), { reply_markup: mainMenu(user) });
  });
});

bot.command("adtxhash", async (ctx) => {
  const parts = ctx.match.split(" ");
  if (parts.length < 4) { await ctx.reply("Kullanım: /adtxhash HASH BAŞLIK URL PUAN"); return; }
  const [hash, ...rest] = parts;
  const puan = parseInt(rest[rest.length-1]);
  const url = rest[rest.length-2];
  const title = rest.slice(0, rest.length-2).join(" ");
  const db = loadDB();
  db.pending_ads = db.pending_ads || [];
  db.pending_ads.push({ user_id: ctx.from.id, name: ctx.from.first_name, hash, title, url, puan, date: new Date().toISOString() }); saveDB(db);
  await ctx.reply("✅ Reklam talebiniz alındı! Admin onayladıktan sonra yayına girecek.");
  if (ADMIN_ID) {
    const kb = new InlineKeyboard().text("✅ Onayla", `ad_ok_${ctx.from.id}_${db.pending_ads.length-1}`).text("❌ Reddet", `ad_no_${ctx.from.id}`);
    await bot.api.sendMessage(ADMIN_ID, `📢 Reklam talebi!\n👤 ${ctx.from.first_name}\n📝 ${title}\n🔗 ${url}\n🏆 ${puan} puan\n🔗 Hash: ${hash}`, { reply_markup: kb });
  }
});

// ADMIN: Yatırım onayla
bot.callbackQuery(/dep_ok_(.+)_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  const userId = parseInt(ctx.match[1]); const miktar = parseFloat(ctx.match[2]);
  const db = loadDB(); const user = db.users[userId];
  if (!user) { await ctx.answerCallbackQuery("Kullanıcı bulunamadı!"); return; }
  user.usdt = parseFloat((user.usdt + miktar).toFixed(2));
  user.usdt_total_deposited = parseFloat(((user.usdt_total_deposited || 0) + miktar).toFixed(2));
  user.has_deposited = true;
  if (!user.deposit_date) user.deposit_date = new Date().toISOString();
  
  // Kampanya 2x kontrolü
  const totalUsers = Object.keys(db.users).length;
  if (KAMPANYA_AKTIF && miktar >= KAMPANYA_MIN_DEPOSIT && totalUsers <= KAMPANYA_MAX_USERS && !user.kampanya_2x) {
    user.kampanya_2x = true;
    const bitis = new Date();
    bitis.setDate(bitis.getDate() + KAMPANYA_SURE_GUN);
    user.kampanya_bitis = bitis.toISOString();
    await bot.api.sendMessage(userId, `🚀 Lansman kampanyası! 1 ay boyunca madenci hızın 2x oldu!`).catch(()=>{});
  }
  
  // Referans %10 bonusu + yarışma puanı
  if (user.referrer && db.users[user.referrer]) {
    const refUser = db.users[user.referrer];
    const refBonus = parseFloat((miktar * 0.1).toFixed(2));
    refUser.usdt = parseFloat((refUser.usdt + refBonus).toFixed(2));
    refUser.referral_total_deposit = parseFloat(((refUser.referral_total_deposit || 0) + miktar).toFixed(2));
    await bot.api.sendMessage(user.referrer, `🎉 Referansın ${miktar} USDT yatırdı! +${refBonus} USDT bonus kazandın!`).catch(()=>{});
    user.referrer = null;
  }
  saveDB(db);
  await ctx.answerCallbackQuery("✅ Onaylandı!");
  await ctx.editMessageText(`✅ ${miktar} USDT onaylandı.`);
  await bot.api.sendMessage(userId, `✅ ${miktar} USDT bakiyenize eklendi!`);
});

bot.callbackQuery(/dep_no_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  await ctx.answerCallbackQuery("❌"); await ctx.editMessageText("❌ Reddedildi.");
  await bot.api.sendMessage(parseInt(ctx.match[1]), "❌ Yatırım talebiniz reddedildi.");
});

bot.callbackQuery(/wit_ok_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  await ctx.answerCallbackQuery("✅"); await ctx.editMessageText("✅ Gönderildi.");
  await bot.api.sendMessage(parseInt(ctx.match[1]), "✅ Çekim işleminiz tamamlandı!");
});

bot.callbackQuery(/wit_no_(.+)_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  const userId = parseInt(ctx.match[1]); const miktar = parseFloat(ctx.match[2]);
  const db = loadDB(); const user = db.users[userId];
  if (user) { user.usdt = parseFloat((user.usdt + miktar).toFixed(2)); saveDB(db); }
  await ctx.answerCallbackQuery("❌"); await ctx.editMessageText("❌ Reddedildi.");
  await bot.api.sendMessage(userId, `❌ Çekim reddedildi. ${miktar} USDT iade edildi.`);
});

bot.callbackQuery(/ad_ok_(.+)_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  const db = loadDB();
  const idx = parseInt(ctx.match[2]);
  const ad = db.pending_ads[idx];
  if (!ad) { await ctx.answerCallbackQuery("Bulunamadı!"); return; }
  db.tasks = db.tasks || [];
  const icons = {"youtube":"🎥","instagram":"📸","telegram":"👥","app":"📱","referral":"🔗"};
  const icon = Object.keys(icons).find(k => ad.url.includes(k)) ? icons[Object.keys(icons).find(k => ad.url.includes(k))] : "📋";
  db.tasks.push({ id: Date.now(), icon, title: ad.title, title_en: ad.title, url: ad.url, puan: ad.puan, active: true });
  db.pending_ads.splice(idx, 1); saveDB(db);
  await ctx.answerCallbackQuery("✅"); await ctx.editMessageText("✅ Reklam onaylandı ve yayına girdi.");
  await bot.api.sendMessage(ad.user_id, "✅ Reklamınız onaylandı! Görev olarak yayına girdi.").catch(()=>{});
});

bot.callbackQuery(/ad_no_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  await ctx.answerCallbackQuery("❌"); await ctx.editMessageText("❌ Reddedildi.");
  await bot.api.sendMessage(parseInt(ctx.match[1]), "❌ Reklam talebiniz reddedildi.").catch(()=>{});
});

// ADMIN KOMUTLARI
bot.command("ekle", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.match.split(" ");
  if (args.length < 3) { await ctx.reply("Kullanım: /ekle USER_ID MIKTAR puan|usdt"); return; }
  const db = loadDB(); const user = db.users[parseInt(args[0])];
  if (!user) { await ctx.reply("Kullanıcı bulunamadı."); return; }
  if (args[2]==="puan") user.puan+=parseFloat(args[1]);
  else { user.usdt=parseFloat((user.usdt+parseFloat(args[1])).toFixed(2)); user.has_deposited=true; }
  saveDB(db); await ctx.reply("✅ Eklendi.");
});

bot.command("istatistik", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const db = loadDB();
  const users = Object.values(db.users);
  const totalDeposit = users.filter(u => u.has_deposited).length;
  const totalPuan = users.reduce((a,b) => a+b.puan, 0);
  const totalUsdt = users.reduce((a,b) => a+b.usdt, 0);
  await ctx.reply(`📊 İstatistikler\n\n👥 Toplam kullanıcı: ${users.length}\n💳 Yatırım yapan: ${totalDeposit}\n🪙 Toplam puan: ${totalPuan}\n💵 Toplam USDT: ${totalUsdt.toFixed(2)}\n📋 Aktif görev: ${(db.tasks||[]).filter(t=>t.active).length}`);
});


// ADMIN: Ücretsiz görev ekle
bot.command("admintask", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const parts = ctx.match.split(" ");
  if (parts.length < 3) { await ctx.reply("Kullanim: /admintask ICON BASLIK URL PUAN\nOrnek: /admintask Kanal https://t.me/... 100"); return; }
  const puan = parseInt(parts[parts.length-1]);
  const url = parts[parts.length-2];
  const icon = parts[0];
  const title = parts.slice(1, parts.length-2).join(" ");
  if (!puan || !url || !title) { await ctx.reply("Hatali format!"); return; }
  const db = loadDB();
  db.tasks = db.tasks || [];
  db.tasks.push({ id: Date.now(), icon, title, title_en: title, url, puan, active: true });
  saveDB(db);
  await ctx.reply("Gorev eklendi: " + icon + " " + title + " - " + puan + " puan");
});

bot.command("tasklistesi", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const db = loadDB();
  if (!db.tasks || db.tasks.length === 0) { await ctx.reply("Henuz gorev yok."); return; }
  let msg = "Gorev Listesi\n\n";
  db.tasks.forEach((t, i) => { msg += (i+1) + ". " + t.icon + " " + t.title + " - " + t.puan + " puan - " + (t.active?"Aktif":"Pasif") + "\n"; });
  msg += "\nSilmek icin: /taskdel NUMARA";
  await ctx.reply(msg);
});

bot.command("taskdel", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const idx = parseInt(ctx.match) - 1;
  const db = loadDB();
  if (!db.tasks || !db.tasks[idx]) { await ctx.reply("Gorev bulunamadi."); return; }
  const deleted = db.tasks.splice(idx, 1);
  saveDB(db);
  await ctx.reply("Gorev silindi: " + deleted[0].title);
});


// Kanala yeni katılan üyeye hoş geldin mesajı
bot.on("chat_member", async (ctx) => {
  try {
    const member = ctx.chatMember;
    if (member.new_chat_member.status !== "member") return;
    const user = member.new_chat_member.user;
    if (user.is_bot) return;
    const name = user.first_name || "Arkadaş";
    const db = loadDB();
    const u = db.users[user.id];
    const lang = u ? u.lang : null;

    if (lang === "en") {
      await ctx.reply(
        `⛏️ Welcome to Hype Mining Community, ${name}!\n\n` +
        `💎 You've just joined Telegram's most exciting crypto mining bot!\n\n` +
        `🚀 HOW IT WORKS?\n` +
        `├ ⛏️ Buy a miner → earn hourly points\n` +
        `├ 🎰 Spin wheel & 🎲 dice games to multiply points\n` +
        `├ 🎁 Claim free daily bonus\n` +
        `├ 👥 Refer friends → 10% referral bonus\n` +
        `└ 💵 Convert points to real USDT!\n\n` +
        `💡 5,000 points = 1 USDT\n` +
        `💡 Start completely FREE — 100 points gift!\n\n` +
        `📢 WANT TO ADVERTISE?\n` +
        `Add your custom task to the bot!\n` +
        `Reach thousands of users → Packages: 20/50/100 USDT\n\n` +
        `🤖 Start now: @Hype_Mining_Bot`
      );
    } else {
      await ctx.reply(
        `⛏️ Hype Mining Community'e Hoş Geldin, ${name}!\n\n` +
        `💎 Telegram'ın en eğlenceli kripto madencilik botuna adım attın!\n\n` +
        `🚀 NASIL ÇALIŞIR?\n` +
        `├ ⛏️ Madenci satın al → saatlik puan kazan\n` +
        `├ 🎰 Şans çarkı & 🎲 zar oyunlarıyla puan harca\n` +
        `├ 🎁 Her gün ücretsiz bonus al\n` +
        `├ 👥 Arkadaşlarını davet et → %10 referans bonusu\n` +
        `└ 💵 Puanlarını gerçek USDT'ye çevir!\n\n` +
        `💡 5.000 puan = 1 USDT\n` +
        `💡 Başlamak tamamen ÜCRETSİZ — 100 puan hediye!\n\n` +
        `📢 REKLAM VERMEK İSTİYOR MUSUN?\n` +
        `Kanalına özel görev eklet, binlerce kullanıcıya ulaş!\n` +
        `Paketler: 20 / 50 / 100 USDT\n\n` +
        `🤖 Hemen başla: @Hype_Mining_Bot`
      );
    }
  } catch(e) { console.error("Hoş geldin hatası:", e.message); }
});


// YARISMA LİDERLİĞİ
bot.callbackQuery("yaris_liderlik", async (ctx) => {
  const db = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  
  if (!YARIS_AKTIF) {
    await ctx.reply(t(user, "Yarışma henüz aktif değil.", "Competition not active yet."), { reply_markup: mainMenu(user) });
    return;
  }
  
  const eligible = Object.values(db.users).filter(u => u.has_deposited && (u.usdt_total_deposited || 0) >= YARIS_MIN_DEPOSIT);
  const sorted = eligible.map(u => ({ ...u, score: yarisSkoru(u, db) })).sort((a,b) => b.score - a.score).slice(0,10);
  
  let msg = t(user, "🏆 Yarışma Sıralaması

", "🏆 Competition Leaderboard

");
  msg += t(user, `Min. ${YARIS_MIN_DEPOSIT} USDT yatırım şartı

`, `Min. ${YARIS_MIN_DEPOSIT} USDT deposit required

`);
  
  sorted.forEach((u, i) => {
    const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`;
    const odul = YARIS_ODULLER[i] ? ` — ${YARIS_ODULLER[i]} USDT` : "";
    msg += `${medal} ${u.name} — ${u.score} puan${odul}
`;
  });
  
  // Kendi sırası
  const myScore = yarisSkoru(user, db);
  const myRank = sorted.findIndex(u => u.id === user.id) + 1;
  msg += t(user, `
📊 Senin puanın: ${myScore}`, `
📊 Your score: ${myScore}`);
  if (myRank > 0) msg += t(user, ` (${myRank}. sıra)`, ` (rank ${myRank})`);
  
  msg += t(user, 
    `

Puan sistemi:
• Her referans: 10 puan
• Her 1 USDT yatırım: 1 puan
• Referansın 1 USDT yatırımı: 2 puan`,
    `

Scoring:
• Each referral: 10 pts
• Each 1 USDT deposit: 1 pt
• Referral's 1 USDT deposit: 2 pts`
  );
  
  await ctx.reply(msg, { reply_markup: mainMenu(user) });
});

bot.command("yaris", async (ctx) => {
  const db = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const myScore = yarisSkoru(user, db);
  const eligible = Object.values(db.users).filter(u => (u.usdt_total_deposited||0) >= YARIS_MIN_DEPOSIT);
  const sorted = eligible.map(u => ({...u, score: yarisSkoru(u, db)})).sort((a,b) => b.score - a.score);
  const myRank = sorted.findIndex(u => u.id === user.id) + 1;
  
  await ctx.reply(
    t(user,
      `🏆 Yarışma Durumun

📊 Puanın: ${myScore}
🎯 Sıran: ${myRank > 0 ? myRank+". sıra" : "Henüz katılmadın"}

💡 Min. ${YARIS_MIN_DEPOSIT} USDT yatırım şartı var

/yaris_liderlik ile sıralamayı gör`,
      `🏆 Your Competition Status

📊 Score: ${myScore}
🎯 Rank: ${myRank > 0 ? "#"+myRank : "Not participating yet"}

💡 Min. ${YARIS_MIN_DEPOSIT} USDT deposit required

/yaris_liderlik to see leaderboard`
    ),
    { reply_markup: mainMenu(user) }
  );
});

bot.command("kampanya", async (ctx) => {
  const db = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const totalUsers = Object.keys(db.users).length;
  const kalan = KAMPANYA_MAX_USERS - totalUsers;
  
  await ctx.reply(
    t(user,
      `🚀 Lansman Kampanyası!

✅ Min. ${KAMPANYA_MIN_DEPOSIT} USDT yatırana 1 ay 2x madenci hızı!
👥 Kalan kontenjan: ${kalan > 0 ? kalan : "DOLDU"} kişi

${user.kampanya_2x ? "✅ Kampanyadan yararlanıyorsun!" : "❌ Henüz kampanyadan yararlanmadın"}`,
      `🚀 Launch Campaign!

✅ Min. ${KAMPANYA_MIN_DEPOSIT} USDT deposit gets 2x miner speed for 1 month!
👥 Remaining spots: ${kalan > 0 ? kalan : "FULL"}

${user.kampanya_2x ? "✅ You're in the campaign!" : "❌ Not in campaign yet"}`
    ),
    { reply_markup: mainMenu(user) }
  );
});

// Admin: yarışmayı bitir ve ödülleri ver
bot.command("yarisbitir", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const db = loadDB();
  const eligible = Object.values(db.users).filter(u => (u.usdt_total_deposited||0) >= YARIS_MIN_DEPOSIT);
  const sorted = eligible.map(u => ({...u, score: yarisSkoru(u, db)})).sort((a,b) => b.score - a.score).slice(0,3);
  
  let msg = "🏆 Yarışma Sonuçları:

";
  for (let i=0; i<sorted.length; i++) {
    const winner = sorted[i];
    const odul = YARIS_ODULLER[i];
    if (odul && db.users[winner.id]) {
      db.users[winner.id].usdt = parseFloat((db.users[winner.id].usdt + odul).toFixed(2));
      await bot.api.sendMessage(winner.id, `🎉 Tebrikler! Yarışmada ${i+1}. oldun! +${odul} USDT bakiyene eklendi!`).catch(()=>{});
    }
    msg += `${i+1}. ${winner.name} — ${winner.score} puan — ${odul} USDT ödül
`;
  }
  saveDB(db);
  await ctx.reply(msg);
});

bot.catch((err) => console.error("Bot hatası:", err.message));

// Madenci saatlik kazanım - her saat çalışır
setInterval(() => {
  try {
    const db = loadDB();
    Object.values(db.users).forEach(user => {
      if (user.miner && user.miner_last_claim) {
        claimMiner(user);
      }
    });
    saveDB(db);
  } catch(e) {}
}, 3600000);

bot.start();

// ADMIN: Ücretsiz görev ekle
// Kullanım: /admintask 🎥 YouTube Kanalı https://youtube.com/... 100
