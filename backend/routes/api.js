import express from "express";
import { db } from "../db.js";
import {
  getUserOrCreate,
  claimMining,
  recordAdView,
  completeTask,
  getReferralStats,
} from "../services/userService.js";
import { validateTelegramWebApp } from "../middleware/telegramAuth.js";

const router = express.Router();

router.use(validateTelegramWebApp);

router.get("/user", async (req, res) => {
  try {
    const { telegram_id } = req.telegramUser;

    const result = await db.query(
      `SELECT u.*,
              COUNT(r.id) as referral_count,
              COALESCE(
                (SELECT COUNT(*) FROM ad_views
                 WHERE user_id = u.telegram_id
                 AND viewed_at::date = CURRENT_DATE), 0
              ) as ads_today
       FROM users u
       LEFT JOIN referrals r ON r.referrer_id = u.telegram_id
       WHERE u.telegram_id = $1
       GROUP BY u.id`,
      [telegram_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    const user = result.rows[0];
    const now = new Date();
    const lastClaim = new Date(user.last_claim_at);
    const diffHours = (now - lastClaim) / (1000 * 60 * 60);
    const cappedHours = Math.min(diffHours, 12);
    let rate = parseFloat(user.mining_rate);
    if (user.is_premium && new Date(user.premium_expires_at) > now) rate *= 3;
    const pendingCoins = parseFloat((cappedHours * rate).toFixed(4));

    res.json({
      ...user,
      pending_coins: pendingCoins,
      can_claim: diffHours >= 0.5,
      next_claim_in: diffHours < 0.5 ? Math.ceil((0.5 - diffHours) * 60) : 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.post("/mine/claim", async (req, res) => {
  try {
    const { telegram_id } = req.telegramUser;
    const result = await claimMining(telegram_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ad/watch", async (req, res) => {
  try {
    const { telegram_id } = req.telegramUser;
    const result = await recordAdView(telegram_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const { telegram_id } = req.telegramUser;

    const result = await db.query(
      `SELECT t.*,
              CASE WHEN ut.id IS NOT NULL THEN true ELSE false END as completed
       FROM tasks t
       LEFT JOIN user_tasks ut ON ut.task_id = t.id AND ut.user_id = $1
       WHERE t.is_active = true
       ORDER BY t.reward DESC`,
      [telegram_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tasks/:id/complete", async (req, res) => {
  try {
    const { telegram_id } = req.telegramUser;
    const taskId = parseInt(req.params.id);
    const result = await completeTask(telegram_id, taskId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/referrals", async (req, res) => {
  try {
    const { telegram_id } = req.telegramUser;
    const stats = await getReferralStats(telegram_id);
    const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=${telegram_id}`;

    const list = await db.query(
      `SELECT u.first_name, u.username, r.created_at
       FROM referrals r
       JOIN users u ON u.telegram_id = r.referred_id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [telegram_id]
    );

    res.json({ ...stats, referralLink, list: list.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT telegram_id, first_name, username, total_earned, level, is_premium
       FROM users
       ORDER BY total_earned DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/premium/invoice", async (req, res) => {
  try {
    const { telegram_id } = req.telegramUser;
    const { sendPremiumInvoice } = await import("../services/paymentService.js");
    await sendPremiumInvoice(telegram_id);
    res.json({ success: true, message: "Ödeme bağlantısı Telegram'a gönderildi" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
