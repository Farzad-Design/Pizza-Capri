/* Central key/value store for everything that must be configurable per
   restaurant instance without touching source code (name, address, hours,
   discount toggles, theme, etc.). Values are stored as JSON text so any
   shape (string, number, boolean, object) round-trips cleanly. */

const DEFAULTS = {
  restaurant_name: '',
  restaurant_logo: '',
  restaurant_address: '',
  restaurant_phone: '',
  restaurant_email: '',
  currency: 'EUR',
  locale: 'en',
  timezone: 'Europe/Berlin',
  opening_hours: {
    mon: { open: '', close: '' }, tue: { open: '', close: '' }, wed: { open: '', close: '' },
    thu: { open: '', close: '' }, fri: { open: '', close: '' }, sat: { open: '', close: '' }, sun: { open: '', close: '' },
  },
  min_order_delivery: 0,
  free_item_threshold: 0,
  pickup_discount_active: false,
  pickup_discount_pct: 0,
  first_order_discount_active: false,
  first_order_discount_pct: 0,
  discounts_stack: false,
  discounts_apply_to_drinks: false,
  theme: {
    primaryColor: '#B23A2E',
    secondaryColor: '#2B2016',
    accentColor: '#EE8600',
    fontHeading: 'Georgia',
    fontBody: 'system-ui',
    borderRadius: '10px',
    logo: '',
    favicon: '',
    heroImage: '',
  },
  receipt_width_chars: 42,
  setup_complete: false,
};

let cachedDb = null;

export function initSettings(db) {
  cachedDb = db;
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO restaurant_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  const seedAll = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      insert.run(key, JSON.stringify(value), now);
    }
  });
  seedAll();
}

export function getSetting(key) {
  const row = cachedDb.prepare('SELECT value FROM restaurant_settings WHERE key = ?').get(key);
  if (!row) return DEFAULTS[key];
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function getAllSettings() {
  const rows = cachedDb.prepare('SELECT key, value FROM restaurant_settings').all();
  const out = {};
  for (const row of rows) {
    try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
  }
  return out;
}

export function setSetting(key, value) {
  cachedDb.prepare(`
    INSERT INTO restaurant_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), new Date().toISOString());
}

export function setSettings(partial) {
  const setAll = cachedDb.transaction(() => {
    for (const [key, value] of Object.entries(partial)) setSetting(key, value);
  });
  setAll();
  return getAllSettings();
}

/* Public settings are everything except operational secrets — the storefront
   fetches this; nothing PrintNode/SMTP/PayPal related is ever exposed here. */
export function getPublicSettings() {
  const all = getAllSettings();
  const { receipt_width_chars, ...publicFields } = all;
  return publicFields;
}
