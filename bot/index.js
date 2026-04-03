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

// MADENCI SURE LIMITI
const MADENCI_SURE_GUN = 150; // 5 ay

// YARISMA
const YARIS_AKTIF = true;
const YARIS_SURE_GUN = 30; // 1 ay
const YARIS_MIN_DEPOSIT = 50;
const YARIS_ODULLER = [100, 50, 25]; // USDT


const MINERS = [
  { id: 1, tr: "\uD83D\uDD30 Baslangic", en: "\uD83D\uDD30 Starter", price: 10, hourly: 35 },
  { id: 2, tr: "\uD83E\uDD49 Bronze", en: "\uD83E\uDD49 Bronze", price: 25, hourly: 87 },
  { id: 3, tr: "\uD83E\uDD48 Silver", en: "\uD83E\uDD48 Silver", price: 50, hourly: 174 },
  { id: 4, tr: "\uD83E\uDD47 Gold", en: "\uD83E\uDD47 Gold", price: 100, hourly: 347 },
  { id: 5, tr: "\uD83D\uDC8E Diamond", en: "\uD83D\uDC8E Diamond", price: 250, hourly: 868 },
];

const AD_PACKAGES = [
  { id: 1, tr: "\uD83D\uDCE6 Starter", en: "\uD83D\uDCE6 Starter", price: 20, users: 500 },
  { id: 2, tr: "\uD83D\uDE80 Growth", en: "\uD83D\uDE80 Growth", price: 50, users: 1250 },
  { id: 3, tr: "\uD83D\uDC8E Premium", en: "\uD83D\uDC8E Premium", price: 100, users: 2500 },
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
  
  // Madenci sure kontrolu (5 ay = 150 gun)
  const minerStartDate = new Date(user.miner_start_date || user.miner_last_claim).getTime();
  const daysPassed = (Date.now() - minerStartDate) / 86400000;
  if (daysPassed >= MADENCI_SURE_GUN) {
    user.miner = null;
    user.miner_last_claim = null;
    user.miner_start_date = null;
    user.kampanya_2x = false;
    return -1;
  }
  
  // Kampanya 2x kontrolu
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
// Yarisma puani hesapla
function yarisSkoru(user, db) {
  if (!user.has_deposited || user.usdt_total_deposited < YARIS_MIN_DEPOSIT) return 0;
  let score = 0;
  // Kendi yatirimi: her 1 USDT = 1 puan
  score += Math.floor(user.usdt_total_deposited || 0);
  // Referans sayisi: her referans = 10 puan
  score += (user.referral_count || 0) * 10;
  // Referanslarin yatirimlari: her 1 USDT = 2 puan
  score += Math.floor((user.referral_total_deposit || 0) * 2);
  return score;
}

function mainMenu(user) {
  return new InlineKeyboard()
    .text(t(user,"\uD83D\uDCB0 Bakiye","\uD83D\uDCB0 Balance"),"bakiye").text(t(user,"\uD83C\uDFC6 Liderlik","\uD83C\uDFC6 Leaderboard"),"liderlik").row()
    .text(t(user,"\u26CF\uFE0F Madenci","\u26CF\uFE0F Miner"),"madenci_menu").text(t(user,"\uD83C\uDFAE Oyunlar","\uD83C\uDFAE Games"),"oyunlar_menu").row()
    .text(t(user,"\uD83D\uDCCB Gorevler","\uD83D\uDCCB Tasks"),"gorevler_menu").text(t(user,"\uD83C\uDF81 Gunluk Bonus","\uD83C\uDF81 Daily Bonus"),"bonus").row()
    .text(t(user,"\uD83D\uDCB3 Yatir","\uD83D\uDCB3 Deposit"),"yatir").text(t(user,"\uD83D\uDCB8 Cek","\uD83D\uDCB8 Withdraw"),"cek_menu").row()
    .text(t(user,"\uD83D\uDC65 Referans","\uD83D\uDC65 Referral"),"referans").text(t(user,"\uD83D\uDCE2 Reklam Ver","\uD83D\uDCE2 Advertise"),"reklam_menu");
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
      await bot.api.sendMessage(refId, `\uD83C\uDF89 Yeni referansin geldi! +500 puan kazandin!`).catch(() => {});
    }
  }
  saveDB(db);
  if (!user.lang) {
    const kb = new InlineKeyboard().text("\uD83C\uDDF9\uD83C\uDDF7 Turkce","lang_tr").text("\uD83C\uDDEC\uD83C\uDDE7 English","lang_en");
    await ctx.reply("\uD83C\uDF0D Dil secin / Select language:", { reply_markup: kb });
    return;
  }
  await ctx.reply(t(user,
    `\uD83D\uDC4B Merhaba ${ctx.from.first_name}! Hype Mining Bot'a hos geldin!\n\n\uD83E\uDE99 Puan: ${user.puan}\n\uD83D\uDCB5 USDT: ${user.usdt}\n\nAsagidan islem sec:`,
    `\uD83D\uDC4B Hello ${ctx.from.first_name}! Welcome to Hype Mining Bot!\n\n\uD83E\uDE99 Points: ${user.puan}\n\uD83D\uDCB5 USDT: ${user.usdt}\n\nChoose an option:`
  ), { reply_markup: mainMenu(user) });
});

bot.callbackQuery("lang_tr", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  user.lang = "tr"; saveDB(db); await ctx.answerCallbackQuery();
  await ctx.reply(`\uD83D\uDC4B Merhaba ${ctx.from.first_name}! Hype Mining Bot'a hos geldin!\n\n\uD83E\uDE99 Puan: ${user.puan}\n\uD83D\uDCB5 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
});
bot.callbackQuery("lang_en", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  user.lang = "en"; saveDB(db); await ctx.answerCallbackQuery();
  await ctx.reply(`\uD83D\uDC4B Hello ${ctx.from.first_name}! Welcome to Hype Mining Bot!\n\n\uD83E\uDE99 Points: ${user.puan}\n\uD83D\uDCB5 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
});
bot.command("lang", async (ctx) => {
  const kb = new InlineKeyboard().text("\uD83C\uDDF9\uD83C\uDDF7 Turkce","lang_tr").text("\uD83C\uDDEC\uD83C\uDDE7 English","lang_en");
  await ctx.reply("\uD83C\uDF0D Dil secin / Select language:", { reply_markup: kb });
});
bot.callbackQuery("ana_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  await ctx.reply(t(user,"Ana menu:","Main menu:"), { reply_markup: mainMenu(user) });
});
// BAKİYE
bot.callbackQuery("bakiye", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const earned = claimMiner(user); saveDB(db); await ctx.answerCallbackQuery();
  let msg = t(user, `\uD83D\uDCBC Bakiyeniz\n\n\uD83E\uDE99 Puan: ${user.puan}\n\uD83D\uDCB5 USDT: ${user.usdt}\n\uD83D\uDCCA ${PUAN_TO_USDT} puan = 1 USDT`, `\uD83D\uDCBC Your Balance\n\n\uD83E\uDE99 Points: ${user.puan}\n\uD83D\uDCB5 USDT: ${user.usdt}\n\uD83D\uDCCA ${PUAN_TO_USDT} points = 1 USDT`);
  if (earned === -1) {
    msg += t(user, `\n\n\u26A0\uFE0F Madencinin suresi doldu! Yeni madenci satin alman gerekiyor.`, `\n\n\u26A0\uFE0F Your miner expired! You need to buy a new one.`);
  } else if (earned > 0) {
    msg += t(user, `\n\n\u26CF\uFE0F Madenciden +${earned} puan!`, `\n\n\u26CF\uFE0F Miner earned +${earned} points!`);
  }
  if (user.kampanya_2x && user.kampanya_bitis) {
    const kalan = Math.ceil((new Date(user.kampanya_bitis).getTime() - Date.now()) / 86400000);
    if (kalan > 0) msg += t(user, `\n\uD83D\uDE80 Kampanya 2x aktif! ${kalan} gun kaldi`, `\n\uD83D\uDE80 2x Campaign active! ${kalan} days left`);
  }
  if (user.miner) {
    const miner = MINERS.find(m => m.id === user.miner);
    msg += t(user, `\n\u26CF\uFE0F Aktif madenci: ${miner.tr} (${miner.hourly} puan/saat)`, `\n\u26CF\uFE0F Active miner: ${miner.en} (${miner.hourly} pts/hr)`);
  }
  await ctx.reply(msg, { reply_markup: mainMenu(user) });
});

// LIDERLIK
bot.callbackQuery("liderlik", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const sorted = Object.values(db.users).sort((a,b) => b.puan - a.puan).slice(0,10);
  let msg = t(user,"\uD83C\uDFC6 Liderlik Tablosu\n\n","\uD83C\uDFC6 Leaderboard\n\n");
  sorted.forEach((u,i) => { const m=i===0?"\uD83E\uDD47":i===1?"\uD83E\uDD48":i===2?"\uD83E\uDD49":`${i+1}.`; msg+=`${m} ${u.name} - ${u.puan}\n`; });
  await ctx.answerCallbackQuery(); await ctx.reply(msg, { reply_markup: mainMenu(user) });
});

// GUNLUK BONUS
bot.callbackQuery("bonus", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const bugun = new Date().toDateString(); await ctx.answerCallbackQuery();
  if (user.last_bonus === bugun) { await ctx.reply(t(user,"\u23F0 Gunluk bonusunu zaten aldin!","\u23F0 Already claimed today!"), { reply_markup: mainMenu(user) }); return; }
  const bonus = Math.floor(Math.random()*50)+50; user.puan+=bonus; user.last_bonus=bugun; saveDB(db);
  await ctx.reply(t(user,`\uD83C\uDF81 +${bonus} puan kazandin!\n\uD83E\uDE99 Toplam: ${user.puan}`,`\uD83C\uDF81 +${bonus} points earned!\n\uD83E\uDE99 Total: ${user.puan}`), { reply_markup: mainMenu(user) });
});

// MADENCI MENU
bot.callbackQuery("madenci_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  let msg = t(user,"\u26CF\uFE0F Madenci Satin Al\n\n","\u26CF\uFE0F Buy Miner\n\n");
  MINERS.forEach(m => { msg += t(user,`${m.tr}: ${m.price} USDT -> ${m.hourly} puan/saat\n`,`${m.en}: ${m.price} USDT -> ${m.hourly} pts/hr\n`); });
  const kb = new InlineKeyboard();
  MINERS.forEach(m => kb.text(t(user,m.tr,m.en), `buy_miner_${m.id}`));
  kb.row().text(t(user,"\uD83D\uDD19 Geri","\uD83D\uDD19 Back"),"ana_menu");
  await ctx.reply(msg, { reply_markup: kb });
});

MINERS.forEach(miner => {
  bot.callbackQuery(`buy_miner_${miner.id}`, async (ctx) => {
    const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
    await ctx.answerCallbackQuery();
    if (user.usdt < miner.price) {
      await ctx.reply(t(user,`\u274C Yetersiz USDT! Gerekli: ${miner.price} USDT`,`\u274C Not enough USDT! Required: ${miner.price} USDT`), { reply_markup: mainMenu(user) }); return;
    }
    user.usdt = parseFloat((user.usdt - miner.price).toFixed(2));
    user.miner = miner.id;
    user.miner_last_claim = new Date().toISOString();
    user.miner_start_date = new Date().toISOString();
    saveDB(db);
    await ctx.reply(t(user,`\u2705 ${miner.tr} satin aldin! Saatte ${miner.hourly} puan kazanmaya basladin.`,`\u2705 ${miner.en} purchased! Earning ${miner.hourly} pts/hr.`), { reply_markup: mainMenu(user) });
  });
});// OYUNLAR
bot.callbackQuery("oyunlar_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text(t(user,"\uD83C\uDFB0 Sans Carki","\uD83C\uDFB0 Spin Wheel"),"cark_menu").row()
    .text(t(user,"\uD83C\uDFB2 Zar Oyunu","\uD83C\uDFB2 Dice Game"),"zar_menu").row()
    .text(t(user,"\uD83D\uDD19 Geri","\uD83D\uDD19 Back"),"ana_menu");
  await ctx.reply(t(user,"\uD83C\uDFAE Oyunlar","\uD83C\uDFAE Games"), { reply_markup: kb });
});

// SANS CARKI
bot.callbackQuery("cark_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("\uD83E\uDE99 50","cark_p_50").text("\uD83E\uDE99 100","cark_p_100").text("\uD83E\uDE99 500","cark_p_500").row()
    .text("\uD83D\uDCB5 1 USDT","cark_u_1").text("\uD83D\uDCB5 5 USDT","cark_u_5").row()
    .text(t(user,"\uD83D\uDD19 Geri","\uD83D\uDD19 Back"),"oyunlar_menu");
  await ctx.reply(t(user,"\uD83C\uDFB0 Sans Carki\n\n%60 kaybet | 1.5x | 2x | 3x\n\nNe kadar yatirmak istiyorsun?","\uD83C\uDFB0 Spin Wheel\n\n60% lose | 1.5x | 2x | 3x\n\nHow much to bet?"), { reply_markup: kb });
});

async function carkOyna(ctx, tip, miktar) {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (tip==="puan" && user.puan<miktar) { await ctx.reply(t(user,"\u274C Yetersiz puan!","\u274C Not enough points!"), { reply_markup: mainMenu(user) }); return; }
  if (tip==="usdt" && user.usdt<miktar) { await ctx.reply(t(user,"\u274C Yetersiz USDT!","\u274C Not enough USDT!"), { reply_markup: mainMenu(user) }); return; }
  const rand = Math.random();
  let carpan, sonuc;
  if (rand<0.60) { carpan=0; sonuc=t(user,"\uD83D\uDC80 Kaybettin!","\uD83D\uDC80 You lost!"); }
  else if (rand<0.80) { carpan=1.5; sonuc=t(user,"\uD83D\uDD25 1.5x Kazandin!","\uD83D\uDD25 1.5x Win!"); }
  else if (rand<0.93) { carpan=2; sonuc=t(user,"\u2B50 2x Kazandin!","\u2B50 2x Win!"); }
  else { carpan=3; sonuc=t(user,"\uD83D\uDC8E 3x Kazandin!","\uD83D\uDC8E 3x Win!"); }
  if (tip==="puan") {
    const fark = Math.floor(miktar*carpan)-miktar; user.puan+=fark;
    await ctx.reply(`\uD83C\uDFB0 ${sonuc}\n\
    n${fark>=0?"+"+fark:fark} ${t(user,"puan","pts")}\n\uD83E\uDE99 ${t(user,"Puan","Points")}: ${user.puan}`, { reply_markup: mainMenu(user) });
  } else {
    const fark = parseFloat((miktar*carpan-miktar).toFixed(2)); user.usdt=parseFloat((user.usdt+fark).toFixed(2));
    await ctx.reply(`\uD83C\uDFB0 ${sonuc}\n\n${fark>=0?"+"+fark:fark} USDT\n\uD83D\uDCB5 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
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
    .text("\uD83E\uDE99 50","zar_p_50").text("\uD83E\uDE99 100","zar_p_100").text("\uD83E\uDE99 500","zar_p_500").row()
    .text("\uD83D\uDCB5 1 USDT","zar_u_1").text("\uD83D\uDCB5 5 USDT","zar_u_5").row()
    .text(t(user,"\uD83D\uDD19 Geri","\uD83D\uDD19 Back"),"oyunlar_menu");
  await ctx.reply(t(user,"\uD83C\uDFB2 Zar Oyunu\n\n1-3: 0x | 4: 0.5x | 5: 1.5x | 6: 2x\n\nNe kadar yatirmak istiyorsun?","\uD83C\uDFB2 Dice Game\n\n1-3: 0x | 4: 0.5x | 5: 1.5x | 6: 2x\n\nHow much to bet?"), { reply_markup: kb });
});

async function zarOyna(ctx, tip, miktar) {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (tip==="puan" && user.puan<miktar) { await ctx.reply(t(user,"\u274C Yetersiz puan!","\u274C Not enough points!"), { reply_markup: mainMenu(user) }); return; }
  if (tip==="usdt" && user.usdt<miktar) { await ctx.reply(t(user,"\u274C Yetersiz USDT!","\u274C Not enough USDT!"), { reply_markup: mainMenu(user) }); return; }
  const zar = Math.floor(Math.random()*6)+1;
  const emojiler = ["","\u0031\uFE0F\u20E3","\u0032\uFE0F\u20E3","\u0033\uFE0F\u20E3","\u0034\uFE0F\u20E3","\u0035\uFE0F\u20E3","\u0036\uFE0F\u20E3"];
  let carpan, sonuc;
  if (zar<=3) { carpan=0; sonuc=t(user,"\uD83D\uDC80 Kaybettin!","\uD83D\uDC80 You lost!"); }
  else if (zar===4) { carpan=0.5; sonuc=t(user,"\uD83D\uDE10 0.5x","\uD83D\uDE10 0.5x"); }
  else if (zar===5) { carpan=1.5; sonuc=t(user,"\uD83D\uDD25 1.5x Kazandin!","\uD83D\uDD25 1.5x Win!"); }
  else { carpan=2; sonuc=t(user,"\uD83C\uDF89 2x Kazandin!","\uD83C\uDF89 2x Win!"); }
  if (tip==="puan") {
    const fark = Math.floor(miktar*carpan)-miktar; user.puan+=fark;
    await ctx.reply(`\uD83C\uDFB2 ${emojiler[zar]} ${sonuc}\n\n${fark>=0?"+"+fark:fark} ${t(user,"puan","pts")}\n\uD83E\uDE99 ${t(user,"Puan","Points")}: ${user.puan}`, { reply_markup: mainMenu(user) });
  } else {
    const fark = parseFloat((miktar*carpan-miktar).toFixed(2)); user.usdt=parseFloat((user.usdt+fark).toFixed(2));
    await ctx.reply(`\uD83C\uDFB2 ${emojiler[zar]} ${sonuc}\n\n${fark>=0?"+"+fark:fark} USDT\n\uD83D\uDCB5 USDT: ${user.usdt}`, { reply_markup: mainMenu(user) });
  }
  saveDB(db);
}
bot.callbackQuery("zar_p_50", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"puan",50); });
bot.callbackQuery("zar_p_100", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"puan",100); });
bot.callbackQuery("zar_p_500", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"puan",500); });
bot.callbackQuery("zar_u_1", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"usdt",1); });
bot.callbackQuery("zar_u_5", async (ctx) => { await ctx.answerCallbackQuery(); await zarOyna(ctx,"usdt",5); });
// GOREVLER
bot.callbackQuery("gorevler_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text(t(user,"\uD83D\uDCE2 Kanala Katil","\uD83D\uDCE2 Join Channel"),"task_channel").row()
    .text(t(user,"\uD83C\uDF81 Gunluk Gorev","\uD83C\uDF81 Daily Task"),"daily_task").row();
  if (db.tasks && db.tasks.filter(t => t.active).length > 0) {
    db.tasks.filter(t => t.active).forEach(task => {
      kb.text(`${task.icon} ${isEN(user)?task.title_en:task.title} (+${task.puan} puan)`, `do_task_${task.id}`).row();
    });
  }
  kb.text(t(user,"\uD83D\uDD19 Geri","\uD83D\uDD19 Back"),"ana_menu");
  await ctx.reply(t(user,"\uD83D\uDCCB Gorevler\n\nGorevleri tamamla, puan kazan!","\uD83D\uDCCB Tasks\n\nComplete tasks, earn points!"), { reply_markup: kb });
});

bot.callbackQuery("task_channel", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  if (user.channel_joined) { await ctx.reply(t(user,"\u2705 Kanala zaten katildin!","\u2705 Already joined!"), { reply_markup: mainMenu(user) }); return; }
  const kb = new InlineKeyboard().url(t(user,"\uD83D\uDCE2 Kanala Katil","\uD83D\uDCE2 Join Channel"), "https://t.me/HypeMiningCommunity").row().text(t(user,"\u2705 Katildim","\u2705 Joined"), "verify_channel");
  await ctx.reply(t(user,"\uD83D\uDCE2 Kanalimiza katil ve +300 puan kazan!","\uD83D\uDCE2 Join our channel and earn +300 points!"), { reply_markup: kb });
});

bot.callbackQuery("verify_channel", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  if (user.channel_joined) { await ctx.reply(t(user,"\u2705 Zaten tamamlandi!","\u2705 Already done!"), { reply_markup: mainMenu(user) }); return; }
  user.channel_joined = true; user.puan += 300; saveDB(db);
  await ctx.reply(t(user,"\u2705 Tesekkurler! +300 puan kazandin!","\u2705 Thanks! +300 points earned!"), { reply_markup: mainMenu(user) });
});

bot.callbackQuery("daily_task", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const bugun = new Date().toDateString(); await ctx.answerCallbackQuery();
  if (user.last_gorev === bugun) { await ctx.reply(t(user,"\u2705 Bugunku gorevini tamamladin!","\u2705 Daily task done!"), { reply_markup: mainMenu(user) }); return; }
  const gorevler = [
    { tr:"\uD83C\uDFB2 Zar oyununu 3 kez oyna", en:"\uD83C\uDFB2 Play dice 3 times", puan:150 },
    { tr:"\uD83C\uDFB0 Sans carkini 2 kez cevir", en:"\uD83C\uDFB0 Spin the wheel 2 times", puan:200 },
    { tr:"\uD83C\uDF81 Gunluk bonusunu al", en:"\uD83C\uDF81 Claim daily bonus", puan:100 },
  ];
  const gorev = gorevler[Math.floor(Math.random()*gorevler.length)];
  user.last_gorev = bugun; user.puan += gorev.puan; saveDB(db);
  await ctx.reply(t(user,`\uD83D\uDCCB ${gorev.tr}\n\n\u2705 Tamamlandi! +${gorev.puan} puan kazandin!`,`\uD83D\uDCCB ${gorev.en}\n\n\u2705 Done! +${gorev.puan} points earned!`), { reply_markup: mainMenu(user) });
});

bot.callbackQuery(/do_task_(.+)/, async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const taskId = parseInt(ctx.match[1]);
  const task = db.tasks.find(t => t.id === taskId);
  await ctx.answerCallbackQuery();
  if (!task || !task.active) { await ctx.reply(t(user,"\u274C Gorev bulunamadi!","\u274C Task not found!"), { reply_markup: mainMenu(user) }); return; }
  if (user.completed_tasks.includes(taskId)) { await ctx.reply(t(user,"\u2705 Bu gorevi zaten tamamladin!","\u2705 Already completed!"), { reply_markup: mainMenu(user) }); return; }
  const kb = new InlineKeyboard().url("\uD83D\uDD17 "+t(user,task.title,task.title_en), task.url && task.url.startsWith("http") ? task.url : "https://t.me/HypeMiningCommunity").row().text(t(user,"\u2705 Tamamladim","\u2705 Done"), `verify_task_${taskId}`);
  await ctx.reply(t(user,`\uD83D\uDCCB ${task.title}\n\nGorevi tamamla ve +${task.puan} puan kazan!`,`\uD83D\uDCCB ${task.title_en}\n\nComplete and earn +${task.puan} points!`), { reply_markup: kb });
});

bot.callbackQuery(/verify_task_(.+)/, async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const taskId = parseInt(ctx.match[1]);
  const task = db.tasks.find(t => t.id === taskId);
  await ctx.answerCallbackQuery();
  if (!task) return;
  if (user.completed_tasks.includes(taskId)) { await ctx.reply(t(user,"\u2705 Zaten tamamlandi!","\u2705 Already done!"), { reply_markup: mainMenu(user) }); return; }
  user.completed_tasks.push(taskId); user.puan += task.puan; saveDB(db);
  await ctx.reply(t(user,`\u2705 Gorev tamamlandi! +${task.puan} puan kazandin!`,`\u2705 Task done! +${task.puan} points earned!`), { reply_markup: mainMenu(user) });
});

// YATIRIM
bot.callbackQuery("yatir", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  await ctx.reply(t(user,
    `\uD83D\uDCB3 USDT Yatirma (TRC20)\n\nAsagidaki adrese USDT gonder:\n\n${USDT_ADDRESS}\n\nGonderdikten sonra:\n/txhash HASH_KODU`,
    `\uD83D\uDCB3 USDT Deposit (TRC20)\n\nSend USDT to:\n\n${USDT_ADDRESS}\n\nAfter sending:\n/txhash HASH_CODE`
  ), { reply_markup: mainMenu(user) });
});
bot.command("txhash", async (ctx) => {
  const hash = ctx.match;
  if (!hash) { await ctx.reply("Kullanim: /txhash HASH_KODU"); return; }
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  db.pending_deposits.push({ user_id: ctx.from.id, name: ctx.from.first_name, hash, date: new Date().toISOString() }); saveDB(db);
  await ctx.reply(t(user,"\u2705 TX hash alindi! Admin onayladiktan sonra bakiyene yansiyacak.","\u2705 TX hash received! Will be added after admin approval."), { reply_markup: mainMenu(user) });
  if (ADMIN_ID) {
    const kb = new InlineKeyboard()
      .text("\u2705 10 USDT", `dep_ok_${ctx.from.id}_10`).text("\u2705 25 USDT", `dep_ok_${ctx.from.id}_25`).text("\u2705 50 USDT", `dep_ok_${ctx.from.id}_50`).row()
      .text("\u2705 100 USDT", `dep_ok_${ctx.from.id}_100`).text("\u2705 250 USDT", `dep_ok_${ctx.from.id}_250`).row()
      .text("\u274C Reddet", `dep_no_${ctx.from.id}`);
    await bot.api.sendMessage(ADMIN_ID, `\uD83D\uDCB3 Yatirim talebi!\n\uD83D\uDC64 ${ctx.from.first_name} (${ctx.from.id})\n\uD83D\uDD17 ${hash}`, { reply_markup: kb });
  }
});

// CEKIM
bot.callbackQuery("cek_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text(t(user,"\uD83D\uDCB5 USDT Cek","\uD83D\uDCB5 Withdraw USDT"),"cek_usdt").row()
    .text(t(user,"\uD83E\uDE99 Puan -> USDT Cevir","\uD83E\uDE99 Convert Points -> USDT"),"puan_cevir").row()
    .text(t(user,"\uD83D\uDD19 Geri","\uD83D\uDD19 Back"),"ana_menu");
  await ctx.reply(t(user,"\uD83D\uDCB8 Cekim menusu:","\uD83D\uDCB8 Withdrawal menu:"), { reply_markup: kb });
});

bot.callbackQuery("puan_cevir", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  await ctx.reply(t(user,
    `\uD83E\uDE99 Puan -> USDT Cevir\n\n${PUAN_TO_USDT} puan = 1 USDT\n\nMevcut puan: ${user.puan}\nCevrilebilir: ${(user.puan/PUAN_TO_USDT).toFixed(4)} USDT\n\nKullanim: /puancevir MIKTAR\nOrnek: /puancevir 5000`,
    `\uD83E\uDE99 Convert Points -> USDT\n\n${PUAN_TO_USDT} points = 1 USDT\n\nCurrent points: ${user.puan}\nConvertible: ${(user.puan/PUAN_TO_USDT).toFixed(4)} USDT\n\nUsage: /convertpoints AMOUNT\nExample: /convertpoints 5000`
  ), { reply_markup: mainMenu(user) });
});

bot.command("puancevir", async (ctx) => {
  const miktar = parseInt(ctx.match);
  if (!miktar || miktar < PUAN_TO_USDT) { await ctx.reply(`Minimum ${PUAN_TO_USDT} puan cevrilebilir.`); return; }
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (user.puan < miktar) { await ctx.reply(t(user,"\u274C Yetersiz puan!","\u274C Not enough points!")); return; }
  const usdt = parseFloat((miktar / PUAN_TO_USDT).toFixed(4));
  user.puan -= miktar; user.usdt = parseFloat((user.usdt + usdt).toFixed(4)); saveDB(db);
  await ctx.reply(t(user,`\u2705 ${miktar} puan -> ${usdt} USDT cevirildi!`,`\u2705 Converted ${miktar} points -> ${usdt} USDT!`), { reply_markup: mainMenu(user) });
});

bot.callbackQuery("cek_usdt", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  if (!user.has_deposited) { await ctx.reply(t(user,"\u274C Cekim yapabilmek icin once para yatirman gerekiyor!","\u274C You need to make a deposit first!"), { reply_markup: mainMenu(user) }); return; }
  await ctx.reply(t(user,
    `\uD83D\uDCB8 USDT Cekme\n\nMin: ${MIN_WITHDRAW} USDT\nGunluk max: ${MAX_DAILY_WITHDRAW} USDT\nBekleme: ${WITHDRAW_WAIT_DAYS} gun\n\nKullanim: /cek MIKTAR TRC20_ADRES`,
    `\uD83D\uDCB8 Withdraw USDT\n\nMin: ${MIN_WITHDRAW} USDT\nDaily max: ${MAX_DAILY_WITHDRAW} USDT\nWait: ${WITHDRAW_WAIT_DAYS} days\n\nUsage: /withdraw AMOUNT TRC20_ADDRESS`
  ), { reply_markup: mainMenu(user) });
});

bot.command("cek", async (ctx) => {
  const args = ctx.match.split(" ");
  if (args.length < 2) { await ctx.reply("Kullanim: /cek MIKTAR ADRES"); return; }
  const miktar = parseFloat(args[0]); const adres = args[1];
  if (isNaN(miktar) || miktar < MIN_WITHDRAW) { await ctx.reply(`\u274C Minimum cekim: ${MIN_WITHDRAW} USDT`); return; }
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  if (!user.has_deposited) { await ctx.reply(t(user,"\u274C Cekim icin once para yatirman gerekiyor!","\u274C Deposit required first!")); return; }
  if (user.usdt < miktar) { await ctx.reply(t(user,`\u274C Yetersiz bakiye: ${user.usdt} USDT`,`\u274C Insufficient balance: ${user.usdt} USDT`)); return; }
  if (user.deposit_date) {
    const days = (Date.now() - new Date(user.deposit_date).getTime()) / 86400000;
    if (days < WITHDRAW_WAIT_DAYS) { await ctx.reply(t(user,`\u274C ${Math.ceil(WITHDRAW_WAIT_DAYS-days)} gun daha beklemeniz gerekiyor.`,`\u274C Wait ${Math.ceil(WITHDRAW_WAIT_DAYS-days)} more days.`)); return; }
  }
  const bugun = new Date().toDateString();
  if (user.last_withdraw_date === bugun && user.daily_withdrawn + miktar > MAX_DAILY_WITHDRAW) {
    await ctx.reply(t(user,`\u274C Gunluk cekim limitine ulastin: ${MAX_DAILY_WITHDRAW} USDT`,`\u274C Daily limit reached: ${MAX_DAILY_WITHDRAW} USDT`)); return;
  }
  user.usdt = parseFloat((user.usdt - miktar).toFixed(2));
  user.daily_withdrawn = user.last_withdraw_date === bugun ? user.daily_withdrawn + miktar : miktar;
  user.last_withdraw_date = bugun;
  db.pending_withdrawals.push({ user_id: ctx.from.id, name: ctx.from.first_name, miktar, adres, date: new Date().toISOString() }); saveDB(db);
  await ctx.reply(t(user,`\u2705 ${miktar} USDT cekim talebi alindi!`,`\u2705 Withdrawal of ${miktar} USDT requested!`), { reply_markup: mainMenu(user) });
  if (ADMIN_ID) {
    const kb = new InlineKeyboard().text("\u2705 Gonderildi",`wit_ok_${ctx.from.id}`).text("\u274C Reddet",`wit_no_${ctx.from.id}_${miktar}`);
    await bot.api.sendMessage(ADMIN_ID, `\uD83D\uDCB8 Cekim talebi!\n\uD83D\uDC64 ${ctx.from.first_name} (${ctx.from.id})\n\uD83D\uDCB5 ${miktar} USDT\n\uD83D\uDCEB ${adres}`, { reply_markup: kb });
  }
});
// REFERANS
bot.callbackQuery("referans", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  const refLink = `https://t.me/Hype_Mining_Bot?start=ref_${ctx.from.id}`;
  await ctx.reply(t(user,
    `\uD83D\uDC65 Referans Sistemi\n\n\uD83D\uDD17 Referans linkin:\n${refLink}\n\n\uD83D\uDCCA Toplam referansin: ${user.referral_count || 0}\n\n\u2705 Her kayit: +500 puan\n\u2705 Ilk yatirimda: %10 USDT bonus`,
    `\uD83D\uDC65 Referral System\n\n\uD83D\uDD17 Your link:\n${refLink}\n\n\uD83D\uDCCA Total referrals: ${user.referral_count || 0}\n\n\u2705 Each signup: +500 points\n\u2705 First deposit: 10% USDT bonus`
  ), { reply_markup: mainMenu(user) });
});

// REKLAM MENU
bot.callbackQuery("reklam_menu", async (ctx) => {
  const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  let msg = t(user,"\uD83D\uDCE2 Reklam Ver\n\nBotumuzda reklam ver, binlerce kullaniciya ulaş!\n\n","\uD83D\uDCE2 Advertise\n\nReach thousands of users!\n\n");
  AD_PACKAGES.forEach(p => { msg += t(user,`${p.tr}: ${p.price} USDT -> ${p.users} kullaniciya gorev\n`,`${p.en}: ${p.price} USDT -> ${p.users} users task\n`); });
  const kb = new InlineKeyboard();
  AD_PACKAGES.forEach(p => kb.text(t(user,p.tr,p.en), `buy_ad_${p.id}`));
  kb.row().text(t(user,"\uD83D\uDD19 Geri","\uD83D\uDD19 Back"),"ana_menu");
  await ctx.reply(msg, { reply_markup: kb });
});

AD_PACKAGES.forEach(pkg => {
  bot.callbackQuery(`buy_ad_${pkg.id}`, async (ctx) => {
    const db = loadDB(); const user = getUser(db, ctx.from.id, ctx.from.first_name);
    await ctx.answerCallbackQuery();
    await ctx.reply(t(user,
      `\uD83D\uDCE2 ${pkg.tr} Paketi\n\n\uD83D\uDCB5 Fiyat: ${pkg.price} USDT\n\uD83D\uDC65 ${pkg.users} kullaniciya gorev\n\nOdeme adimlari:\n1. ${USDT_ADDRESS} adresine ${pkg.price} USDT gonder\n2. /adtxhash HASH BASLIK URL PUAN formatinda gonder\n\nOrnek:\n/adtxhash abc123 YouTube Kanali https://youtube.com/... 100`,
      `\uD83D\uDCE2 ${pkg.en} Package\n\n\uD83D\uDCB5 Price: ${pkg.price} USDT\n\uD83D\uDC65 Task for ${pkg.users} users\n\nPayment:\n1. Send ${pkg.price} USDT to ${USDT_ADDRESS}\n2. Use /adtxhash HASH TITLE URL POINTS\n\nExample:\n/adtxhash abc123 YouTube Channel https://youtube.com/... 100`
    ), { reply_markup: mainMenu(user) });
  });
});

bot.command("adtxhash", async (ctx) => {
  const parts = ctx.match.split(" ");
  if (parts.length < 4) { await ctx.reply("Kullanim: /adtxhash HASH BASLIK URL PUAN"); return; }
  const [hash, ...rest] = parts;
  const puan = parseInt(rest[rest.length-1]);
  const url = rest[rest.length-2];
  const title = rest.slice(0, rest.length-2).join(" ");
  const db = loadDB();
  db.pending_ads = db.pending_ads || [];
  db.pending_ads.push({ user_id: ctx.from.id, name: ctx.from.first_name, hash, title, url, puan, date: new Date().toISOString() }); saveDB(db);
  await ctx.reply("\u2705 Reklam talebiniz alindi! Admin onayladiktan sonra yayina girecek.");
  if (ADMIN_ID) {
    const kb = new InlineKeyboard().text("\u2705 Onayla", `ad_ok_${ctx.from.id}_${db.pending_ads.length-1}`).text("\u274C Reddet", `ad_no_${ctx.from.id}`);
    await bot.api.sendMessage(ADMIN_ID, `\uD83D\uDCE2 Reklam talebi!\n\uD83D\uDC64 ${ctx.from.first_name}\n\uD83D\uDCDD ${title}\n\uD83D\uDD17 ${url}\n\uD83C\uDFC6 ${puan} puan\n\uD83D\uDD17 Hash: ${hash}`, { reply_markup: kb });
  }
});

// ADMIN: Yatirim onayla
bot.callbackQuery(/dep_ok_(.+)_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  const userId = parseInt(ctx.match[1]); const miktar = parseFloat(ctx.match[2]);
  const db = loadDB(); const user = db.users[userId];
  if (!user) { await ctx.answerCallbackQuery("Kullanici bulunamadi!"); return; }
  user.usdt = parseFloat((user.usdt + miktar).toFixed(2));
  user.usdt_total_deposited = parseFloat(((user.usdt_total_deposited || 0) + miktar).toFixed(2));
  user.has_deposited = true;
  if (!user.deposit_date) user.deposit_date = new Date().toISOString();
  const totalUsers = Object.keys(db.users).length;
  if (KAMPANYA_AKTIF && miktar >= KAMPANYA_MIN_DEPOSIT && totalUsers <= KAMPANYA_MAX_USERS && !user.kampanya_2x) {
    user.kampanya_2x = true;
    const bitis = new Date();
    bitis.setDate(bitis.getDate() + KAMPANYA_SURE_GUN);
    user.kampanya_bitis = bitis.toISOString();
    await bot.api.sendMessage(userId, `\uD83D\uDE80 Lansman kampanyasi! 1 ay boyunca madenci hizin 2x oldu!`).catch(()=>{});
  }
  if (user.referrer && db.users[user.referrer]) {
    const refUser = db.users[user.referrer];
    const refBonus = parseFloat((miktar * 0.1).toFixed(2));
    refUser.usdt = parseFloat((refUser.usdt + refBonus).toFixed(2));
    refUser.referral_total_deposit = parseFloat(((refUser.referral_total_deposit || 0) + miktar).toFixed(2));
    await bot.api.sendMessage(user.referrer, `\uD83C\uDF89 Referansin ${miktar} USDT yatirdi! +${refBonus} USDT bonus kazandin!`).catch(()=>{});
    user.referrer = null;
  }
  saveDB(db);
  await ctx.answerCallbackQuery("\u2705 Onaylandi!");
  await ctx.editMessageText(`\u2705 ${miktar} USDT onaylandi.`);
  await bot.api.sendMessage(userId, `\u2705 ${miktar} USDT bakiyenize eklendi!`);
});
bot.callbackQuery(/dep_no_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  await ctx.answerCallbackQuery("\u274C"); await ctx.editMessageText("\u274C Reddedildi.");
  await bot.api.sendMessage(parseInt(ctx.match[1]), "\u274C Yatirim talebiniz reddedildi.");
});

bot.callbackQuery(/wit_ok_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  await ctx.answerCallbackQuery("\u2705"); await ctx.editMessageText("\u2705 Gonderildi.");
  await bot.api.sendMessage(parseInt(ctx.match[1]), "\u2705 Cekim isleminiz tamamlandi!");
});

bot.callbackQuery(/wit_no_(.+)_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  const userId = parseInt(ctx.match[1]); const miktar = parseFloat(ctx.match[2]);
  const db = loadDB(); const user = db.users[userId];
  if (user) { user.usdt = parseFloat((user.usdt + miktar).toFixed(2)); saveDB(db); }
  await ctx.answerCallbackQuery("\u274C"); await ctx.editMessageText("\u274C Reddedildi.");
  await bot.api.sendMessage(userId, `\u274C Cekim reddedildi. ${miktar} USDT iade edildi.`);
});

bot.callbackQuery(/ad_ok_(.+)_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  const db = loadDB();
  const idx = parseInt(ctx.match[2]);
  const ad = db.pending_ads[idx];
  if (!ad) { await ctx.answerCallbackQuery("Bulunamadi!"); return; }
  db.tasks = db.tasks || [];
  const icons = {"youtube":"\uD83C\uDFA5","instagram":"\uD83D\uDCF8","telegram":"\uD83D\uDC65","app":"\uD83D\uDCF1","referral":"\uD83D\uDD17"};
  const icon = Object.keys(icons).find(k => ad.url.includes(k)) ? icons[Object.keys(icons).find(k => ad.url.includes(k))] : "\uD83D\uDCCB";
  db.tasks.push({ id: Date.now(), icon, title: ad.title, title_en: ad.title, url: ad.url, puan: ad.puan, active: true });
  db.pending_ads.splice(idx, 1); saveDB(db);
  await ctx.answerCallbackQuery("\u2705"); await ctx.editMessageText("\u2705 Reklam onaylandi ve yayina girdi.");
  await bot.api.sendMessage(ad.user_id, "\u2705 Reklaniniz onaylandi! Gorev olarak yayina girdi.").catch(()=>{});
});

bot.callbackQuery(/ad_no_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) { await ctx.answerCallbackQuery("Yetkisiz!"); return; }
  await ctx.answerCallbackQuery("\u274C"); await ctx.editMessageText("\u274C Reddedildi.");
  await bot.api.sendMessage(parseInt(ctx.match[1]), "\u274C Reklam talebiniz reddedildi.").catch(()=>{});
});

// ADMIN KOMUTLARI
bot.command("ekle", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.match.split(" ");
  if (args.length < 3) { await ctx.reply("Kullanim: /ekle USER_ID MIKTAR puan|usdt"); return; }
  const db = loadDB(); const user = db.users[parseInt(args[0])];
  if (!user) { await ctx.reply("Kullanici bulunamadi."); return; }
  if (args[2]==="puan") user.puan+=parseFloat(args[1]);
  else { user.usdt=parseFloat((user.usdt+parseFloat(args[1])).toFixed(2)); user.has_deposited=true; }
  saveDB(db); await ctx.reply("\u2705 Eklendi.");
});

bot.command("istatistik", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const db = loadDB();
  const users = Object.values(db.users);
  const totalDeposit = users.filter(u => u.has_deposited).length;
  const totalPuan = users.reduce((a,b) => a+b.puan, 0);
  const totalUsdt = users.reduce((a,b) => a+b.usdt, 0);
  await ctx.reply(`\uD83D\uDCCA Istatistikler\n\n\uD83D\uDC65 Toplam kullanici: ${users.length}\n\uD83D\uDCB3 Yatirim yapan: ${totalDeposit}\n\uD83E\uDE99 Toplam puan: ${totalPuan}\n\uD83D\uDCB5 Toplam USDT: ${totalUsdt.toFixed(2)}\n\uD83D\uDCCB Aktif gorev: ${(db.tasks||[]).filter(t=>t.active).length}`);
});

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
// Kanala yeni katilan uyelere hos geldin mesaji
bot.on("chat_member", async (ctx) => {
  try {
    const member = ctx.chatMember;
    if (member.new_chat_member.status !== "member") return;
    const user = member.new_chat_member.user;
    if (user.is_bot) return;
    const name = user.first_name || "Arkadas";
    const db = loadDB();
    const u = db.users[user.id];
    const lang = u ? u.lang : null;

    if (lang === "en") {
      await ctx.reply(
        `\u26CF\uFE0F Welcome to Hype Mining Community, ${name}!\n\n` +
        `\uD83D\uDC8E You've just joined Telegram's most exciting crypto mining bot!\n\n` +
        `\uD83D\uDE80 HOW IT WORKS?\n` +
        `\u251C \u26CF\uFE0F Buy a miner -> earn hourly points\n` +
        `\u251C \uD83C\uDFB0 Spin wheel & \uD83C\uDFB2 dice games to multiply points\n` +
        `\u251C \uD83C\uDF81 Claim free daily bonus\n` +
        `\u251C \uD83D\uDC65 Refer friends -> 10% referral bonus\n` +
        `\u2514 \uD83D\uDCB5 Convert points to real USDT!\n\n` +
        `\uD83D\uDCA1 5,000 points = 1 USDT\n` +
        `\uD83D\uDCA1 Start completely FREE -- 100 points gift!\n\n` +
        `\uD83D\uDCE2 WANT TO ADVERTISE?\n` +
        `Add your custom task to the bot!\n` +
        `Reach thousands of users -> Packages: 20/50/100 USDT\n\n` +
        `\uD83E\uDD16 Start now: @Hype_Mining_Bot`
      );
    } else {
      await ctx.reply(
        `\u26CF\uFE0F Hype Mining Community'e Hos Geldin, ${name}!\n\n` +
        `\uD83D\uDC8E Telegram'in en eglenceli kripto madencilik botuna adim attin!\n\n` +
        `\uD83D\uDE80 NASIL CALISIR?\n` +
        `\u251C \u26CF\uFE0F Madenci satin al -> saatlik puan kazan\n` +
        `\u251C \uD83C\uDFB0 Sans carki & \uD83C\uDFB2 zar oyunlariyla puan harca\n` +
        `\u251C \uD83C\uDF81 Her gun ucretsiz bonus al\n` +
        `\u251C \uD83D\uDC65 Arkadaslarini davet et -> %10 referans bonusu\n` +
        `\u2514 \uD83D\uDCB5 Puanlarini gercek USDT'ye cevir!\n\n` +
        `\uD83D\uDCA1 5.000 puan = 1 USDT\n` +
        `\uD83D\uDCA1 Baslamak tamamen UCRETSIZ -- 100 puan hediye!\n\n` +
        `\uD83D\uDCE2 REKLAM VERMEK ISTIYOR MUSUN?\n` +
        `Kanalin ozel gorev eklet, binlerce kullaniciya ulaş!\n` +
        `Paketler: 20 / 50 / 100 USDT\n\n` +
        `\uD83E\uDD16 Hemen basla: @Hype_Mining_Bot`
      );
    }
  } catch(e) { console.error("Hos geldin hatasi:", e.message); }
});

// YARISMA LIDERLIGI
bot.callbackQuery("yaris_liderlik", async (ctx) => {
  const db = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from.first_name);
  await ctx.answerCallbackQuery();
  if (!YARIS_AKTIF) {
    await ctx.reply(t(user, "Yarisma henuz aktif degil.", "Competition not active yet."), { reply_markup: mainMenu(user) });
    return;
  }
  const eligible = Object.values(db.users).filter(u => u.has_deposited && (u.usdt_total_deposited || 0) >= YARIS_MIN_DEPOSIT);
  const sorted = eligible.map(u => ({ ...u, score: yarisSkoru(u, db) })).sort((a,b) => b.score - a.score).slice(0,10);
  let msg = t(user, "\uD83C\uDFC6 Yarisma Siralamasi\n\n", "\uD83C\uDFC6 Competition Leaderboard\n\n");
  msg += t(user, `Min. ${YARIS_MIN_DEPOSIT} USDT yatirim sarti\n\n`, `Min. ${YARIS_MIN_DEPOSIT} USDT deposit required\n\n`);
  sorted.forEach((u, i) => {
    const medal = i===0?"\uD83E\uDD47":i===1?"\uD83E\uDD48":i===2?"\uD83E\uDD49":`${i+1}.`;
    const odul = YARIS_ODULLER[i] ? ` -- ${YARIS_ODULLER[i]} USDT` : "";
    msg += `${medal} ${u.name} -- ${u.score} puan${odul}\n`;
  });
  const myScore = yarisSkoru(user, db);
  const myRank = sorted.findIndex(u => u.id === user.id) + 1;
  msg += t(user, `\n\uD83D\uDCCA Senin puanin: ${myScore}`, `\n\uD83D\uDCCA Your score: ${myScore}`);
  if (myRank > 0) msg += t(user, ` (${myRank}. sira)`, ` (rank ${myRank})`);
  msg += t(user,
    `\n\nPuan sistemi:\n- Her referans: 10 puan\n- Her 1 USDT yatirim: 1 puan\n- Referansin 1 USDT yatirimi: 2 puan`,
    `\n\nScoring:\n- Each referral: 10 pts\n- Each 1 USDT deposit: 1 pt\n- Referral's 1 USDT deposit: 2 pts`
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
  await ctx.reply(t(user,
    `\uD83C\uDFC6 Yarisma Durumun\n\n\uD83D\uDCCA Puanin: ${myScore}\n\uD83C\uDFAF Siran: ${myRank > 0 ? myRank+". sira" : "Henuz katilmadin"}\n\n\uD83D\uDCA1 Min. ${YARIS_MIN_DEPOSIT} USDT yatirim sarti var`,
    `\uD83C\uDFC6 Your Competition Status\n\n\uD83D\uDCCA Score: ${myScore}\n\uD83C\uDFAF Rank: ${myRank > 0 ? "#"+myRank : "Not participating yet"}\n\n\uD83D\uDCA1 Min. ${YARIS_MIN_DEPOSIT} USDT deposit required`
  ), { reply_markup: mainMenu(user) });
});

bot.command("kampanya", async (ctx) => {
  const db = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from.first_name);
  const totalUsers = Object.keys(db.users).length;
  const kalan = KAMPANYA_MAX_USERS - totalUsers;
  await ctx.reply(t(user,
    `\uD83D\uDE80 Lansman Kampanyasi!\n\n\u2705 Min. ${KAMPANYA_MIN_DEPOSIT} USDT yatirana 1 ay 2x madenci hizi!\n\uD83D\uDC65 Kalan kontenjan: ${kalan > 0 ? kalan : "DOLDU"} kisi\n\n${user.kampanya_2x ? "\u2705 Kampanyadan yararlaniyorsun!" : "\u274C Henuz kampanyadan yararlanmadin"}`,
    `\uD83D\uDE80 Launch Campaign!\n\n\u2705 Min. ${KAMPANYA_MIN_DEPOSIT} USDT deposit gets 2x miner speed for 1 month!\n\uD83D\uDC65 Remaining spots: ${kalan > 0 ? kalan : "FULL"}\n\n${user.kampanya_2x ? "\u2705 You're in the campaign!" : "\u274C Not in campaign yet"}`
  ), { reply_markup: mainMenu(user) });
});

bot.command("yarisbitir", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const db = loadDB();
  const eligible = Object.values(db.users).filter(u => (u.usdt_total_deposited||0) >= YARIS_MIN_DEPOSIT);
  const sorted = eligible.map(u => ({...u, score: yarisSkoru(u, db)})).sort((a,b) => b.score - a.score).slice(0,3);
  let msg = "\uD83C\uDFC6 Yarisma Sonuclari:\n\n";
  for (let i=0; i<sorted.length; i++) {
    const winner = sorted[i];
    const odul = YARIS_ODULLER[i];
    if (odul && db.users[winner.id]) {
      db.users[winner.id].usdt = parseFloat((db.users[winner.id].usdt + odul).toFixed(2));
      await bot.api.sendMessage(winner.id, `\uD83C\uDF89 Tebrikler! Yarismada ${i+1}. oldun! +${odul} USDT bakiyene eklendi!`).catch(()=>{});
    }
    msg += `${i+1}. ${winner.name} -- ${winner.score} puan -- ${odul} USDT odul\n`;
  }
  saveDB(db);
  await ctx.reply(msg);
});

bot.catch((err) => console.error("Bot hatasi:", err.message));

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
