import { db } from "../db.js";

export async function getUserOrCreate({ telegramId, username, firstName, lastName, referredBy }) {
  const existing = await db.query(
    `SELECT * FROM users WHERE telegram_id = $1`,
    [telegramId]
  );

  if (existing.rows.length > 0) {
    return { ...existing.rows[0], isNew: false };
  }

  const result = await db.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, referred_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [telegramId, username, firstName, lastName, referredBy]
  );

  await db.query(
    `INSERT INTO transactions (user_id, amount, type, description)
     VALUES ($1, 100, 'bonus', 'Kayıt bonusu')`,
    [telegramId]
  );

  return { ...result.rows[0], isNew: true };
}

export async function claimMining(telegramId) {
  const userRes = await db.query(
    `SELECT * FROM users WHERE telegram_id = $1`,
    [telegramId]
  );

  const user = userRes.rows[0];
  if (!user) throw new Error("Kullanıcı bulunamadı");

  const now = new Date();
  const lastClaim = new Date(user.last_claim_at);
  const diffHours = (now - lastClaim) / (1000 * 60 * 60);
  const cappedHours = Math.min(diffHours, 12);

  if (cappedHours < 0.5) {
    return {
      success: false,
      message: "Henüz claim zamanı gelmedi",
      remainingMinutes: Math.ceil((0.5 - diffHours) * 60)
    };
  }

  let rate = parseFloat(user.mining_rate);
  if (user.is_premium && new Date(user.premium_expires_at) > now) {
    rate *= 3;
  }

  const earned = parseFloat((cappedHours * rate).toFixed(4));

  await db.query(
    `UPDATE users
     SET coins = coins + $1,
         total_earned = total_earned + $1,
         last_claim_at = NOW(),
         updated_at = NOW()
     WHERE telegram_id = $2`,
    [earned, telegramId]
  );

  await db.query(
    `INSERT INTO transactions (user_id, amount, type, description)
     VALUES ($1, $2, 'mine', $3)`,
    [telegramId, earned, `${cappedHours.toFixed(1)} saat madencilik`]
  );

  await checkLevelUp(telegramId);

  return { success: true, earned, hours: cappedHours.toFixed(1) };
}

export async function recordAdView(telegramId) {
  const today = new Date().toISOString().split("T")[0];

  const countRes = await db.query(
    `SELECT COUNT(*) FROM ad_views
     WHERE user_id = $1 AND viewed_at::date = $2`,
    [telegramId, today]
  );

  const count = parseInt(countRes.rows[0].count);
  if (count >= 10) {
    return { success: false, message: "Bugünlük reklam limitine ulaştın (10/10)" };
  }

  const reward = 50;

  await db.query(
    `INSERT INTO ad_views (user_id, reward) VALUES ($1, $2)`,
    [telegramId, reward]
  );

  await db.query(
    `UPDATE users SET coins = coins + $1, total_earned = total_earned + $1 WHERE telegram_id = $2`,
    [reward, telegramId]
  );

  await db.query(
    `INSERT INTO transactions (user_id, amount, type, description)
     VALUES ($1, $2, 'ad', 'Reklam izleme bonusu')`,
    [telegramId, reward]
  );

  return { success: true, reward, remaining: 10 - count - 1 };
}

export async function completeTask(telegramId, taskId) {
  const existing = await db.query(
    `SELECT id FROM user_tasks WHERE user_id = $1 AND task_id = $2`,
    [telegramId, taskId]
  );

  if (existing.rows.length > 0) {
    return { success: false, message: "Bu görevi zaten tamamladın" };
  }

  const taskRes = await db.query(
    `SELECT * FROM tasks WHERE id = $1 AND is_active = true`,
    [taskId]
  );

  const task = taskRes.rows[0];
  if (!task) return { success: false, message: "Görev bulunamadı" };

  await db.query(
    `INSERT INTO user_tasks (user_id, task_id) VALUES ($1, $2)`,
    [telegramId, taskId]
  );

  await db.query(
    `UPDATE users SET coins = coins + $1, total_earned = total_earned + $1 WHERE telegram_id = $2`,
    [task.reward, telegramId]
  );

  await db.query(
    `INSERT INTO transactions (user_id, amount, type, description)
     VALUES ($1, $2, 'task', $3)`,
    [telegramId, task.reward, `Görev: ${task.title}`]
  );

  return { success: true, reward: task.reward, taskTitle: task.title };
}

export async function getReferralStats(telegramId) {
  const result = await db.query(
    `SELECT
       COUNT(r.id) as referral_count,
       COALESCE(SUM(500), 0) as referral_earnings,
       u.coins as total_coins
     FROM users u
     LEFT JOIN referrals r ON r.referrer_id = u.telegram_id
     WHERE u.telegram_id = $1
     GROUP BY u.coins`,
    [telegramId]
  );

  const row = result.rows[0] || { referral_count: 0, referral_earnings: 0, total_coins: 0 };
  return {
    referralCount: parseInt(row.referral_count),
    referralEarnings: parseInt(row.referral_earnings),
    totalCoins: parseFloat(row.total_coins),
  };
}

async function checkLevelUp(telegramId) {
  const res = await db.query(
    `SELECT total_earned, level FROM users WHERE telegram_id = $1`,
    [telegramId]
  );
  const { total_earned, level } = res.rows[0];

  const thresholds = [0, 1000, 5000, 15000, 40000, 100000, 250000, 500000, 1000000];
  const newLevel = thresholds.filter(t => total_earned >= t).length;

  if (newLevel > level) {
    const newRate = 1.0 + (newLevel - 1) * 0.5;
    await db.query(
      `UPDATE users SET level = $1, mining_rate = $2 WHERE telegram_id = $3`,
      [newLevel, newRate, telegramId]
    );
  }
}
