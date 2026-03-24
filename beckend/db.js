import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      telegram_id     VARCHAR(50) UNIQUE NOT NULL,
      username        VARCHAR(100),
      first_name      VARCHAR(100),
      last_name       VARCHAR(100),
      coins           DECIMAL(20, 4) DEFAULT 100,
      total_earned    DECIMAL(20, 4) DEFAULT 100,
      level           INT DEFAULT 1,
      mining_rate     DECIMAL(10, 4) DEFAULT 1.0,
      last_claim_at   TIMESTAMP DEFAULT NOW(),
      is_premium      BOOLEAN DEFAULT false,
      premium_expires_at TIMESTAMP,
      referred_by     VARCHAR(50),
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id              SERIAL PRIMARY KEY,
      referrer_id     VARCHAR(50) NOT NULL,
      referred_id     VARCHAR(50) NOT NULL,
      bonus_paid      BOOLEAN DEFAULT false,
      created_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE(referrer_id, referred_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id              SERIAL PRIMARY KEY,
      title           VARCHAR(200) NOT NULL,
      description     TEXT,
      reward          INT NOT NULL,
      task_type       VARCHAR(50) NOT NULL,
      target_value    VARCHAR(200),
      is_active       BOOLEAN DEFAULT true,
      created_at      TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_tasks (
      id              SERIAL PRIMARY KEY,
      user_id         VARCHAR(50) NOT NULL,
      task_id         INT NOT NULL REFERENCES tasks(id),
      completed_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS ad_views (
      id              SERIAL PRIMARY KEY,
      user_id         VARCHAR(50) NOT NULL,
      reward          INT DEFAULT 50,
      viewed_at       TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id              SERIAL PRIMARY KEY,
      user_id         VARCHAR(50) NOT NULL,
      amount          DECIMAL(20, 4) NOT NULL,
      type            VARCHAR(50) NOT NULL,
      description     VARCHAR(200),
      created_at      TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    INSERT INTO tasks (title, description, reward, task_type, target_value)
    VALUES
      ('Telegram Kanalına Katıl', 'Resmi kanalımıza katılarak 200 COIN kazan', 200, 'telegram_join', 'https://t.me/your_channel'),
      ('Twitter''ı Takip Et', 'Twitter hesabımızı takip ederek 150 COIN kazan', 150, 'twitter_follow', 'https://twitter.com/your_account'),
      ('3 Arkadaş Davet Et', '3 arkadaşını davet ederek 1000 COIN kazan', 1000, 'invite', '3'),
      ('İlk Reklam İzle', 'İlk reklamını izleyerek 100 COIN kazan', 100, 'watch_ad', '1')
    ON CONFLICT DO NOTHING;
  `);

  console.log("✅ Veritabanı hazır.");
}
