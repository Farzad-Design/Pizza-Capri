import express from 'express';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

import { autoPrintOrder, writeLiveConfig, readLiveConfig } from './printnode.js';
import {
  sendEmail, registrationEmailHtml, orderConfirmationHtml, restaurantOrderNotificationHtml,
  passwordResetEmailHtml, verifyEmailHtml,
} from './email.js';
import { verifyPaypalCredentials } from './paypal.js';
import { calculateTotals } from './cart.js';
import {
  isFirstOrderEligible, recordOrder, cleanupOldOrders, ORDER_RETENTION_DAYS,
  getPublicMenu, getAdminMenu, updateMenuItem, updateCategoryImage, getCategories,
  upsertCategory, deleteCategory, getGroupsForCategory, addMenuItem, listCustomers, IMAGES_DIR,
  getPaymentConfigStatus, savePaymentConfig, getOrderByNumber, getOrdersForUser,
  deleteMenuItem, getTrashedItems, restoreMenuItem, permanentlyDeleteMenuItem,
  ORDER_STATUSES, updateOrderStatus,
  enqueuePrintJob, getPendingPrintJobs, markPrintJobResolved, markPrintJobFailedAgain, countPendingPrintJobs,
  logAudit, getAuditLog,
  createBackup, listBackups, getBackupPath, pruneAutoBackups,
  validateRestoreFile, DATABASE_PATH,
  getDeliveryZones, upsertDeliveryZone, deleteDeliveryZone,
  getCoupons, getCouponByCode, upsertCoupon, deleteCoupon,
  getExtraGroups, upsertExtraGroup, upsertExtra,
  pushNotification, getNotifications, markNotificationRead,
  db,
} from './db.js';
import { getPublicSettings, getAllSettings, setSettings, getSetting } from './settings.js';
import {
  sessionMiddleware, setSessionCookie, clearSessionCookie, requireRole,
  createUser, findUserByEmail, verifyPassword, verifyEmailToken, updateLastLogin,
  createPasswordResetToken, resetPasswordWithToken, createSession, destroySession,
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

function getRestaurantNow() {
  const timezone = getSetting('timezone') || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  const dayKeyMap = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' };
  return { dayKey: dayKeyMap[get('weekday')], hhmm: `${get('hour')}:${get('minute')}` };
}

function isRestaurantOpenNow() {
  const hours = getSetting('opening_hours') || {};
  const { dayKey, hhmm } = getRestaurantNow();
  const today = hours[dayKey] || {};
  if (!today.open || !today.close) return { open: false, hours: today };
  return { open: hhmm >= today.open && hhmm < today.close, hours: today };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMAGES_DIR),
    filename: (req, file, cb) => cb(null, `${req.params.id}-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
});

const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `restore-upload-${Date.now()}.db`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.originalname.toLowerCase().endsWith('.db')),
});

// Exclude 'multipart/form-data' — otherwise express.text() consumes the
// upload body before multer (image/backup uploads) can read it.
app.use(express.text({ type: (req) => !req.is('multipart/form-data'), limit: '1mb' }));
app.use(sessionMiddleware);

function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return null; }
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ── Public: settings, business hours, menu ── */
app.get('/api/settings', (req, res) => {
  res.status(200).json({ ok: true, settings: getPublicSettings() });
});

app.get('/api/business-hours', (req, res) => {
  res.status(200).json({ ok: true, ...isRestaurantOpenNow() });
});

app.get('/api/menu', (req, res) => {
  res.status(200).json({ ok: true, ...getPublicMenu(), extraGroups: getExtraGroups() });
});

app.get('/api/delivery-zones', (req, res) => {
  res.status(200).json({ ok: true, zones: getDeliveryZones() });
});

app.get('/api/customer-status', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });
  res.status(200).json({ ok: true, firstOrderEligible: isFirstOrderEligible(phone) });
});

/* ── Customer auth ── */
app.post('/api/auth/register', async (req, res) => {
  const body = parseBody(req) || {};
  if (!isValidEmail(body.email) || !body.password || body.password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Valid email and a password (min. 8 characters) are required' });
  }
  const result = createUser({
    email: body.email.trim().toLowerCase(), phone: body.phone, fname: body.fname, lname: body.lname,
    password: body.password, gdprMarketingOptIn: !!body.gdprMarketingOptIn,
  });
  if (!result.ok) return res.status(400).json(result);

  const verifyUrl = `${process.env.SITE_URL || ''}/verify-email?token=${result.verifyToken}`;
  sendEmail(body.email, 'Please verify your email', verifyEmailHtml(verifyUrl)).catch(() => {});
  sendEmail(body.email, `Welcome to ${getSetting('restaurant_name') || 'your restaurant'}`, registrationEmailHtml(body.fname || '')).catch(() => {});

  const session = createSession(result.id);
  setSessionCookie(res, session);
  res.status(200).json({ ok: true });
});

app.get('/api/auth/verify-email', (req, res) => {
  const ok = verifyEmailToken(String(req.query.token || ''));
  res.status(200).json({ ok });
});

app.post('/api/auth/login', (req, res) => {
  const body = parseBody(req) || {};
  const user = findUserByEmail(String(body.email || '').trim().toLowerCase());
  if (!user || !verifyPassword(body.password || '', user.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }
  updateLastLogin(user.id);
  const session = createSession(user.id);
  setSessionCookie(res, session);
  res.status(200).json({ ok: true, user: { id: user.id, email: user.email, fname: user.fname, lname: user.lname, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionId) destroySession(req.sessionId);
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(200).json({ ok: true, user: null });
  const { password_hash, verify_token, reset_token, ...safe } = req.user;
  res.status(200).json({ ok: true, user: safe });
});

app.post('/api/auth/request-password-reset', async (req, res) => {
  const body = parseBody(req) || {};
  const token = createPasswordResetToken(String(body.email || '').trim().toLowerCase());
  // Always respond ok, whether or not the account exists, to avoid leaking
  // which emails are registered.
  if (token) {
    const resetUrl = `${process.env.SITE_URL || ''}/reset-password?token=${token}`;
    sendEmail(body.email, 'Reset your password', passwordResetEmailHtml(resetUrl)).catch(() => {});
  }
  res.status(200).json({ ok: true });
});

app.post('/api/auth/reset-password', (req, res) => {
  const body = parseBody(req) || {};
  if (!body.token || !body.password || body.password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Token and a password (min. 8 characters) are required' });
  }
  const ok = resetPasswordWithToken(body.token, body.password);
  if (!ok) return res.status(400).json({ ok: false, error: 'Invalid or expired reset link' });
  res.status(200).json({ ok: true });
});

app.get('/api/account/orders', requireRole('customer', 'staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, orders: getOrdersForUser(req.user.id) });
});

/* ── Orders / checkout ── */
app.post('/api/order', async (req, res) => {
  const order = parseBody(req);
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Invalid order payload' });
  }

  const { open, hours } = isRestaurantOpenNow();
  if (!open) {
    return res.status(400).json({ ok: false, error: `Restaurant is closed. Today's hours: ${hours.open || '--'}–${hours.close || '--'}.` });
  }

  const settings = getAllSettings();
  const zones = getDeliveryZones();
  const zone = order.deliveryZoneId ? zones.find(z => z.id === Number(order.deliveryZoneId)) : null;
  const coupon = order.couponCode ? getCouponByCode(order.couponCode) : null;
  const eligible = isFirstOrderEligible(order.customer?.phone);

  // Server recomputes totals authoritatively — whatever the client sent is
  // discarded and replaced with this calculation, so a customer can never
  // grant themselves a bigger discount than the admin-configured rules allow.
  const totals = calculateTotals({
    items: order.items, mode: order.mode, deliveryZone: zone, settings, coupon, isFirstOrderEligible: eligible,
  });
  if (totals.deliveryBlocked) {
    return res.status(400).json({ ok: false, error: `Minimum order for delivery is ${totals.minOrderDelivery} ${settings.currency}.` });
  }

  const fullOrder = { ...order, totals, receivedAt: new Date().toISOString() };

  recordOrder({
    orderNum: order.orderNum,
    customer: order.customer || {},
    mode: order.mode,
    items: order.items,
    totals,
    payment: order.payment,
    deliveryZoneId: zone ? zone.id : null,
    couponCode: coupon ? coupon.code : null,
    userId: req.user ? req.user.id : null,
    firstOrderDiscountApplied: totals.firstOrder > 0,
  });

  // If printing fails (printer offline, PrintNode unreachable), the order
  // is never lost: it's queued for automatic retry (see retryPrintQueue).
  autoPrintOrder(fullOrder).catch((err) => {
    const msg = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error('PrintNode print failed, queued for retry:', msg);
    enqueuePrintJob(fullOrder, msg);
    pushNotification('printer_error', `Kitchen receipt for order #${order.orderNum} failed to print`, { error: msg }, 'error');
  });

  // Two fully independent email workflows: a failure in one must never
  // prevent the other.
  if (order.customer && order.customer.email) {
    sendEmail(order.customer.email, `Order confirmation #${order.orderNum || ''}`, orderConfirmationHtml(fullOrder))
      .catch((err) => console.error('Customer confirmation email failed:', err.message));
  }
  const restaurantEmail = getSetting('restaurant_email');
  if (restaurantEmail) {
    sendEmail(restaurantEmail, `New order #${order.orderNum || ''}`, restaurantOrderNotificationHtml(fullOrder))
      .catch((err) => console.error('Restaurant notification email failed:', err.message));
  }
  pushNotification('new_order', `New order #${order.orderNum}`, { total: totals.grand });

  res.status(200).json({ ok: true, totals });
});

app.post('/api/payment-webhook', async (req, res) => {
  const event = parseBody(req);
  if (!event || event.status !== 'paid' || !event.order) {
    return res.status(400).json({ ok: false, error: 'Invalid webhook payload' });
  }
  try {
    const result = await autoPrintOrder(event.order);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.response ? err.response.data : String(err) });
  }
});

/* ── Admin: settings / setup wizard ── */
app.get('/api/admin/settings', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, settings: getAllSettings() });
});

app.post('/api/admin/settings', requireRole('admin'), (req, res) => {
  const body = parseBody(req) || {};
  const settings = setSettings(body);
  logAudit('settings_update', { keys: Object.keys(body) });
  res.status(200).json({ ok: true, settings });
});

app.post('/api/admin/setup-wizard/complete', requireRole('admin'), (req, res) => {
  const settings = setSettings({ setup_complete: true });
  logAudit('setup_wizard_completed', {});
  res.status(200).json({ ok: true, settings });
});

/* ── Admin: PrintNode ── */
app.post('/api/admin/printnode-config', requireRole('admin'), (req, res) => {
  const body = parseBody(req) || {};
  const update = {};
  if (body.printerId) update.printerId = String(body.printerId).trim();
  if (body.apiKey) update.apiKey = String(body.apiKey).trim();
  const saved = writeLiveConfig(update);
  logAudit('printnode_config_update', { printerIdSet: !!saved.printerId, apiKeySet: !!saved.apiKey });
  res.status(200).json({ ok: true, printerIdSet: !!saved.printerId, apiKeySet: !!saved.apiKey });
});

app.get('/api/admin/printnode-config', requireRole('admin'), (req, res) => {
  const live = readLiveConfig();
  res.status(200).json({ ok: true, printerIdSet: !!live.printerId, apiKeySet: !!live.apiKey });
});

/* ── Admin: menu ── */
app.get('/api/admin/menu', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, ...getAdminMenu(), categories: getCategories(), extraGroups: getExtraGroups() });
});

app.patch('/api/admin/menu/:id', requireRole('staff', 'admin'), (req, res) => {
  const body = parseBody(req) || {};
  const ok = updateMenuItem(Number(req.params.id), {
    prices: Array.isArray(body.prices) ? body.prices.map(Number) : undefined,
    available: !!body.available,
    name: body.name,
    desc: body.desc,
  });
  if (!ok) return res.status(404).json({ ok: false, error: 'Item not found' });
  logAudit('menu_item_update', { id: Number(req.params.id), prices: body.prices, available: !!body.available });
  res.status(200).json({ ok: true });
});

app.delete('/api/admin/menu/:id', requireRole('staff', 'admin'), (req, res) => {
  const ok = deleteMenuItem(Number(req.params.id));
  if (!ok) return res.status(404).json({ ok: false, error: 'Item not found' });
  logAudit('menu_item_soft_delete', { id: Number(req.params.id) });
  res.status(200).json({ ok: true });
});

app.get('/api/admin/menu/trash', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, items: getTrashedItems() });
});

app.post('/api/admin/menu/:id/restore', requireRole('staff', 'admin'), (req, res) => {
  const ok = restoreMenuItem(Number(req.params.id));
  if (!ok) return res.status(404).json({ ok: false, error: 'Item not found in trash' });
  logAudit('menu_item_restore', { id: Number(req.params.id) });
  res.status(200).json({ ok: true });
});

app.delete('/api/admin/menu/:id/permanent', requireRole('admin'), (req, res) => {
  const ok = permanentlyDeleteMenuItem(Number(req.params.id));
  if (!ok) return res.status(404).json({ ok: false, error: 'Item not found in trash' });
  logAudit('menu_item_permanent_delete', { id: Number(req.params.id) });
  res.status(200).json({ ok: true });
});

app.get('/api/admin/groups', requireRole('staff', 'admin'), (req, res) => {
  const category = req.query.category;
  if (!category) return res.status(400).json({ ok: false, error: 'category required' });
  res.status(200).json({ ok: true, groups: getGroupsForCategory(category) });
});

app.post('/api/admin/menu/item', requireRole('staff', 'admin'), (req, res) => {
  const body = parseBody(req) || {};
  const result = addMenuItem({
    category: body.category,
    groupId: body.groupId ? Number(body.groupId) : null,
    newGroupSub: body.newGroupSub,
    nr: body.nr,
    name: body.name,
    desc: body.desc,
    sizes: Array.isArray(body.sizes) ? body.sizes : null,
    prices: Array.isArray(body.prices) ? body.prices.map(Number) : [],
  });
  if (!result.ok) return res.status(400).json(result);
  logAudit('menu_item_create', { category: body.category, name: body.name });
  res.status(200).json(result);
});

app.post('/api/admin/category', requireRole('staff', 'admin'), (req, res) => {
  const body = parseBody(req) || {};
  if (!body.id || !body.title) return res.status(400).json({ ok: false, error: 'id and title required' });
  upsertCategory({ id: body.id, title: body.title, emoji: body.emoji, accentColor: body.accentColor, img: body.img, order: body.order });
  logAudit('category_upsert', { id: body.id });
  res.status(200).json({ ok: true });
});

app.delete('/api/admin/category/:id', requireRole('admin'), (req, res) => {
  const ok = deleteCategory(req.params.id);
  logAudit('category_delete', { id: req.params.id });
  res.status(200).json({ ok });
});

app.post('/api/admin/category/:id/image', requireRole('staff', 'admin'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No image uploaded' });
  updateCategoryImage(req.params.id, `/uploads/${req.file.filename}`);
  logAudit('category_image_update', { category: req.params.id, filename: req.file.filename });
  res.status(200).json({ ok: true, img: `/uploads/${req.file.filename}` });
});

/* ── Admin: extras / toppings ── */
app.post('/api/admin/extra-group', requireRole('staff', 'admin'), (req, res) => {
  const body = parseBody(req) || {};
  const id = upsertExtraGroup({ id: body.id, name: body.name, minSelect: body.minSelect, maxSelect: body.maxSelect });
  logAudit('extra_group_upsert', { id });
  res.status(200).json({ ok: true, id });
});

app.post('/api/admin/extra', requireRole('staff', 'admin'), (req, res) => {
  const body = parseBody(req) || {};
  const id = upsertExtra({
    id: body.id, extraGroupId: body.extraGroupId, name: body.name, price: Number(body.price || 0),
    available: body.available !== false, sortOrder: body.sortOrder,
  });
  logAudit('extra_upsert', { id });
  res.status(200).json({ ok: true, id });
});

/* ── Admin: delivery zones ── */
app.get('/api/admin/delivery-zones', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, zones: getDeliveryZones(true) });
});

app.post('/api/admin/delivery-zones', requireRole('admin'), (req, res) => {
  const body = parseBody(req) || {};
  const id = upsertDeliveryZone({
    id: body.id, name: body.name, fee: Number(body.fee || 0), minOrder: body.minOrder != null ? Number(body.minOrder) : null,
    active: body.active !== false, sortOrder: body.sortOrder,
  });
  logAudit('delivery_zone_upsert', { id });
  res.status(200).json({ ok: true, id });
});

app.delete('/api/admin/delivery-zones/:id', requireRole('admin'), (req, res) => {
  const ok = deleteDeliveryZone(Number(req.params.id));
  logAudit('delivery_zone_delete', { id: req.params.id });
  res.status(200).json({ ok });
});

/* ── Admin: coupons ── */
app.get('/api/admin/coupons', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, coupons: getCoupons() });
});

app.post('/api/admin/coupons', requireRole('admin'), (req, res) => {
  const body = parseBody(req) || {};
  if (!body.code) return res.status(400).json({ ok: false, error: 'code required' });
  const id = upsertCoupon({
    id: body.id, code: String(body.code).trim().toUpperCase(), type: body.type || 'percent', value: Number(body.value || 0),
    active: body.active !== false, usageLimit: body.usageLimit ?? null, minOrder: body.minOrder ?? null, expiresAt: body.expiresAt ?? null,
  });
  logAudit('coupon_upsert', { id });
  res.status(200).json({ ok: true, id });
});

app.delete('/api/admin/coupons/:id', requireRole('admin'), (req, res) => {
  const ok = deleteCoupon(Number(req.params.id));
  logAudit('coupon_delete', { id: req.params.id });
  res.status(200).json({ ok });
});

/* GDPR-minimal customer list: name/phone/email/order-history metadata only,
   never individual order contents. */
app.get('/api/admin/customers', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, customers: listCustomers() });
});

app.get('/api/admin/order', requireRole('staff', 'admin'), (req, res) => {
  const orderNum = req.query.orderNum;
  if (!orderNum) return res.status(400).json({ ok: false, error: 'orderNum required' });
  const order = getOrderByNumber(String(orderNum).trim());
  if (!order) return res.status(404).json({ ok: false, error: `Order not found (may be older than ${ORDER_RETENTION_DAYS} days)` });
  res.status(200).json({ ok: true, order, statuses: ORDER_STATUSES });
});

app.post('/api/admin/order/:orderNum/status', requireRole('staff', 'admin'), (req, res) => {
  const body = parseBody(req) || {};
  const ok = updateOrderStatus(req.params.orderNum, body.status);
  if (!ok) return res.status(400).json({ ok: false, error: 'Invalid order number or status' });
  logAudit('order_status_update', { orderNum: req.params.orderNum, status: body.status });
  pushNotification('order_status', `Order #${req.params.orderNum} -> ${body.status}`);
  res.status(200).json({ ok: true });
});

/* ── Print queue ── */
app.get('/api/admin/print-queue', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, jobs: getPendingPrintJobs(), count: countPendingPrintJobs() });
});

app.post('/api/admin/print-queue/:id/retry', requireRole('staff', 'admin'), async (req, res) => {
  const jobs = getPendingPrintJobs();
  const job = jobs.find(j => j.id === Number(req.params.id));
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  try {
    await autoPrintOrder(job.order);
    markPrintJobResolved(job.id);
    res.status(200).json({ ok: true, resolved: true });
  } catch (err) {
    const msg = err.response ? JSON.stringify(err.response.data) : err.message;
    markPrintJobFailedAgain(job.id, msg);
    res.status(200).json({ ok: true, resolved: false, error: msg });
  }
});

/* ── Notifications ── */
app.get('/api/admin/notifications', requireRole('staff', 'admin'), (req, res) => {
  res.status(200).json({ ok: true, notifications: getNotifications() });
});

app.post('/api/admin/notifications/:id/read', requireRole('staff', 'admin'), (req, res) => {
  markNotificationRead(Number(req.params.id));
  res.status(200).json({ ok: true });
});

/* ── Audit log ── */
app.get('/api/admin/audit-log', requireRole('admin'), (req, res) => {
  res.status(200).json({ ok: true, entries: getAuditLog() });
});

/* ── Analytics ── */
app.get('/api/admin/analytics', requireRole('staff', 'admin'), (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const dailyOrders = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS orders, SUM(json_extract(totals_json, '$.grand')) AS revenue
    FROM orders WHERE created_at >= ? GROUP BY day ORDER BY day
  `).all(since);

  const modeSplit = db.prepare(`
    SELECT mode, COUNT(*) AS n FROM orders WHERE created_at >= ? GROUP BY mode
  `).all(since);

  const totals = db.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(json_extract(totals_json, '$.grand')), 0) AS revenue
    FROM orders WHERE created_at >= ?
  `).get(since);

  const popularItems = db.prepare(`
    SELECT json_extract(value, '$.name') AS name, SUM(json_extract(value, '$.qty')) AS qty
    FROM orders, json_each(orders.items_json) WHERE created_at >= ? GROUP BY name ORDER BY qty DESC LIMIT 10
  `).all(since);

  const newCustomers = db.prepare('SELECT COUNT(*) AS n FROM customers WHERE created_at >= ?').get(since).n;
  const returningCustomers = db.prepare('SELECT COUNT(*) AS n FROM customers WHERE created_at < ? AND last_order_date >= ?').get(since, since).n;

  res.status(200).json({
    ok: true,
    days,
    dailyOrders,
    modeSplit,
    totals: { orders: totals.orders, revenue: totals.revenue, avgOrderValue: totals.orders ? Math.round((totals.revenue / totals.orders) * 100) / 100 : 0 },
    popularItems,
    newCustomers,
    returningCustomers,
  });
});

/* ── Backups ── */
app.post('/api/admin/backup', requireRole('admin'), async (req, res) => {
  const filename = await createBackup('manual');
  logAudit('backup_created', { filename, type: 'manual' });
  res.status(200).json({ ok: true, filename });
});

app.get('/api/admin/backups', requireRole('admin'), (req, res) => {
  res.status(200).json({ ok: true, backups: listBackups() });
});

app.get('/api/admin/backups/:filename', requireRole('admin'), (req, res) => {
  const filePath = getBackupPath(req.params.filename);
  if (!filePath) return res.status(404).json({ ok: false, error: 'Backup not found' });
  res.download(filePath);
});

/* Restore from an uploaded backup file. Flow: validate file -> safety-backup
   the current database -> install the file -> restart the server so all
   database connections reopen cleanly (a process manager restarts the
   process automatically, e.g. Docker's "restart: unless-stopped"). */
app.post('/api/admin/restore', requireRole('admin'), restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded (must be a .db file).' });

  const uploadedPath = req.file.path;
  const validation = validateRestoreFile(uploadedPath);
  if (!validation.valid) {
    fs.unlinkSync(uploadedPath);
    return res.status(400).json({ ok: false, error: validation.error });
  }

  try {
    const safetyBackup = await createBackup('pre-restore');
    fs.copyFileSync(uploadedPath, DATABASE_PATH);
    fs.unlinkSync(uploadedPath);
    logAudit('database_restored', { safetyBackup });
    res.status(200).json({ ok: true, safetyBackup, restarting: true });
    setTimeout(() => process.exit(1), 800);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Restore failed: ' + err.message });
  }
});

/* ── Payment settings ── */
app.get('/api/admin/payment-config', requireRole('admin'), (req, res) => {
  res.status(200).json({ ok: true, ...getPaymentConfigStatus() });
});

app.post('/api/admin/payment-config', requireRole('admin'), async (req, res) => {
  const body = parseBody(req) || {};
  const paypalClientId = body.paypalClientId ? String(body.paypalClientId).trim() : undefined;
  const paypalSecret = body.paypalSecret ? String(body.paypalSecret).trim() : undefined;

  let verification = {};
  if (paypalClientId !== undefined || paypalSecret !== undefined) {
    const current = getPaymentConfigStatus();
    const effectiveClientId = paypalClientId || current.paypalClientId;
    if (!paypalSecret && !current.paypalConfigured) {
      verification = { paypalVerified: false, paypalError: 'Secret is missing.', paypalSolution: 'Please enter the PayPal secret.' };
    } else if (paypalSecret) {
      const result = await verifyPaypalCredentials(effectiveClientId, paypalSecret);
      verification = { paypalVerified: result.verified, paypalError: result.error || '', paypalSolution: result.solution || '' };
    }
  }

  const status = savePaymentConfig({
    paypalClientId,
    paypalSecret,
    bankHolder: body.bankHolder !== undefined ? String(body.bankHolder).trim() : undefined,
    iban: body.iban !== undefined ? String(body.iban).replace(/\s+/g, '').toUpperCase() : undefined,
    bic: body.bic !== undefined ? String(body.bic).trim().toUpperCase() : undefined,
    ...verification,
  });
  logAudit('payment_config_update', { paypalUpdated: paypalClientId !== undefined || paypalSecret !== undefined, verified: verification.paypalVerified });
  res.status(200).json({ ok: true, ...status });
});

app.use('/uploads', express.static(IMAGES_DIR, { maxAge: '7d' }));

app.use(express.static(path.join(__dirname, '..'), {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Service-Worker-Allowed', '/');
    } else if (filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    } else if (/\/(images|icon-)/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

cleanupOldOrders();
setInterval(cleanupOldOrders, 24 * 60 * 60 * 1000);
console.log(`Order retention: ${ORDER_RETENTION_DAYS} days, cleanup runs daily.`);

/* Automatic daily backup + pruning of old auto-backups (keeps the last 14
   days). Runs once at startup and then every 24h. Only one automatic backup
   per calendar day, even if the container restarts multiple times the same day. */
function alreadyBackedUpToday() {
  const today = new Date().toISOString().slice(0, 10);
  return listBackups().some(b => b.filename.startsWith('restaurant-auto-') && b.createdAt.slice(0, 10) === today);
}

async function runAutoBackup() {
  if (alreadyBackedUpToday()) return;
  try {
    const filename = await createBackup('auto');
    pruneAutoBackups(14);
    logAudit('backup_created', { filename, type: 'auto' });
  } catch (err) {
    console.error('Automatic backup failed:', err.message);
  }
}
runAutoBackup();
setInterval(runAutoBackup, 60 * 60 * 1000);

/* Print queue: retry failed kitchen receipts every 5 minutes (e.g. if the
   printer was offline). */
async function retryPrintQueue() {
  const jobs = getPendingPrintJobs();
  for (const job of jobs) {
    try {
      await autoPrintOrder(job.order);
      markPrintJobResolved(job.id);
      console.log(`Print queue: retry succeeded for order #${job.order_num}`);
    } catch (err) {
      const msg = err.response ? JSON.stringify(err.response.data) : err.message;
      markPrintJobFailedAgain(job.id, msg);
    }
  }
}
setInterval(retryPrintQueue, 5 * 60 * 1000);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Restaurant Pizzeria Capri server listening on ${port}`));
