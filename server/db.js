import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate.js';
import { initSettings } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'restaurant.db');
export const ORDER_RETENTION_DAYS = Number(process.env.ORDER_RETENTION_DAYS || 60);
export const IMAGES_DIR = path.join(DATA_DIR, 'images');
export const DATABASE_PATH = DB_PATH;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

await runMigrations(db);
initSettings(db);

export { db };

/* ── Menu: one-time seed from menu-seed.json when the tables are empty.
   menu-seed.json ships empty (see server/menu-seed.json) — the real menu is
   entered through the admin panel or the setup wizard import tool. ── */
function seedMenuIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (count > 0) return;

  const seedPath = path.join(__dirname, 'menu-seed.json');
  if (!fs.existsSync(seedPath)) return;
  const { CATS, ITEMS } = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  if (!Array.isArray(CATS) || CATS.length === 0) return;

  const insertCat = db.prepare('INSERT INTO categories (id, title, emoji, accent_color, img, cat_order) VALUES (?, ?, ?, ?, ?, ?)');
  const insertGroup = db.prepare('INSERT INTO menu_groups (category, sub, note, group_order) VALUES (?, ?, ?, ?)');
  const insertItem = db.prepare(`
    INSERT INTO menu_items (group_id, nr, name, desc, veg, allergens, sizes_json, prices_json, available, item_order)
    VALUES (@groupId, @nr, @name, @desc, @veg, @allergens, @sizesJson, @pricesJson, 1, @itemOrder)
  `);

  const seedAll = db.transaction(() => {
    CATS.forEach((cat, catIdx) => {
      insertCat.run(cat.id, cat.title, cat.emoji || '', cat.accentColor || '', cat.img || '', catIdx);
      (ITEMS[cat.id] || []).forEach((group, groupIdx) => {
        const groupId = insertGroup.run(cat.id, group.sub || '', group.note || '', groupIdx).lastInsertRowid;
        (group.list || []).forEach((item, itemIdx) => {
          insertItem.run({
            groupId,
            nr: String(item.nr ?? ''),
            name: item.name,
            desc: item.desc || '',
            veg: item.veg ? 1 : 0,
            allergens: item.allergens || '',
            sizesJson: item.sizes ? JSON.stringify(item.sizes) : null,
            pricesJson: JSON.stringify(item.sizes ? item.prices : [item.price]),
            itemOrder: itemIdx,
          });
        });
      });
    });
  });
  seedAll();
  console.log('[db] Menu seeded from menu-seed.json');
}
seedMenuIfEmpty();

/* Builds the nested {CATS, ITEMS} structure the storefront expects;
   unavailable items are hidden from the public menu. */
function buildMenuTree(includeUnavailable) {
  const cats = db.prepare('SELECT * FROM categories ORDER BY cat_order').all();
  const CATS = cats.map(c => ({ id: c.id, title: c.title, emoji: c.emoji, accentColor: c.accent_color, img: c.img }));

  const ITEMS = {};
  for (const cat of cats) {
    const groups = db.prepare('SELECT * FROM menu_groups WHERE category = ? ORDER BY group_order').all(cat.id);
    ITEMS[cat.id] = groups.map(g => {
      const rows = db.prepare('SELECT * FROM menu_items WHERE group_id = ? AND deleted = 0 ORDER BY item_order').all(g.id);
      const list = rows
        .filter(r => includeUnavailable || r.available)
        .map(r => {
          const sizes = r.sizes_json ? JSON.parse(r.sizes_json) : null;
          const prices = JSON.parse(r.prices_json);
          const base = { id: r.id, nr: r.nr, name: r.name, desc: r.desc, allergens: r.allergens, available: !!r.available };
          if (r.veg) base.veg = true;
          if (sizes) { base.sizes = sizes; base.prices = prices; } else { base.price = prices[0]; }
          return base;
        });
      return { sub: g.sub, note: g.note, list };
    }).filter(g => g.list.length > 0 || includeUnavailable);
  }
  return { CATS, ITEMS };
}

export function getPublicMenu() {
  return buildMenuTree(false);
}
export function getAdminMenu() {
  return buildMenuTree(true);
}

export function updateMenuItem(id, { prices, available, name, desc }) {
  const row = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!row) return false;
  const sizes = row.sizes_json ? JSON.parse(row.sizes_json) : null;
  const expectedLen = sizes ? sizes.length : 1;
  const nextPrices = Array.isArray(prices) && prices.length === expectedLen ? prices : JSON.parse(row.prices_json);
  db.prepare('UPDATE menu_items SET prices_json = ?, available = ?, name = ?, desc = ? WHERE id = ?')
    .run(JSON.stringify(nextPrices), available ? 1 : 0, name || row.name, desc ?? row.desc, id);
  return true;
}

/* Soft-delete: hidden from menu/admin but not physically removed, so past
   orders that reference this item stay intact. */
export function deleteMenuItem(id) {
  const result = db.prepare('UPDATE menu_items SET deleted = 1 WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getTrashedItems() {
  return db.prepare(`
    SELECT mi.id, mi.nr, mi.name, mi.prices_json, mg.category, mg.sub AS group_sub, c.title AS category_title
    FROM menu_items mi
    JOIN menu_groups mg ON mg.id = mi.group_id
    JOIN categories c ON c.id = mg.category
    WHERE mi.deleted = 1
    ORDER BY mi.id DESC
  `).all().map(r => ({ ...r, prices: JSON.parse(r.prices_json), prices_json: undefined }));
}

export function restoreMenuItem(id) {
  const result = db.prepare('UPDATE menu_items SET deleted = 0 WHERE id = ?').run(id);
  return result.changes > 0;
}

export function permanentlyDeleteMenuItem(id) {
  const result = db.prepare('DELETE FROM menu_items WHERE id = ? AND deleted = 1').run(id);
  return result.changes > 0;
}

export function updateCategoryImage(id, imgPath) {
  const result = db.prepare('UPDATE categories SET img = ? WHERE id = ?').run(imgPath, id);
  return result.changes > 0;
}

export function getCategories() {
  return db.prepare('SELECT id, title, img FROM categories ORDER BY cat_order').all();
}

export function upsertCategory({ id, title, emoji, accentColor, img, order }) {
  const exists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);
  if (exists) {
    db.prepare('UPDATE categories SET title = ?, emoji = ?, accent_color = ?, img = COALESCE(?, img), cat_order = ? WHERE id = ?')
      .run(title, emoji || '', accentColor || '', img || null, order ?? 0, id);
  } else {
    db.prepare('INSERT INTO categories (id, title, emoji, accent_color, img, cat_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, title, emoji || '', accentColor || '', img || '', order ?? 0);
  }
  return true;
}

export function deleteCategory(id) {
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getGroupsForCategory(category) {
  return db.prepare('SELECT id, sub FROM menu_groups WHERE category = ? ORDER BY group_order').all(category);
}

export function addMenuItem({ category, groupId, newGroupSub, nr, name, desc, sizes, prices }) {
  const catExists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(category);
  if (!catExists) return { ok: false, error: 'Category not found' };
  if (!name || !Array.isArray(prices) || prices.length === 0) {
    return { ok: false, error: 'Name and at least one price are required' };
  }

  let resolvedGroupId = groupId;
  if (!resolvedGroupId) {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(group_order), -1) AS m FROM menu_groups WHERE category = ?').get(category).m;
    resolvedGroupId = db.prepare('INSERT INTO menu_groups (category, sub, note, group_order) VALUES (?, ?, ?, ?)')
      .run(category, newGroupSub || '', '', maxOrder + 1).lastInsertRowid;
  } else {
    const group = db.prepare('SELECT * FROM menu_groups WHERE id = ? AND category = ?').get(resolvedGroupId, category);
    if (!group) return { ok: false, error: 'Group not found' };
  }

  const maxItemOrder = db.prepare('SELECT COALESCE(MAX(item_order), -1) AS m FROM menu_items WHERE group_id = ?').get(resolvedGroupId).m;
  const id = db.prepare(`
    INSERT INTO menu_items (group_id, nr, name, desc, veg, allergens, sizes_json, prices_json, available, item_order)
    VALUES (?, ?, ?, ?, 0, '', ?, ?, 1, ?)
  `).run(resolvedGroupId, nr || '', name, desc || '', sizes && sizes.length ? JSON.stringify(sizes) : null, JSON.stringify(prices), maxItemOrder + 1).lastInsertRowid;

  return { ok: true, id, groupId: resolvedGroupId };
}

/* ── Delivery zones ── */
export function getDeliveryZones(includeInactive = false) {
  const sql = includeInactive
    ? 'SELECT * FROM delivery_zones ORDER BY sort_order'
    : 'SELECT * FROM delivery_zones WHERE active = 1 ORDER BY sort_order';
  return db.prepare(sql).all();
}

export function upsertDeliveryZone({ id, name, fee, minOrder, active, sortOrder }) {
  if (id) {
    db.prepare('UPDATE delivery_zones SET name = ?, fee = ?, min_order = ?, active = ?, sort_order = ? WHERE id = ?')
      .run(name, fee, minOrder ?? null, active ? 1 : 0, sortOrder ?? 0, id);
    return id;
  }
  return db.prepare('INSERT INTO delivery_zones (name, fee, min_order, active, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(name, fee, minOrder ?? null, active ? 1 : 0, sortOrder ?? 0).lastInsertRowid;
}

export function deleteDeliveryZone(id) {
  return db.prepare('DELETE FROM delivery_zones WHERE id = ?').run(id).changes > 0;
}

/* ── Coupons ── */
export function getCoupons() {
  return db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
}

export function getCouponByCode(code) {
  return db.prepare('SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND active = 1').get(String(code || '').trim()) || null;
}

export function upsertCoupon({ id, code, type, value, active, usageLimit, minOrder, expiresAt }) {
  if (id) {
    db.prepare('UPDATE coupons SET code = ?, type = ?, value = ?, active = ?, usage_limit = ?, min_order = ?, expires_at = ? WHERE id = ?')
      .run(code, type, value, active ? 1 : 0, usageLimit ?? null, minOrder ?? null, expiresAt ?? null, id);
    return id;
  }
  return db.prepare(`
    INSERT INTO coupons (code, type, value, active, usage_limit, min_order, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(code, type, value, active ? 1 : 0, usageLimit ?? null, minOrder ?? null, expiresAt ?? null, new Date().toISOString()).lastInsertRowid;
}

export function deleteCoupon(id) {
  return db.prepare('DELETE FROM coupons WHERE id = ?').run(id).changes > 0;
}

export function incrementCouponUsage(code) {
  db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = UPPER(?)').run(code);
}

/* ── Extras / toppings ── */
export function getExtraGroups() {
  const groups = db.prepare('SELECT * FROM extra_groups ORDER BY id').all();
  return groups.map(g => ({
    ...g,
    extras: db.prepare('SELECT * FROM extras WHERE extra_group_id = ? ORDER BY sort_order').all(g.id),
  }));
}

export function upsertExtraGroup({ id, name, minSelect, maxSelect }) {
  if (id) {
    db.prepare('UPDATE extra_groups SET name = ?, min_select = ?, max_select = ? WHERE id = ?')
      .run(name, minSelect ?? 0, maxSelect ?? null, id);
    return id;
  }
  return db.prepare('INSERT INTO extra_groups (name, min_select, max_select) VALUES (?, ?, ?)')
    .run(name, minSelect ?? 0, maxSelect ?? null).lastInsertRowid;
}

export function upsertExtra({ id, extraGroupId, name, price, available, sortOrder }) {
  if (id) {
    db.prepare('UPDATE extras SET name = ?, price = ?, available = ?, sort_order = ? WHERE id = ?')
      .run(name, price, available ? 1 : 0, sortOrder ?? 0, id);
    return id;
  }
  return db.prepare('INSERT INTO extras (extra_group_id, name, price, available, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(extraGroupId, name, price, available ? 1 : 0, sortOrder ?? 0).lastInsertRowid;
}

/* ── GDPR-minimal customer list for the admin panel: only the fields needed
   to run the business (plus order numbers as a reference), never full order
   contents (items/prices/address). ── */
export function listCustomers() {
  return db.prepare(`
    SELECT
      c.phone, c.fname, c.lname, c.email, c.created_at, c.first_order_used, c.last_order_date,
      COUNT(o.id) AS order_count,
      GROUP_CONCAT(o.order_num, ', ') AS order_nums
    FROM customers c
    LEFT JOIN orders o ON o.phone = c.phone
    GROUP BY c.phone
    ORDER BY c.last_order_date DESC
  `).all();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

export function getCustomerByPhone(phone) {
  const n = normalizePhone(phone);
  if (!n) return null;
  return db.prepare('SELECT * FROM customers WHERE phone = ?').get(n) || null;
}

export function isFirstOrderEligible(phone) {
  const customer = getCustomerByPhone(phone);
  return !customer || !customer.first_order_used;
}

export function recordOrder({ orderNum, customer, mode, items, totals, payment, deliveryZoneId, couponCode, userId, firstOrderDiscountApplied }) {
  const n = normalizePhone(customer.phone);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO orders (order_num, user_id, phone, fname, lname, email, mode, address, delivery_zone_id, pickup_time, items_json, totals_json, coupon_code, payment, created_at)
    VALUES (@orderNum, @userId, @phone, @fname, @lname, @email, @mode, @address, @deliveryZoneId, @pickupTime, @itemsJson, @totalsJson, @couponCode, @payment, @createdAt)
  `).run({
    orderNum, userId: userId || null, phone: n, fname: customer.fname || '', lname: customer.lname || '', email: customer.email || '',
    mode, address: customer.address || '', deliveryZoneId: deliveryZoneId || null, pickupTime: customer.pickupTime || '',
    itemsJson: JSON.stringify(items || []), totalsJson: JSON.stringify(totals || {}), couponCode: couponCode || null,
    payment: payment || '', createdAt: now,
  });

  if (couponCode) incrementCouponUsage(couponCode);
  if (!n) return;
  const existing = getCustomerByPhone(n);
  if (existing) {
    db.prepare("UPDATE customers SET fname = ?, lname = ?, email = COALESCE(NULLIF(?, ''), email), last_order_date = ?, first_order_used = first_order_used OR ? WHERE phone = ?")
      .run(customer.fname || existing.fname, customer.lname || existing.lname, customer.email || '', now, firstOrderDiscountApplied ? 1 : 0, n);
  } else {
    db.prepare(`
      INSERT INTO customers (phone, fname, lname, email, user_id, created_at, first_order_used, last_order_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(n, customer.fname || '', customer.lname || '', customer.email || '', userId || null, now, firstOrderDiscountApplied ? 1 : 0, now);
  }
}

export function getOrdersForUser(userId) {
  return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    .map(r => ({ ...r, items: JSON.parse(r.items_json), totals: JSON.parse(r.totals_json) }));
}

export function cleanupOldOrders(retentionDays = ORDER_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM orders WHERE created_at < ?').run(cutoff);
  if (result.changes > 0) {
    console.log(`[db] Cleanup: removed ${result.changes} order(s) older than ${retentionDays} days`);
  }
  return result.changes;
}

/* ── Payment settings (PayPal, bank transfer). The PayPal secret is
   encrypted at rest with AES-256-GCM; the key is derived from ADMIN_SECRET
   and lives only in server process memory. The plaintext secret is never
   returned to the admin panel again after saving (status only). ── */
function getEncryptionKey() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ADMIN_SECRET not configured, cannot encrypt payment secrets');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptSecret(stored) {
  const buf = Buffer.from(stored, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function maskIban(iban) {
  if (!iban) return '';
  return iban.length > 8 ? iban.slice(0, 4) + ' •••• ' + iban.slice(-4) : iban;
}

export function getPaymentConfigStatus() {
  const row = db.prepare('SELECT * FROM payment_config WHERE id = 1').get();
  if (!row) return { paypalConfigured: false, paypalVerified: false, bankHolder: '', ibanMasked: '', bic: '' };
  return {
    paypalConfigured: !!(row.paypal_client_id && row.paypal_secret_enc),
    paypalVerified: !!row.paypal_verified,
    paypalError: row.paypal_last_error || '',
    paypalSolution: row.paypal_last_solution || '',
    paypalClientId: row.paypal_client_id || '',
    bankHolder: row.bank_holder || '',
    ibanMasked: maskIban(row.iban || ''),
    bic: row.bic || '',
    updatedAt: row.updated_at,
  };
}

export function getPaypalCredentials() {
  const row = db.prepare('SELECT * FROM payment_config WHERE id = 1').get();
  if (!row || !row.paypal_client_id || !row.paypal_secret_enc) return null;
  return { clientId: row.paypal_client_id, secret: decryptSecret(row.paypal_secret_enc) };
}

export function savePaymentConfig({ paypalClientId, paypalSecret, bankHolder, iban, bic, paypalVerified, paypalError, paypalSolution }) {
  const existing = db.prepare('SELECT * FROM payment_config WHERE id = 1').get();
  const paypalCredsChanged = paypalClientId !== undefined || paypalSecret !== undefined;
  const next = {
    paypal_client_id: paypalClientId || existing?.paypal_client_id || '',
    paypal_secret_enc: paypalSecret ? encryptSecret(paypalSecret) : (existing?.paypal_secret_enc || null),
    paypal_verified: paypalCredsChanged ? (paypalVerified ? 1 : 0) : (existing?.paypal_verified || 0),
    paypal_last_error: paypalCredsChanged ? (paypalError || '') : (existing?.paypal_last_error || ''),
    paypal_last_solution: paypalCredsChanged ? (paypalSolution || '') : (existing?.paypal_last_solution || ''),
    bank_holder: bankHolder ?? existing?.bank_holder ?? '',
    iban: iban ?? existing?.iban ?? '',
    bic: bic ?? existing?.bic ?? '',
    updated_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO payment_config (id, paypal_client_id, paypal_secret_enc, paypal_verified, paypal_last_error, paypal_last_solution, bank_holder, iban, bic, updated_at)
    VALUES (1, @paypal_client_id, @paypal_secret_enc, @paypal_verified, @paypal_last_error, @paypal_last_solution, @bank_holder, @iban, @bic, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      paypal_client_id = excluded.paypal_client_id,
      paypal_secret_enc = excluded.paypal_secret_enc,
      paypal_verified = excluded.paypal_verified,
      paypal_last_error = excluded.paypal_last_error,
      paypal_last_solution = excluded.paypal_last_solution,
      bank_holder = excluded.bank_holder,
      iban = excluded.iban,
      bic = excluded.bic,
      updated_at = excluded.updated_at
  `).run(next);
  return getPaymentConfigStatus();
}

/* Looks up a single order by order number (invoice lookup in the admin
   panel). Only orders still within the retention window are returned (see
   cleanupOldOrders). Tolerates a leading "#" and mixed case. */
export function getOrderByNumber(orderNum) {
  const normalized = String(orderNum || '').trim().replace(/^#/, '');
  const row = db.prepare('SELECT * FROM orders WHERE UPPER(order_num) = UPPER(?)').get(normalized);
  if (!row) return null;
  return {
    orderNum: row.order_num,
    createdAt: row.created_at,
    status: row.status,
    customer: { fname: row.fname, lname: row.lname, phone: row.phone, email: row.email, address: row.address, pickupTime: row.pickup_time },
    mode: row.mode,
    items: JSON.parse(row.items_json),
    totals: JSON.parse(row.totals_json),
    payment: row.payment,
  };
}

export const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'delivered', 'cancelled'];

export function updateOrderStatus(orderNum, status) {
  if (!ORDER_STATUSES.includes(status)) return false;
  const normalized = String(orderNum || '').trim().replace(/^#/, '');
  const result = db.prepare('UPDATE orders SET status = ? WHERE UPPER(order_num) = UPPER(?)').run(status, normalized);
  return result.changes > 0;
}

/* ── Print queue: if PrintNode / the kitchen printer is unreachable, no
   order is lost — it's queued here and retried automatically (see
   retryPrintQueue in server.js). ── */
export function enqueuePrintJob(order, error) {
  db.prepare(`
    INSERT INTO print_queue (order_num, order_json, attempts, last_error, status, created_at)
    VALUES (?, ?, 1, ?, 'pending', ?)
  `).run(order.orderNum || '', JSON.stringify(order), String(error || ''), new Date().toISOString());
}

export function getPendingPrintJobs() {
  return db.prepare("SELECT * FROM print_queue WHERE status = 'pending' ORDER BY id").all()
    .map(r => ({ ...r, order: JSON.parse(r.order_json) }));
}

export function markPrintJobResolved(id) {
  db.prepare("UPDATE print_queue SET status = 'resolved', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function markPrintJobFailedAgain(id, error) {
  db.prepare('UPDATE print_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?').run(String(error || ''), id);
}

export function countPendingPrintJobs() {
  return db.prepare("SELECT COUNT(*) AS n FROM print_queue WHERE status = 'pending'").get().n;
}

/* ── Audit log: every administrative change is recorded for accountability. ── */
export function logAudit(action, details, actor) {
  db.prepare('INSERT INTO audit_log (actor, action, details, created_at) VALUES (?, ?, ?, ?)')
    .run(actor || 'admin', action, details ? JSON.stringify(details) : null, new Date().toISOString());
}

export function getAuditLog(limit = 200) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit)
    .map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}

/* ── Notifications: surfaced in the admin panel (order status changes,
   printer errors, email failures, etc.). ── */
export function pushNotification(type, message, details, severity = 'info') {
  db.prepare('INSERT INTO notifications (type, severity, message, details, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(type, severity, message, details ? JSON.stringify(details) : null, new Date().toISOString());
}

export function getNotifications(limit = 100) {
  return db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(limit)
    .map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}

export function markNotificationRead(id) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

/* ── Backups: daily automatic backup + manual backup from the admin panel.
   Uses the native SQLite backup API (consistent, even while the server is
   running). ── */
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

export async function createBackup(label = 'manual') {
  const filename = `restaurant-${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  await db.backup(dest);
  return filename;
}

export function listBackups() {
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBackupPath(filename) {
  const safe = path.basename(filename);
  const full = path.join(BACKUP_DIR, safe);
  return fs.existsSync(full) ? full : null;
}

export function pruneAutoBackups(keep = 14) {
  const autos = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('restaurant-auto-')).sort().reverse();
  autos.slice(keep).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
}

/* Checks that an uploaded file is a real template database before it's used
   for a restore — prevents a wrong or corrupted file from overwriting the
   live database. */
export function validateRestoreFile(filePath) {
  let testDb;
  try {
    testDb = new Database(filePath, { readonly: true, fileMustExist: true });
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
    const required = ['customers', 'orders', 'menu_items', 'categories', 'restaurant_settings'];
    const missing = required.filter(t => !tables.includes(t));
    if (missing.length > 0) {
      return { valid: false, error: `Not a valid template database (missing tables: ${missing.join(', ')}).` };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: 'File is not a valid SQLite database: ' + err.message };
  } finally {
    if (testDb) testDb.close();
  }
}
