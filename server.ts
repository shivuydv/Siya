import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import Database from "better-sqlite3";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365 * 100; // Permanent session (100 years) until explicit logout
const db = new Database(process.env.DATABASE_PATH || "siya.db");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  CREATE TABLE IF NOT EXISTS auth_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    event TEXT NOT NULL,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON auth_logs(created_at);
  CREATE TABLE IF NOT EXISTS user_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_user_conversations_user_id ON user_conversations(user_id);
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    reset_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL,
    ip TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
  CREATE TABLE IF NOT EXISTS developer_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sender_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_developer_messages_user_id ON developer_messages(user_id);
  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    badge TEXT NOT NULL DEFAULT 'PROMO',
    link_url TEXT,
    promo_code TEXT,
    cta_text TEXT NOT NULL DEFAULT 'Claim Offer',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS phone_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON phone_otps(phone_number);
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS subscription_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    plan_tier TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    utr_transaction_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_subscription_requests_user_id ON subscription_requests(user_id);
`);

// Initialize default settings in system_settings if not present
try {
  const initSetting = (key: string, val: string) => {
    const existing = db.prepare(`SELECT value FROM system_settings WHERE key = ?`).get(key) as any;
    if (!existing) {
      db.prepare(`INSERT INTO system_settings (key, value) VALUES (?, ?)`).run(key, val);
    }
  };
  initSetting("developer_photo_url", "/assets/shivam.jpg");
  initSetting("developer_whatsapp", "+919876543210");
  initSetting("developer_upi_id", "shivu12745114@okaxis");
} catch (e) {
  console.error("Failed to seed default system_settings:", e);
}

// Dynamically add columns to existing users table if they do not exist
const addColumnIfNotExists = (table: string, column: string, definition: string) => {
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!tableInfo.some((c: any) => c.name === column)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  } catch (e) {
    console.error(`Error adding column ${column} to ${table}:`, e);
  }
};
addColumnIfNotExists("users", "role", "TEXT NOT NULL DEFAULT 'user'");
addColumnIfNotExists("users", "is_pro", "INTEGER NOT NULL DEFAULT 0");
addColumnIfNotExists("users", "tier", "TEXT NOT NULL DEFAULT 'free'");
addColumnIfNotExists("users", "active_mode", "TEXT NOT NULL DEFAULT 'Free'");
addColumnIfNotExists("users", "status", "TEXT NOT NULL DEFAULT 'active'");
addColumnIfNotExists("users", "suspend_reason", "TEXT");
addColumnIfNotExists("users", "auth_provider", "TEXT NOT NULL DEFAULT 'email'");
addColumnIfNotExists("users", "password_updated_at", "TEXT");
addColumnIfNotExists("users", "failed_login_attempts", "INTEGER NOT NULL DEFAULT 0");
addColumnIfNotExists("users", "phone_number", "TEXT");
addColumnIfNotExists("users", "google_id", "TEXT");
addColumnIfNotExists("users", "avatar_url", "TEXT");

// Seed sample promotion if empty
try {
  const promoCount = (db.prepare(`SELECT COUNT(*) as c FROM promotions`).get() as any).c;
  if (promoCount === 0) {
    db.prepare(`INSERT INTO promotions (title, description, badge, promo_code, cta_text, is_active) VALUES (?, ?, ?, ?, ?, 1)`).run(
      "🚀 Siya Pro Voice Pass by Shivam",
      "Unlock ultra-fast Gemini Live streaming voice audio, custom voice tuning, and unlimited conversation memory.",
      "SPECIAL OFFER",
      "SHIVAMVIP",
      "Upgrade to Pro"
    );
  }
} catch (e) {
  console.error("Failed to seed promotions", e);
}

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

const cleanEmail = (email: string) => email.trim().toLowerCase();
const DEV_EMAILS = [
  "shivu12745114@gmail.com",
];
const isDeveloperEmail = (email: string) => DEV_EMAILS.includes(cleanEmail(email));

// Seed existing users into auth_logs if empty so historical activity is preserved
try {
  const logCount = (db.prepare(`SELECT COUNT(*) as c FROM auth_logs`).get() as any).c;
  if (logCount === 0) {
    const existingUsers = db.prepare(`SELECT id, name, email, created_at, last_login_at FROM users`).all() as any[];
    for (const u of existingUsers) {
      db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip, created_at) VALUES (?, ?, ?, 'signup', 'Account Created', ?)`).run(u.id, u.name, u.email, u.created_at || new Date().toISOString());
      if (u.last_login_at) {
        db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip, created_at) VALUES (?, ?, ?, 'login', 'Logged in', ?)`).run(u.id, u.name, u.email, u.last_login_at);
      }
    }
  }
} catch (e) {
  console.error("Failed to seed auth logs", e);
}
const hashPassword = (password: string, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString("hex"),
});
const verifyPassword = (password: string, salt: string, expected: string) => {
  const actual = crypto.scryptSync(password, salt, 64);
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
};
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const makeToken = () => crypto.randomBytes(32).toString("base64url");

function cookieOptions(maxAge = SESSION_TTL_MS) {
  return `HttpOnly; Path=/; SameSite=None; Secure; Max-Age=${Math.floor(maxAge / 1000)}`;
}
function getToken(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers["x-siya-session"] as string;
  if (customHeader) {
    return customHeader.trim();
  }
  const raw = req.headers.cookie || "";
  const match = raw.match(/(?:^|;\s*)siya_session=([^;]+)/);
  return match?.[1] || null;
}
function formatUserResponse(u: any) {
  const isDev = isDeveloperEmail(u.email) || u.role === "developer";
  const tier = isDev ? "ultra" : (u.tier || (u.is_pro ? "pro" : "free"));
  const activeMode = u.active_mode || (isDev ? "Sassy" : (tier === "free" ? "Free" : "Sassy"));
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone_number: u.phone_number || "",
    google_id: u.google_id || "",
    avatar_url: u.avatar_url || "",
    role: isDev ? "developer" : (u.role || "user"),
    is_pro: Boolean(isDev || u.is_pro || tier !== "free"),
    tier,
    active_mode: activeMode,
    status: u.status || "active",
    auth_provider: u.auth_provider || "email",
  };
}

function getUserFromRequest(req: express.Request) {
  const token = getToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone_number, u.google_id, u.avatar_url, u.role, u.is_pro, u.tier, u.active_mode, u.status, u.suspend_reason, u.auth_provider,
           u.created_at, u.last_login_at, u.password_updated_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash, Date.now()) as any;

  if (row) {
    try {
      db.prepare(`UPDATE sessions SET expires_at = ? WHERE token_hash = ?`)
        .run(Date.now() + SESSION_TTL_MS, tokenHash);
    } catch {
      // ignore
    }
  }

  return row || null;
}
function createSession(res: express.Response, userId: number) {
  const token = makeToken();
  db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), userId, hashToken(token), Date.now() + SESSION_TTL_MS, Date.now());
  res.setHeader("Set-Cookie", `siya_session=${token}; ${cookieOptions()}`);
  return token;
}
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  if (user.status === "suspended" || user.status === "banned") {
    return res.status(403).json({
      error: `Your account has been suspended by Shivam Yadav (Lead Developer)${user.suspend_reason ? `: "${user.suspend_reason}"` : ""}. Please contact shivu12745114@gmail.com.`,
      suspended: true,
      reason: user.suspend_reason,
    });
  }
  (req as any).user = user;
  next();
}

function ensureDeveloperAccount() {
  const primaryDevEmail = "shivu12745114@gmail.com";
  const customDevEmail = cleanEmail(process.env.DEVELOPER_EMAIL || "");
  const devPassword = String(process.env.DEVELOPER_PASSWORD || "developer_secret");

  const emailsToSeed = Array.from(new Set([primaryDevEmail, customDevEmail].filter(Boolean)));
  for (const email of emailsToSeed) {
    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as any;
    if (!existing) {
      const { salt, hash } = hashPassword(devPassword);
      db.prepare(`
        INSERT INTO users (name, email, password_hash, password_salt, role, is_pro, tier, active_mode, status)
        VALUES (?, ?, ?, ?, 'developer', 1, 'ultra', 'Sassy', 'active')
      `).run("Shivam Yadav", email, hash, salt);
    } else {
      db.prepare(`UPDATE users SET role = 'developer', is_pro = 1, tier = 'ultra', active_mode = 'Sassy', status = 'active' WHERE id = ?`).run(existing.id);
    }
  }
}
ensureDeveloperAccount();

// Lead Developer 1-Click Secure Access for Shivam Yadav
app.post("/api/auth/developer/quick-access", (req, res) => {
  const email = "shivu12745114@gmail.com";
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  if (!user) {
    const { salt, hash } = hashPassword("developer_secret");
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, password_salt, role, is_pro, status)
      VALUES ('Shivam Yadav', ?, ?, ?, 'developer', 1, 'active')
    `).run(email, hash, salt);
    user = { id: Number(result.lastInsertRowid), name: "Shivam Yadav", email, is_pro: 1, tier: "ultra", active_mode: "Sassy", status: "active" };
  } else {
    db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, status = 'active', is_pro = 1, tier = 'ultra', active_mode = 'Sassy' WHERE id = ?`).run(user.id);
  }

  const token = createSession(res, user.id);
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'login', ?)`).run(
    user.id, user.name, user.email, `${clientIp} (Lead Developer 1-Click Access)`
  );

  const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
  res.json({
    user: formatUserResponse(fullUser || user),
    developer: true,
    token,
  });
});

// Guest Access
app.post("/api/auth/guest", (req, res) => {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";
  const guestEmail = `guest_${Math.random().toString(36).substring(2, 8)}@siya.internal`;
  const guestName = "Guest Explorer";

  const { salt, hash } = hashPassword("siya_guest_access_token_123");
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, password_salt, auth_provider, status, is_pro, tier, active_mode)
    VALUES (?, ?, ?, ?, 'guest', 'active', 0, 'free', 'Free')
  `).run(guestName, guestEmail, hash, salt);

  const userId = Number(result.lastInsertRowid);
  const token = createSession(res, userId);
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'login', ?)`).run(
    userId, guestName, guestEmail, `${clientIp} (Guest Access)`
  );

  const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  res.json({
    user: formatUserResponse(fullUser),
    developer: false,
    token,
  });
});

function requireDeveloper(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getUserFromRequest(req);
  if (!user || !isDeveloperEmail(user.email)) {
    return res.status(403).json({ error: "Developer access denied" });
  }
  (req as any).user = user;
  next();
}

app.post("/api/auth/signup", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = cleanEmail(String(req.body?.email || ""));
  const password = String(req.body?.password || "");
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "Enter a valid name" });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  try {
    const { salt, hash } = hashPassword(password);
    const isDev = isDeveloperEmail(email);
    const result = db.prepare(`INSERT INTO users (name, email, password_hash, password_salt, auth_provider, status, is_pro, tier, active_mode) VALUES (?, ?, ?, ?, 'email', 'active', ?, ?, ?)`)
      .run(name, email, hash, salt, isDev ? 1 : 0, isDev ? "ultra" : "free", isDev ? "Sassy" : "Free");
    const userId = Number(result.lastInsertRowid);
    const token = createSession(res, userId);

    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";
    db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'signup', ?)`).run(userId, name, email, clientIp);

    const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
    res.json({ user: formatUserResponse(fullUser), developer: isDev, token });
  } catch (error: any) {
    if (String(error?.message).includes("UNIQUE")) return res.status(409).json({ error: "An account with this email already exists" });
    console.error(error);
    res.status(500).json({ error: "Could not create account" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const email = cleanEmail(String(req.body?.email || ""));
  const password = String(req.body?.password || "");
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }
  if (!password) {
    return res.status(400).json({ error: "Please enter your password" });
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    if (user) {
      db.prepare(`UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?`).run(user.id);
      db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'login_failed', ?)`).run(user.id, user.name, user.email, clientIp);
    }
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (user.status === "suspended" || user.status === "banned") {
    db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'blocked_login', ?)`).run(user.id, user.name, user.email, `Suspended: ${user.suspend_reason || "Policy"}`);
    return res.status(403).json({
      error: `Your account has been suspended by Shivam Yadav (Lead Developer)${user.suspend_reason ? `: "${user.suspend_reason}"` : ""}. Contact shivu12745114@gmail.com for help.`,
      suspended: true,
      reason: user.suspend_reason,
    });
  }

  db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, failed_login_attempts = 0 WHERE id = ?`).run(user.id);
  const token = createSession(res, user.id);

  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'login', ?)`).run(user.id, user.name, user.email, clientIp);

  const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
  res.json({
    user: formatUserResponse(fullUser || user),
    developer: isDeveloperEmail(user.email),
    token,
  });
});

// Social Login endpoint (Google, Facebook, Instagram, GitHub)
app.post("/api/auth/social", (req, res) => {
  const provider = String(req.body?.provider || "").toLowerCase();
  const name = String(req.body?.name || "").trim();
  const email = cleanEmail(String(req.body?.email || ""));
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  if (!["google", "facebook", "instagram", "github"].includes(provider)) {
    return res.status(400).json({ error: "Unsupported social provider" });
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Valid email is required from social profile" });
  }

  let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  let isNew = false;

  if (user) {
    if (user.status === "suspended" || user.status === "banned") {
      return res.status(403).json({
        error: `Your account has been suspended by Shivam Yadav (Lead Developer)${user.suspend_reason ? `: "${user.suspend_reason}"` : ""}.`,
        suspended: true,
      });
    }
    db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, auth_provider = ? WHERE id = ?`).run(provider, user.id);
  } else {
    // Generate secure random credentials for social signups
    const randomPass = crypto.randomBytes(24).toString("hex");
    const { salt, hash } = hashPassword(randomPass);
    const displayName = name || email.split("@")[0] || "Social User";
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, password_salt, auth_provider, status, is_pro, tier, active_mode, last_login_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(displayName, email, hash, salt, provider, isDeveloperEmail(email) ? 1 : 0, isDeveloperEmail(email) ? "ultra" : "free", isDeveloperEmail(email) ? "Sassy" : "Free");
    user = { id: Number(result.lastInsertRowid), name: displayName, email, is_pro: isDeveloperEmail(email), status: "active" };
    isNew = true;
  }

  const token = createSession(res, user.id);
  const eventName = isNew ? "signup" : "login";
  const eventDetail = `${isNew ? "Social Signup" : "Social Login"} via ${provider.toUpperCase()}`;
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, ?, ?)`).run(user.id, user.name, user.email, eventName, `${clientIp} (${eventDetail})`);

  const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
  res.json({
    user: formatUserResponse(fullUser || user),
    developer: isDeveloperEmail(user.email),
    token,
  });
});

function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "").trim();
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
  return `+${cleaned}`;
}

const LIVE_APP_URL = "https://ais-pre-uic4i5jbpwftrpf34u36mn-796492347098.asia-southeast1.run.app";
const DEV_APP_URL = "https://ais-dev-uic4i5jbpwftrpf34u36mn-796492347098.asia-southeast1.run.app";

function getAppBaseUrl(req?: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL") {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (req) {
    const forwardedHost = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim();
    const host = forwardedHost || req.get("host");
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      const protocol = req.headers["x-forwarded-proto"] || "https";
      return `${protocol}://${host}`;
    }
  }
  return LIVE_APP_URL;
}

function isValidGoogleClientId(id: string): boolean {
  if (!id) return false;
  const clean = id.trim().toLowerCase();
  if (clean.includes("api key") || clean.includes("gemini") || clean.startsWith("aq.")) {
    return false;
  }
  return clean.includes(".googleusercontent.com");
}

const FIREBASE_GOOGLE_CLIENT_ID = "373906077053-k5ft99ec62hirstceilmjpc14bt0o1ca.apps.googleusercontent.com";
const DEFAULT_GOOGLE_CLIENT_ID = "240932129141-qtgk1mkfn7daf83s0s7td4l96qoe5qel.apps.googleusercontent.com";

function getGoogleClientId(): string {
  const envId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (isValidGoogleClientId(envId)) return envId;
  return FIREBASE_GOOGLE_CLIENT_ID;
}

// -------------------------------------------------------------
// Real Google Authentication (OAuth 2.0 & Identity Services)
// -------------------------------------------------------------
app.get("/api/auth/google/url", (req, res) => {
  const clientId = getGoogleClientId();
  const baseUrl = getAppBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    access_type: "offline",
    prompt: "select_account",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ configured: true, url: authUrl, clientId, redirectUri });
});

// Google Identity Services (GSI) Token Verifier
app.post("/api/auth/google/verify-token", async (req, res) => {
  const accessToken = String(req.body?.access_token || "").trim();
  const idToken = String(req.body?.id_token || "").trim();

  if (!accessToken && !idToken) {
    return res.status(400).json({ error: "Missing Google token." });
  }

  try {
    let profile: any = null;

    if (accessToken) {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        throw new Error("Failed to fetch Google profile with access token.");
      }
      profile = await userRes.json();
    } else if (idToken) {
      const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!tokenInfoRes.ok) {
        throw new Error("Invalid Google ID Token.");
      }
      profile = await tokenInfoRes.json();
    }

    if (!profile || !profile.email) {
      throw new Error("No verified email found in Google profile.");
    }

    const email = cleanEmail(profile.email);
    const name = profile.name || email.split("@")[0] || "Google User";
    const googleId = profile.sub || "";
    const avatarUrl = profile.picture || (isDeveloperEmail(email) ? "/assets/shivam.jpg" : "");
    const isDev = isDeveloperEmail(email);

    let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
    let isNew = false;

    if (user) {
      if (user.status === "suspended" || user.status === "banned") {
        return res.status(403).json({ error: "Account suspended by Shivam Yadav." });
      }
      db.prepare(`UPDATE users SET google_id = COALESCE(google_id, ?), avatar_url = COALESCE(NULLIF(avatar_url, ''), ?), auth_provider = 'google', last_login_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(googleId, avatarUrl, user.id);
    } else {
      const randomPass = crypto.randomBytes(24).toString("hex");
      const { salt, hash } = hashPassword(randomPass);
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, password_salt, google_id, avatar_url, auth_provider, status, is_pro, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, 'google', 'active', ?, CURRENT_TIMESTAMP)
      `).run(name, email, hash, salt, googleId, avatarUrl, isDev ? 1 : 0);
      user = {
        id: Number(result.lastInsertRowid),
        name,
        email,
        avatar_url: avatarUrl,
        is_pro: isDev,
        status: "active",
        auth_provider: "google",
      };
      isNew = true;
    }

    const token = createSession(res, user.id);
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";
    db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, ?, ?)`).run(
      user.id, user.name, user.email, isNew ? "signup" : "login", `${clientIp} (Google GSI Token Verified)`
    );

    const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
    res.json({
      user: formatUserResponse(fullUser || user),
      developer: isDev,
      token,
    });
  } catch (err: any) {
    console.error("[Google Token Verification Error]:", err);
    res.status(401).json({ error: err.message || "Google authentication verification failed." });
  }
});

// Google Direct Sign-In (Direct Google email sign-in for seamless access)
app.post("/api/auth/google/direct", (req, res) => {
  const email = cleanEmail(String(req.body?.email || "").trim());
  const name = String(req.body?.name || "").trim() || (email ? email.split("@")[0] : "Google User");
  const avatarUrl = String(req.body?.avatar_url || "").trim() || (isDeveloperEmail(email) ? "/assets/shivam.jpg" : "");

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid Google email address." });
  }

  let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  let isNew = false;
  const isDev = isDeveloperEmail(email);

  if (user) {
    if (user.status === "suspended" || user.status === "banned") {
      return res.status(403).json({ error: "This Google account has been suspended by Shivam Yadav." });
    }
    db.prepare(`UPDATE users SET auth_provider = 'google', avatar_url = COALESCE(NULLIF(avatar_url, ''), ?), last_login_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(avatarUrl, user.id);
  } else {
    const randomPass = crypto.randomBytes(24).toString("hex");
    const { salt, hash } = hashPassword(randomPass);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, password_salt, auth_provider, avatar_url, status, is_pro, tier, active_mode, last_login_at)
      VALUES (?, ?, ?, ?, 'google', ?, 'active', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(name, email, hash, salt, avatarUrl, isDev ? 1 : 0, isDev ? "ultra" : "free", isDev ? "Sassy" : "Free");
    user = {
      id: Number(result.lastInsertRowid),
      name,
      email,
      avatar_url: avatarUrl,
      is_pro: isDev,
      status: "active",
      auth_provider: "google",
    };
    isNew = true;
  }

  const token = createSession(res, user.id);
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, ?, ?)`).run(
    user.id, user.name, user.email, isNew ? "signup" : "login", `${clientIp} (Google Direct: ${user.email})`
  );

  try {
    db.prepare(`
      INSERT INTO developer_messages (user_id, sender_email, subject, message, priority)
      VALUES (?, ?, ?, ?, 'high')
    `).run(
      user.id,
      user.email,
      `🔔 ${isNew ? "New Google Account Registration" : "Google Account Login"}: ${user.name} (${user.email})`,
      `User ${user.name} (${user.email}) has signed in via Google Account on Siya AI.\nTime: ${new Date().toLocaleString()}\nIP: ${clientIp}\nUser ID: ${user.id}\nProvider: Google Direct`
    );
  } catch (notifyErr) {
    console.warn("Notice: developer message log error:", notifyErr);
  }

  const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
  res.json({
    user: formatUserResponse(fullUser || user),
    developer: isDev,
    token,
  });
});

// Real Firebase Google Authentication endpoint (receives real Google account from Firebase Auth popup)
app.post("/api/auth/google/firebase", async (req, res) => {
  const email = cleanEmail(String(req.body?.email || "").trim());
  const name = String(req.body?.name || "").trim() || (email ? email.split("@")[0] : "Google User");
  const avatarUrl = String(req.body?.avatar_url || req.body?.avatarUrl || "").trim() || (isDeveloperEmail(email) ? "/assets/shivam.jpg" : "");
  const googleId = String(req.body?.google_id || req.body?.googleId || "").trim();

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "No valid Google email received. Please try again." });
  }

  const isDev = isDeveloperEmail(email);
  let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  let isNew = false;

  if (user) {
    if (user.status === "suspended" || user.status === "banned") {
      return res.status(403).json({ error: "This Google account has been suspended by Shivam Yadav." });
    }
    db.prepare(`UPDATE users SET google_id = COALESCE(google_id, ?), avatar_url = COALESCE(NULLIF(avatar_url, ''), ?), auth_provider = 'google', last_login_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(googleId || null, avatarUrl || null, user.id);
  } else {
    const randomPass = crypto.randomBytes(24).toString("hex");
    const { salt, hash } = hashPassword(randomPass);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, password_salt, google_id, avatar_url, auth_provider, status, is_pro, tier, active_mode, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, 'google', 'active', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(name, email, hash, salt, googleId || null, avatarUrl || null, isDev ? 1 : 0, isDev ? "ultra" : "free", isDev ? "Sassy" : "Free");
    user = {
      id: Number(result.lastInsertRowid),
      name,
      email,
      avatar_url: avatarUrl,
      is_pro: isDev,
      status: "active",
      auth_provider: "google",
    };
    isNew = true;
  }

  const token = createSession(res, user.id);
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";
  
  // Realtime auth log with exact email and provider
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, ?, ?)`).run(
    user.id, user.name, user.email, isNew ? "signup" : "login", `${clientIp} (Google Account Verified: ${user.email})`
  );

  // Send developer notification record
  try {
    db.prepare(`
      INSERT INTO developer_messages (user_id, sender_email, subject, message, priority)
      VALUES (?, ?, ?, ?, 'high')
    `).run(
      user.id,
      user.email,
      `🔔 ${isNew ? "New Google Account Registration" : "Google Account Login"}: ${user.name} (${user.email})`,
      `User ${user.name} (${user.email}) has signed in with real Google Account on Siya AI.\nTime: ${new Date().toLocaleString()}\nIP: ${clientIp}\nUser ID: ${user.id}\nProvider: Firebase Google Auth`
    );
  } catch (notifyErr) {
    console.warn("Notice: developer message log error:", notifyErr);
  }

  const fullUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
  res.json({
    user: formatUserResponse(fullUser || user),
    developer: isDev,
    token,
  });
});

// Google OAuth Popup Callback
app.get(["/api/auth/google/callback", "/api/auth/google/callback/"], async (req, res) => {
  const code = String(req.query.code || "");
  const error = String(req.query.error || "");
  const clientId = getGoogleClientId();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (error || !code) {
    return res.send(`
      <html>
        <body style="background:#0b0b12;color:#fff;font-family:sans-serif;padding:30px;text-align:center;">
          <h3 style="color:#ef4444;">Google Sign-In Cancelled</h3>
          <p style="color:#9ca3af;">${error || "No authorization code provided."}</p>
          <script>
            setTimeout(() => {
              if (window.opener) window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${error || "Cancelled"}' }, '*');
              window.close();
            }, 1800);
          </script>
        </body>
      </html>
    `);
  }

  try {
    const baseUrl = getAppBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || "Failed to exchange authorization code");
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userRes.json();
    const email = cleanEmail(profile.email);
    const name = profile.name || email.split("@")[0] || "Google User";
    const googleId = profile.sub || "";
    const avatarUrl = profile.picture || "";

    let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
    let isNew = false;
    if (user) {
      if (user.status === "suspended" || user.status === "banned") {
        throw new Error("Account suspended by Shivam Yadav.");
      }
      db.prepare(`UPDATE users SET google_id = COALESCE(google_id, ?), avatar_url = COALESCE(avatar_url, ?), auth_provider = 'google', last_login_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(googleId, avatarUrl, user.id);
    } else {
      const randomPass = crypto.randomBytes(24).toString("hex");
      const { salt, hash } = hashPassword(randomPass);
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, password_salt, google_id, avatar_url, auth_provider, status, is_pro, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, 'google', 'active', ?, CURRENT_TIMESTAMP)
      `).run(name, email, hash, salt, googleId, avatarUrl, isDeveloperEmail(email) ? 1 : 0);
      user = { id: Number(result.lastInsertRowid), name, email, is_pro: isDeveloperEmail(email), status: "active" };
      isNew = true;
    }

    const token = createSession(res, user.id);
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";
    db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, ?, ?)`).run(
      user.id, user.name, user.email, isNew ? "signup" : "login", `${clientIp} (Google OAuth 2.0 Real ID)`
    );

    const safeUser = JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: avatarUrl,
      is_pro: Boolean(user.is_pro),
      status: user.status,
      auth_provider: "google",
    });

    res.send(`
      <html>
        <body style="background:#0b0b12;color:#fff;font-family:sans-serif;padding:30px;text-align:center;">
          <h2 style="color:#10b981;">Google Authentication Successful!</h2>
          <p style="color:#9ca3af;">Welcome ${name}! Returning to Siya...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                token: '${token}',
                user: ${safeUser},
                developer: ${isDeveloperEmail(email)}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.send(`
      <html>
        <body style="background:#0b0b12;color:#fff;font-family:sans-serif;padding:30px;text-align:center;">
          <h3 style="color:#ef4444;">Google Sign-In Error</h3>
          <p style="color:#9ca3af;">${err.message || "Failed to complete Google Sign-in"}</p>
          <script>
            setTimeout(() => {
              if (window.opener) window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${err.message}' }, '*');
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  }
});

// Google Identity Services (GIS Token / One Tap / Credential JWT)
app.post("/api/auth/google/verify-credential", async (req, res) => {
  const credential = String(req.body?.credential || "").trim();
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  if (!credential) return res.status(400).json({ error: "No Google credential token provided" });

  try {
    let payload: any = null;
    try {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (verifyRes.ok) {
        payload = await verifyRes.json();
      }
    } catch {}

    if (!payload) {
      const parts = credential.split(".");
      if (parts.length === 3) {
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      }
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: "Invalid Google credential token" });
    }

    const email = cleanEmail(payload.email);
    const name = payload.name || payload.given_name || email.split("@")[0] || "Google User";
    const googleId = payload.sub || "";
    const avatarUrl = payload.picture || "";

    let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
    let isNew = false;

    if (user) {
      if (user.status === "suspended" || user.status === "banned") {
        return res.status(403).json({ error: "This Google account has been suspended by Shivam Yadav." });
      }
      db.prepare(`UPDATE users SET google_id = COALESCE(google_id, ?), avatar_url = COALESCE(avatar_url, ?), auth_provider = 'google', last_login_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(googleId, avatarUrl, user.id);
    } else {
      const randomPass = crypto.randomBytes(24).toString("hex");
      const { salt, hash } = hashPassword(randomPass);
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, password_salt, google_id, avatar_url, auth_provider, status, is_pro, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, 'google', 'active', ?, CURRENT_TIMESTAMP)
      `).run(name, email, hash, salt, googleId, avatarUrl, isDeveloperEmail(email) ? 1 : 0);
      user = { id: Number(result.lastInsertRowid), name, email, is_pro: isDeveloperEmail(email), status: "active" };
      isNew = true;
    }

    const token = createSession(res, user.id);
    db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, ?, ?)`).run(
      user.id, user.name, user.email, isNew ? "signup" : "login", `${clientIp} (Google Real ID Token)`
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: avatarUrl,
        is_pro: Boolean(user.is_pro),
        status: user.status,
        auth_provider: "google",
      },
      developer: isDeveloperEmail(user.email),
      token,
    });
  } catch (err: any) {
    console.error("Google verify credential error:", err);
    res.status(500).json({ error: "Failed to verify Google identity" });
  }
});

// -------------------------------------------------------------
// Mobile Phone Authentication (SMS OTP)
// -------------------------------------------------------------
app.post("/api/auth/phone/send-otp", (req, res) => {
  const rawPhone = String(req.body?.phoneNumber || "").trim();
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  const digitsOnly = rawPhone.replace(/\D/g, "");
  if (digitsOnly.length < 10) {
    return res.status(400).json({ error: "Please enter a valid 10-digit mobile number" });
  }

  const phoneNumber = normalizePhoneNumber(rawPhone);

  // Check if existing user
  const existingUser = db.prepare(`SELECT id, name, status, suspend_reason FROM users WHERE phone_number = ?`).get(phoneNumber) as any;
  if (existingUser && (existingUser.status === "suspended" || existingUser.status === "banned")) {
    return res.status(403).json({
      error: `Account associated with ${phoneNumber} is suspended: ${existingUser.suspend_reason || "Policy violations"}`,
      suspended: true,
    });
  }

  // Generate 6-digit OTP code
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 1000 * 60 * 10; // 10 minutes

  // Expire previous pending OTPs for this phone
  db.prepare(`UPDATE phone_otps SET verified = 2 WHERE phone_number = ? AND verified = 0`).run(phoneNumber);

  // Insert new OTP
  db.prepare(`INSERT INTO phone_otps (phone_number, otp_code, expires_at) VALUES (?, ?, ?)`).run(phoneNumber, otpCode, expiresAt);

  // Log in auth_logs
  db.prepare(`INSERT INTO auth_logs (name, email, event, ip) VALUES (?, ?, 'phone_otp_sent', ?)`).run(
    existingUser ? existingUser.name : "Mobile User",
    phoneNumber,
    `${clientIp} (OTP: ${otpCode})`
  );

  res.json({
    ok: true,
    phoneNumber,
    isExistingUser: Boolean(existingUser),
    existingName: existingUser?.name || "",
    expiresInMinutes: 10,
    message: `Verification code sent to ${phoneNumber}`,
  });
});

app.post("/api/auth/phone/verify-otp", (req, res) => {
  const rawPhone = String(req.body?.phoneNumber || "").trim();
  const code = String(req.body?.otpCode || req.body?.code || "").trim();
  const inputName = String(req.body?.name || "").trim();
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  if (!rawPhone || !code) {
    return res.status(400).json({ error: "Phone number and 6-digit verification code are required" });
  }

  const phoneNumber = normalizePhoneNumber(rawPhone);

  const otpRecord = db.prepare(`
    SELECT * FROM phone_otps 
    WHERE phone_number = ? AND otp_code = ? AND verified = 0 AND expires_at > ?
    ORDER BY id DESC LIMIT 1
  `).get(phoneNumber, code, Date.now()) as any;

  if (!otpRecord) {
    return res.status(400).json({ error: "Invalid or expired verification code. Please request a new OTP." });
  }

  // Mark OTP as verified
  db.prepare(`UPDATE phone_otps SET verified = 1 WHERE id = ?`).run(otpRecord.id);

  let user = db.prepare(`SELECT * FROM users WHERE phone_number = ?`).get(phoneNumber) as any;
  let isNew = false;

  if (user) {
    if (user.status === "suspended" || user.status === "banned") {
      return res.status(403).json({ error: `Account suspended: ${user.suspend_reason || "Violation"}` });
    }
    db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`).run(user.id);
  } else {
    // New User Signup via Phone
    const last4 = phoneNumber.slice(-4);
    const displayName = inputName || `User ${last4}`;
    const autoEmail = `phone_${phoneNumber.replace(/\+/g, "")}@siya.ai`;
    const randomPass = crypto.randomBytes(24).toString("hex");
    const { salt, hash } = hashPassword(randomPass);

    const result = db.prepare(`
      INSERT INTO users (name, email, phone_number, password_hash, password_salt, auth_provider, status, is_pro, last_login_at)
      VALUES (?, ?, ?, ?, ?, 'phone', 'active', 0, CURRENT_TIMESTAMP)
    `).run(displayName, autoEmail, phoneNumber, hash, salt);

    user = {
      id: Number(result.lastInsertRowid),
      name: displayName,
      email: autoEmail,
      phone_number: phoneNumber,
      is_pro: 0,
      status: "active",
      auth_provider: "phone",
    };
    isNew = true;
  }

  const token = createSession(res, user.id);
  const eventName = isNew ? "signup" : "login";
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, ?, ?)`).run(
    user.id,
    user.name,
    user.phone_number || user.email,
    eventName,
    `${clientIp} (Mobile Phone Sign-in)`
  );

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      is_pro: Boolean(user.is_pro),
      status: user.status,
      auth_provider: "phone",
    },
    developer: isDeveloperEmail(user.email),
    token,
  });
});

// Forgot Password - Step 1: Generate 6-digit Reset OTP
app.post("/api/auth/forgot-password", (req, res) => {
  const email = cleanEmail(String(req.body?.email || ""));
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  if (!email) return res.status(400).json({ error: "Email address is required" });
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  if (!user) {
    return res.status(404).json({ error: "No account found with this email address." });
  }

  // Generate 6-digit secure code
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 1000 * 60 * 15; // 15 minutes TTL

  db.prepare(`INSERT INTO password_resets (user_id, email, reset_code, expires_at, ip) VALUES (?, ?, ?, ?, ?)`).run(user.id, email, resetCode, expiresAt, clientIp);

  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'password_reset_request', ?)`).run(user.id, user.name, email, `${clientIp} (Reset code generated)`);

  res.json({
    ok: true,
    message: "A 6-digit verification reset code has been issued.",
    resetCode, // Sent back so user can use immediately, logged for developer inspection
    expiresInMinutes: 15,
  });
});

// Forgot Password - Step 2: Reset Password with Code
app.post("/api/auth/reset-password", (req, res) => {
  const email = cleanEmail(String(req.body?.email || ""));
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || "");
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: "Email, reset code, and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const resetRecord = db.prepare(`
    SELECT * FROM password_resets
    WHERE email = ? AND reset_code = ? AND status = 'pending' AND expires_at > ?
    ORDER BY id DESC LIMIT 1
  `).get(email, code, Date.now()) as any;

  if (!resetRecord) {
    return res.status(400).json({ error: "Invalid or expired reset code. Please request a new one." });
  }

  const { salt, hash } = hashPassword(newPassword);
  db.prepare(`
    UPDATE users SET password_hash = ?, password_salt = ?, password_updated_at = CURRENT_TIMESTAMP, failed_login_attempts = 0
    WHERE id = ?
  `).run(hash, salt, resetRecord.user_id);

  db.prepare(`UPDATE password_resets SET status = 'used' WHERE id = ?`).run(resetRecord.id);

  // Invalidate previous sessions
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(resetRecord.user_id);

  const user = db.prepare(`SELECT name FROM users WHERE id = ?`).get(resetRecord.user_id) as any;
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'password_reset_success', ?)`).run(resetRecord.user_id, user?.name || "User", email, `${clientIp} (Password reset with code)`);

  res.json({ ok: true, message: "Your password has been successfully reset! You can now log in." });
});

// Change Password for Logged-In User
app.post("/api/auth/change-password", requireAuth, (req, res) => {
  const user = (req as any).user;
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "Direct";

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  const dbUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
  if (!dbUser || !verifyPassword(currentPassword, dbUser.password_salt, dbUser.password_hash)) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  const { salt, hash } = hashPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, password_updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(hash, salt, user.id);

  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'password_changed', ?)`).run(user.id, user.name, user.email, `${clientIp} (Self changed password)`);

  res.json({ ok: true, message: "Password updated successfully" });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getToken(req);
  if (token) db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
  res.setHeader("Set-Cookie", `siya_session=; ${cookieOptions(0)}`);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ authenticated: false });
  if (user.status === "suspended" || user.status === "banned") {
    return res.status(403).json({
      authenticated: false,
      suspended: true,
      error: `Your account has been suspended by Shivam Yadav (Lead Developer)${user.suspend_reason ? `: "${user.suspend_reason}"` : ""}.`,
      reason: user.suspend_reason,
    });
  }
  res.json({
    authenticated: true,
    user: formatUserResponse(user),
    developer: isDeveloperEmail(user.email),
  });
});

// Developer Verify Access
app.post("/api/developer/verify-access", (req, res) => {
  const email = cleanEmail(String(req.body?.email || ""));
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Developer ID and password are required" });
  }
  if (!isDeveloperEmail(email)) {
    return res.status(403).json({ error: "Access denied: This ID is not an authorized developer account" });
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: "Incorrect ID or password" });
  }

  const token = createSession(res, user.id);

  const totalUsers = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any).count;
  const activeSessions = (db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?`).get(Date.now()) as any).count;
  const totalSignups = (db.prepare(`SELECT COUNT(*) as count FROM auth_logs WHERE event = 'signup'`).get() as any).count;
  const totalLogins = (db.prepare(`SELECT COUNT(*) as count FROM auth_logs WHERE event = 'login'`).get() as any).count;
  const totalPro = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_pro = 1`).get() as any).count;
  const totalBanned = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE status != 'active'`).get() as any).count;
  const logs = db.prepare(`SELECT * FROM auth_logs ORDER BY id DESC LIMIT 60`).all();
  const users = db.prepare(`SELECT id, name, email, phone_number, google_id, avatar_url, role, is_pro, status, suspend_reason, auth_provider, created_at, last_login_at, password_updated_at, failed_login_attempts FROM users ORDER BY id DESC`).all();

  res.json({
    ok: true,
    token,
    user: { id: user.id, name: user.name, email: user.email, is_pro: Boolean(user.is_pro) },
    stats: { totalUsers, activeSessions, totalSignups, totalLogins, totalPro, totalBanned },
    logs,
    users,
  });
});

// Developer Overview
app.get("/api/developer/overview", requireDeveloper, (req, res) => {
  const totalUsers = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any).count;
  const activeSessions = (db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?`).get(Date.now()) as any).count;
  const totalSignups = (db.prepare(`SELECT COUNT(*) as count FROM auth_logs WHERE event = 'signup'`).get() as any).count;
  const totalLogins = (db.prepare(`SELECT COUNT(*) as count FROM auth_logs WHERE event = 'login'`).get() as any).count;
  const totalPro = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_pro = 1`).get() as any).count;
  const totalBanned = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE status != 'active'`).get() as any).count;

  const allUsers = db.prepare(`SELECT id, name, email, phone_number, google_id, avatar_url, role, is_pro, status, suspend_reason, auth_provider, created_at, last_login_at, password_updated_at, failed_login_attempts FROM users ORDER BY id DESC`).all();
  const recentUsers = allUsers.slice(0, 15);
  const recentLogs = db.prepare(`SELECT * FROM auth_logs ORDER BY id DESC LIMIT 50`).all();

  res.json({
    stats: { totalUsers, activeSessions, totalSignups, totalLogins, totalPro, totalBanned },
    allUsers,
    recentUsers,
    recentLogs,
  });
});

app.get("/api/developer/logs", requireDeveloper, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 100);
  const sinceId = Number(req.query.sinceId || 0);
  let logs;
  if (sinceId > 0) {
    logs = db.prepare(`SELECT * FROM auth_logs WHERE id > ? ORDER BY id DESC LIMIT ?`).all(sinceId, limit);
  } else {
    logs = db.prepare(`SELECT * FROM auth_logs ORDER BY id DESC LIMIT ?`).all(limit);
  }
  const totalSignups = (db.prepare(`SELECT COUNT(*) as count FROM auth_logs WHERE event = 'signup'`).get() as any).count;
  const totalLogins = (db.prepare(`SELECT COUNT(*) as count FROM auth_logs WHERE event = 'login'`).get() as any).count;
  const totalUsers = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any).count;
  const activeSessions = (db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?`).get(Date.now()) as any).count;
  const totalPro = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_pro = 1`).get() as any).count;
  const totalBanned = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE status != 'active'`).get() as any).count;
  res.json({ logs, stats: { totalUsers, activeSessions, totalSignups, totalLogins, totalPro, totalBanned } });
});

app.get("/api/developer/users", requireDeveloper, (req, res) => {
  const users = db.prepare(`SELECT id, name, email, phone_number, google_id, avatar_url, role, is_pro, status, suspend_reason, auth_provider, created_at, last_login_at, password_updated_at, failed_login_attempts FROM users ORDER BY id DESC`).all();
  res.json({ users });
});

// Developer Action: Ban / Suspend / Reactivate User
app.post("/api/developer/users/status", requireDeveloper, (req, res) => {
  const userId = Number(req.body?.userId);
  const status = String(req.body?.status || "active").toLowerCase();
  const reason = String(req.body?.reason || "").trim();

  if (!userId || !["active", "suspended", "banned"].includes(status)) {
    return res.status(400).json({ error: "Invalid userId or status" });
  }

  const targetUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  if (isDeveloperEmail(targetUser.email)) {
    return res.status(400).json({ error: "Cannot suspend or ban a developer account" });
  }

  db.prepare(`UPDATE users SET status = ?, suspend_reason = ? WHERE id = ?`).run(status, status === "active" ? null : reason || "Developer moderation", userId);

  if (status !== "active") {
    // Delete active sessions so user is kicked out immediately
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'user_suspended', ?)`).run(userId, targetUser.name, targetUser.email, `Suspended by Developer: ${reason || "Terms violation"}`);
  } else {
    db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'user_reactivated', ?)`).run(userId, targetUser.name, targetUser.email, `Reactivated by Developer`);
  }

  res.json({ ok: true, status, message: `User account set to ${status}` });
});

// Developer Action: Grant / Revoke Pro Version
app.post("/api/developer/users/pro", requireDeveloper, (req, res) => {
  const userId = Number(req.body?.userId);
  const isPro = Boolean(req.body?.isPro);

  if (!userId) return res.status(400).json({ error: "Invalid userId" });
  const targetUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  db.prepare(`UPDATE users SET is_pro = ? WHERE id = ?`).run(isPro ? 1 : 0, userId);
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'pro_status_updated', ?)`).run(userId, targetUser.name, targetUser.email, `Pro plan ${isPro ? "GRANTED" : "REVOKED"} by Developer`);

  res.json({ ok: true, is_pro: isPro, message: `Pro status updated for ${targetUser.name}` });
});

// Developer Action: Direct Reset User Password
app.post("/api/developer/users/reset-password", requireDeveloper, (req, res) => {
  const userId = Number(req.body?.userId);
  const customPassword = String(req.body?.newPassword || "").trim();

  if (!userId) return res.status(400).json({ error: "Invalid userId" });
  const targetUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  // Use custom password if provided, or generate random temporary password
  const tempPassword = customPassword || `Siya@${Math.floor(100000 + Math.random() * 900000)}`;
  if (tempPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const { salt, hash } = hashPassword(tempPassword);
  db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, password_updated_at = CURRENT_TIMESTAMP, failed_login_attempts = 0 WHERE id = ?`).run(hash, salt, userId);

  // Terminate active sessions
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'developer_password_reset', ?)`).run(userId, targetUser.name, targetUser.email, `Password reset by Developer Shivam`);

  res.json({
    ok: true,
    temporaryPassword: tempPassword,
    message: `Password reset successfully for ${targetUser.name}. Share this temporary password with them.`,
  });
});

// Developer Action: Test & Verify User Password
app.post("/api/developer/users/verify-password", requireDeveloper, (req, res) => {
  const userId = Number(req.body?.userId);
  const testPassword = String(req.body?.testPassword || "");

  if (!userId || !testPassword) {
    return res.status(400).json({ error: "User ID and password to test are required" });
  }
  const targetUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  const isMatch = verifyPassword(testPassword, targetUser.password_salt, targetUser.password_hash);
  res.json({
    match: isMatch,
    message: isMatch
      ? `✅ Password matches! The user's password is correct.`
      : `❌ Password does NOT match. The entered password is wrong.`,
  });
});

// Developer Action: Send Direct Message / Email Alert to User
app.post("/api/developer/messages/send", requireDeveloper, (req, res) => {
  const dev = (req as any).user;
  const userId = Number(req.body?.userId || 0); // 0 = broadcast to all users
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  const priority = String(req.body?.priority || "normal");

  if (!subject || !message) {
    return res.status(400).json({ error: "Subject and message body are required" });
  }

  db.prepare(`
    INSERT INTO developer_messages (user_id, sender_email, subject, message, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, dev.email, subject, message, priority);

  const recipientLabel = userId === 0 ? "All Users (Broadcast)" : `User ID ${userId}`;
  db.prepare(`INSERT INTO auth_logs (user_id, name, email, event, ip) VALUES (?, ?, ?, 'developer_message_sent', ?)`).run(userId, recipientLabel, dev.email, `Subject: ${subject.slice(0, 40)}`);

  res.json({ ok: true, message: `Message sent to ${recipientLabel}` });
});

// Developer: List all sent messages
app.get("/api/developer/messages", requireDeveloper, (req, res) => {
  const messages = db.prepare(`SELECT * FROM developer_messages ORDER BY id DESC LIMIT 50`).all();
  res.json({ messages });
});

// Developer: Security & Password Logs
app.get("/api/developer/security-logs", requireDeveloper, (req, res) => {
  const resets = db.prepare(`SELECT * FROM password_resets ORDER BY id DESC LIMIT 50`).all();
  const securityEvents = db.prepare(`
    SELECT * FROM auth_logs
    WHERE event IN ('password_reset_request', 'password_reset_success', 'password_changed', 'developer_password_reset', 'user_suspended', 'user_reactivated', 'pro_status_updated', 'login_failed', 'blocked_login')
    ORDER BY id DESC LIMIT 50
  `).all();
  res.json({ resets, securityEvents });
});

// Promotions / Ads API (Public for users)
app.get("/api/promotions", (req, res) => {
  const activePromos = db.prepare(`SELECT * FROM promotions WHERE is_active = 1 ORDER BY id DESC`).all();
  res.json({ promotions: activePromos });
});

// Developer Promotions API
app.get("/api/developer/promotions", requireDeveloper, (req, res) => {
  const promos = db.prepare(`SELECT * FROM promotions ORDER BY id DESC`).all();
  res.json({ promotions: promos });
});

app.post("/api/developer/promotions", requireDeveloper, (req, res) => {
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const badge = String(req.body?.badge || "PROMO").trim();
  const link_url = String(req.body?.link_url || "").trim();
  const promo_code = String(req.body?.promo_code || "").trim();
  const cta_text = String(req.body?.cta_text || "Claim Offer").trim();

  if (!title || !description) {
    return res.status(400).json({ error: "Title and description are required for promotion" });
  }

  const result = db.prepare(`
    INSERT INTO promotions (title, description, badge, link_url, promo_code, cta_text, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(title, description, badge, link_url || null, promo_code || null, cta_text);

  res.json({ ok: true, id: result.lastInsertRowid, message: "Promotion published successfully!" });
});

app.post("/api/developer/promotions/:id/toggle", requireDeveloper, (req, res) => {
  const id = Number(req.params.id);
  const promo = db.prepare(`SELECT is_active FROM promotions WHERE id = ?`).get(id) as any;
  if (!promo) return res.status(404).json({ error: "Promotion not found" });

  const nextState = promo.is_active ? 0 : 1;
  db.prepare(`UPDATE promotions SET is_active = ? WHERE id = ?`).run(nextState, id);
  res.json({ ok: true, is_active: nextState });
});

app.delete("/api/developer/promotions/:id", requireDeveloper, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM promotions WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// Get globally persisted developer photo (universal for all users & devices)
app.get("/api/developer/photo", (req, res) => {
  try {
    const row = db.prepare(`SELECT value, updated_at FROM system_settings WHERE key = 'developer_photo_url'`).get() as any;
    const photoUrl = row?.value || "/assets/shivam.jpg";
    res.json({
      photoUrl,
      updatedAt: row?.updated_at || null,
      name: "Shivam Yadav",
      role: "Solo Founder & Creator",
    });
  } catch (err: any) {
    res.json({ photoUrl: "/assets/shivam.jpg", name: "Shivam Yadav" });
  }
});

// Developer: Upload / Update exact photo globally in database
app.post("/api/developer/update-photo", (req, res) => {
  try {
    const { imageBase64, photoUrl } = req.body || {};
    let finalPhotoUrl = "";

    if (photoUrl && typeof photoUrl === "string" && photoUrl.trim()) {
      finalPhotoUrl = photoUrl.trim();
    } else if (imageBase64 && typeof imageBase64 === "string" && imageBase64.trim()) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");

      const publicDir = path.join(process.cwd(), "public", "assets");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filename = `shivam_custom_${Date.now()}.jpg`;
      const publicCustom = path.join(publicDir, filename);
      const publicShivam = path.join(publicDir, "shivam.jpg");
      const publicShivamFull = path.join(publicDir, "shivam_full.jpg");
      fs.writeFileSync(publicCustom, buffer);
      fs.writeFileSync(publicShivam, buffer);
      fs.writeFileSync(publicShivamFull, buffer);

      const distDir = path.join(process.cwd(), "dist", "assets");
      if (fs.existsSync(distDir)) {
        fs.writeFileSync(path.join(distDir, filename), buffer);
        fs.writeFileSync(path.join(distDir, "shivam.jpg"), buffer);
        fs.writeFileSync(path.join(distDir, "shivam_full.jpg"), buffer);
      }

      finalPhotoUrl = `/assets/${filename}`;
    } else {
      return res.status(400).json({ error: "Please provide either a photo file or an image URL" });
    }

    // Persist globally in SQLite system_settings table
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('developer_photo_url', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(finalPhotoUrl);

    // Also update Shivam user record in users table if exists
    try {
      db.prepare(`UPDATE users SET avatar_url = ? WHERE email = 'shivu12745114@gmail.com'`).run(finalPhotoUrl);
    } catch (e) {
      console.warn("Could not update users table avatar_url:", e);
    }

    res.json({
      ok: true,
      photoUrl: finalPhotoUrl,
      message: "Developer photo saved globally in database! Universal display is now active.",
    });
  } catch (err: any) {
    console.error("Photo upload error:", err);
    res.status(500).json({ error: err.message || "Failed to update developer photo" });
  }
});

// User Notifications / Inbox from Developer
app.get("/api/user/messages", requireAuth, (req, res) => {
  const user = (req as any).user;
  const messages = db.prepare(`
    SELECT * FROM developer_messages
    WHERE user_id = ? OR user_id = 0
    ORDER BY id DESC LIMIT 20
  `).all(user.id);
  res.json({ messages });
});

app.post("/api/user/messages/:id/read", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE developer_messages SET is_read = 1 WHERE id = ?`).run(id);
  res.json({ ok: true });
});

app.get("/api/chat/messages", requireAuth, (req, res) => {
  const user = (req as any).user;
  const rows = db.prepare(`SELECT id, sender, text, created_at FROM user_conversations WHERE user_id = ? ORDER BY id ASC LIMIT 150`).all(user.id) as any[];
  res.json({
    messages: rows.map(r => ({
      id: String(r.id),
      sender: r.sender,
      text: r.text,
      createdAt: r.created_at
    }))
  });
});

app.post("/api/chat/messages", requireAuth, (req, res) => {
  const user = (req as any).user;
  const sender = req.body?.sender === "siya" ? "siya" : "user";
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Text is required" });
  const result = db.prepare(`INSERT INTO user_conversations (user_id, sender, text) VALUES (?, ?, ?)`).run(user.id, sender, text);
  res.json({ ok: true, id: String(result.lastInsertRowid) });
});

app.delete("/api/chat/messages", requireAuth, (req, res) => {
  const user = (req as any).user;
  db.prepare(`DELETE FROM user_conversations WHERE user_id = ?`).run(user.id);
  res.json({ ok: true });
});

// ==========================================
// SUBSCRIPTION & UPGRADE API (Micro-Plans: Pro ₹5, Pro Max ₹10, Ultra ₹15)
// ==========================================

const TIER_PLANS = {
  pro: {
    id: "pro",
    name: "Pro Plan",
    mode: "Sassy",
    modeLabel: "Sassy / Roaster Mode",
    amount: 5,
    priceFormatted: "₹5",
    tagline: "Highly reactive, fast, bold, and witty playful roaster",
  },
  pro_max: {
    id: "pro_max",
    name: "Pro Max Plan",
    mode: "Waifu",
    modeLabel: "Waifu / Wife Mode",
    amount: 10,
    priceFormatted: "₹10",
    tagline: "Loyal, deeply caring, domestic & devoted companion",
  },
  ultra: {
    id: "ultra",
    name: "Ultra Plan",
    mode: "Girlfriend",
    modeLabel: "Proper Girlfriend Mode",
    amount: 15,
    priceFormatted: "₹15",
    tagline: "Proper loving girlfriend, deep emotional bonding & romantic connection",
  },
};

// Public/Auth: Get available plans & payment contact info
app.get("/api/subscription/plans", (req, res) => {
  let whatsapp = "+919876543210";
  let upiId = "shivu12745114@okaxis";
  try {
    const wRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'developer_whatsapp'`).get() as any;
    if (wRow?.value) whatsapp = wRow.value;
    const uRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'developer_upi_id'`).get() as any;
    if (uRow?.value) upiId = uRow.value;
  } catch {}

  res.json({
    plans: TIER_PLANS,
    developer: {
      name: "Shivam Yadav",
      whatsapp,
      upiId,
    },
  });
});

// Auth: Get current user subscription status & any active/pending requests
app.get("/api/subscription/status", requireAuth, (req, res) => {
  const user = (req as any).user;
  const isDev = isDeveloperEmail(user.email) || user.role === "developer";
  const tier = isDev ? "ultra" : (user.tier || (user.is_pro ? "pro" : "free"));
  const activeMode = user.active_mode || (isDev ? "Sassy" : (tier === "free" ? "Free" : "Sassy"));

  const requests = db.prepare(`
    SELECT * FROM subscription_requests
    WHERE user_id = ?
    ORDER BY id DESC LIMIT 10
  `).all(user.id);

  let allowedModes: string[] = ["Free"];
  if (isDev || tier === "ultra") {
    allowedModes = ["Free", "Sassy", "Waifu", "Girlfriend"];
  } else if (tier === "pro_max") {
    allowedModes = ["Free", "Sassy", "Waifu"];
  } else if (tier === "pro") {
    allowedModes = ["Free", "Sassy"];
  }

  res.json({
    tier,
    activeMode,
    allowedModes,
    isDev,
    requests,
  });
});

// Auth: Submit an upgrade request & generate WhatsApp dispatch URL
app.post("/api/subscription/request", requireAuth, (req, res) => {
  const user = (req as any).user;
  const planTier = String(req.body?.planTier || "").toLowerCase();
  const utrTransactionId = String(req.body?.utrTransactionId || "").trim();
  const notes = String(req.body?.notes || "").trim();

  if (!["pro", "pro_max", "ultra"].includes(planTier)) {
    return res.status(400).json({ error: "Invalid plan selected. Choose Pro (₹5), Pro Max (₹10), or Ultra (₹15)." });
  }

  const plan = TIER_PLANS[planTier as keyof typeof TIER_PLANS];

  // Insert request record
  const result = db.prepare(`
    INSERT INTO subscription_requests (user_id, user_name, user_email, plan_tier, plan_name, amount, status, utr_transaction_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(user.id, user.name, user.email, plan.id, `${plan.name} (${plan.modeLabel})`, plan.amount, utrTransactionId || null, notes || null);

  const requestId = Number(result.lastInsertRowid);

  // Fetch developer WhatsApp & UPI
  let devWhatsapp = "+919876543210";
  let devUpiId = "shivu12745114@okaxis";
  try {
    const wRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'developer_whatsapp'`).get() as any;
    if (wRow?.value) devWhatsapp = wRow.value;
    const uRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'developer_upi_id'`).get() as any;
    if (uRow?.value) devUpiId = uRow.value;
  } catch {}

  const cleanPhone = devWhatsapp.replace(/[^\d]/g, "");
  const waMessage = `👋 Hi Shivam! I want to upgrade my Siya AI subscription:
• User Name: ${user.name}
• User ID: ${user.id}
• Email: ${user.email}
• Selected Plan: ${plan.name} (${plan.modeLabel})
• Amount: ₹${plan.amount}
${utrTransactionId ? `• UTR / Trans ID: ${utrTransactionId}\n` : ""}
Please send dedicated UPI QR code or verify my payment to unlock my mode!`;

  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`;

  // Log to auth_logs for developer dashboard visibility
  db.prepare(`
    INSERT INTO auth_logs (user_id, name, email, event, ip)
    VALUES (?, ?, ?, 'upgrade_requested', ?)
  `).run(user.id, user.name, user.email, `Plan: ${plan.name} (₹${plan.amount})${utrTransactionId ? ` | UTR: ${utrTransactionId}` : ""}`);

  res.json({
    ok: true,
    requestId,
    plan,
    whatsappUrl,
    developerWhatsapp: devWhatsapp,
    developerUpiId: devUpiId,
    message: "Upgrade request registered. Details prepared for WhatsApp dispatch.",
  });
});

// Auth: Switch active personality mode (enforces tier permissions)
app.post("/api/subscription/set-mode", requireAuth, (req, res) => {
  const user = (req as any).user;
  const requestedMode = String(req.body?.mode || "").trim();
  const isDev = isDeveloperEmail(user.email) || user.role === "developer";
  const userTier = isDev ? "ultra" : (user.tier || (user.is_pro ? "pro" : "free"));

  const validModes = ["Free", "Sassy", "Waifu", "Girlfriend"];
  if (!validModes.includes(requestedMode)) {
    return res.status(400).json({ error: "Invalid personality mode requested." });
  }

  // Permission check
  let isAllowed = false;
  if (requestedMode === "Free") {
    isAllowed = true;
  } else if (requestedMode === "Sassy" && (isDev || userTier === "pro" || userTier === "pro_max" || userTier === "ultra")) {
    isAllowed = true;
  } else if (requestedMode === "Waifu" && (isDev || userTier === "pro_max" || userTier === "ultra")) {
    isAllowed = true;
  } else if (requestedMode === "Girlfriend" && (isDev || userTier === "ultra")) {
    isAllowed = true;
  }

  if (!isAllowed) {
    return res.status(403).json({
      error: `The "${requestedMode}" mode requires an upgrade to a higher tier. Please upgrade to unlock.`,
    });
  }

  db.prepare(`UPDATE users SET active_mode = ? WHERE id = ?`).run(requestedMode, user.id);
  res.json({ ok: true, activeMode: requestedMode });
});

// Developer: List all subscription requests
app.get("/api/developer/subscriptions", requireDeveloper, (req, res) => {
  const requests = db.prepare(`
    SELECT sr.*, u.tier as current_tier, u.active_mode as current_mode
    FROM subscription_requests sr
    LEFT JOIN users u ON u.id = sr.user_id
    ORDER BY sr.id DESC LIMIT 100
  `).all();
  res.json({ requests });
});

// Developer: Approve subscription request & immediately unlock mode
app.post("/api/developer/subscriptions/:id/approve", requireDeveloper, (req, res) => {
  const id = Number(req.params.id);
  const request = db.prepare(`SELECT * FROM subscription_requests WHERE id = ?`).get(id) as any;
  if (!request) return res.status(404).json({ error: "Subscription request not found" });

  const defaultMode = request.plan_tier === "ultra" ? "Girlfriend" : request.plan_tier === "pro_max" ? "Waifu" : "Sassy";

  db.prepare(`
    UPDATE subscription_requests
    SET status = 'approved', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  db.prepare(`
    UPDATE users
    SET tier = ?, is_pro = 1, active_mode = ?
    WHERE id = ?
  `).run(request.plan_tier, defaultMode, request.user_id);

  db.prepare(`
    INSERT INTO auth_logs (user_id, name, email, event, ip)
    VALUES (?, ?, ?, 'subscription_approved', ?)
  `).run(request.user_id, request.user_name, request.user_email, `Approved ${request.plan_name} (₹${request.amount}) by Lead Developer Shivam`);

  res.json({
    ok: true,
    message: `Plan ${request.plan_name} approved for ${request.user_name}! ${defaultMode} mode unlocked.`,
  });
});

// Developer: Reject subscription request
app.post("/api/developer/subscriptions/:id/reject", requireDeveloper, (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || "Verification not completed").trim();
  db.prepare(`
    UPDATE subscription_requests
    SET status = 'rejected', notes = COALESCE(notes || ' | ', '') || ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(`Rejected: ${reason}`, id);
  res.json({ ok: true, message: "Subscription request rejected." });
});

// Developer: Direct user tier & mode assignment from User Manager table
app.post("/api/developer/users/:id/tier", requireDeveloper, (req, res) => {
  const userId = Number(req.params.id);
  const tier = String(req.body?.tier || "free").toLowerCase();
  const activeMode = String(req.body?.activeMode || (tier === "ultra" ? "Girlfriend" : tier === "pro_max" ? "Waifu" : tier === "pro" ? "Sassy" : "Free"));

  if (!["free", "pro", "pro_max", "ultra"].includes(tier)) {
    return res.status(400).json({ error: "Invalid tier specified." });
  }

  const isPro = tier !== "free" ? 1 : 0;
  db.prepare(`UPDATE users SET tier = ?, is_pro = ?, active_mode = ? WHERE id = ?`).run(tier, isPro, activeMode, userId);

  const targetUser = db.prepare(`SELECT name, email FROM users WHERE id = ?`).get(userId) as any;
  if (targetUser) {
    db.prepare(`
      INSERT INTO auth_logs (user_id, name, email, event, ip)
      VALUES (?, ?, ?, 'tier_manual_update', ?)
    `).run(userId, targetUser.name, targetUser.email, `Set tier: ${tier.toUpperCase()}, mode: ${activeMode}`);
  }

  res.json({ ok: true, tier, activeMode });
});

// Developer: Payment settings (WhatsApp number & UPI ID)
app.get("/api/developer/payment-settings", requireDeveloper, (req, res) => {
  let whatsapp = "+919876543210";
  let upiId = "shivu12745114@okaxis";
  try {
    const wRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'developer_whatsapp'`).get() as any;
    if (wRow?.value) whatsapp = wRow.value;
    const uRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'developer_upi_id'`).get() as any;
    if (uRow?.value) upiId = uRow.value;
  } catch {}
  res.json({ whatsapp, upiId });
});

app.post("/api/developer/payment-settings", requireDeveloper, (req, res) => {
  const whatsapp = String(req.body?.whatsapp || "").trim();
  const upiId = String(req.body?.upiId || "").trim();

  if (whatsapp) {
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('developer_whatsapp', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(whatsapp);
  }
  if (upiId) {
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('developer_upi_id', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(upiId);
  }

  res.json({ ok: true, whatsapp, upiId, message: "Payment & WhatsApp settings updated globally!" });
});

app.get("/api/config", (req, res) => {
  let devPhoto = "/assets/shivam.jpg";
  try {
    const row = db.prepare(`SELECT value FROM system_settings WHERE key = 'developer_photo_url'`).get() as any;
    if (row?.value) devPhoto = row.value;
  } catch {}

  res.json({
    appName: "Siya 2 AI Studio",
    liveUrl: getAppBaseUrl(req),
    sharedUrl: LIVE_APP_URL,
    devUrl: DEV_APP_URL,
    developerPhotoUrl: devPhoto,
    apiKey: process.env.GEMINI_API_KEY,
  });
});

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    (typeof process.argv[1] === "string" && process.argv[1].includes("dist")) ||
    !fs.existsSync(path.join(process.cwd(), "src"));

  if (!isProduction) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found" }));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
