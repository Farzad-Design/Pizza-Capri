export const version = 1;
export const name = 'init';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL DEFAULT 'customer',
      email TEXT UNIQUE,
      phone TEXT,
      fname TEXT,
      lname TEXT,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verify_token TEXT,
      reset_token TEXT,
      reset_token_expires TEXT,
      gdpr_marketing_opt_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT,
      street TEXT,
      house_number TEXT,
      postal_code TEXT,
      city TEXT,
      note TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      fname TEXT,
      lname TEXT,
      email TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL,
      first_order_used INTEGER NOT NULL DEFAULT 0,
      last_order_date TEXT
    );

    CREATE TABLE IF NOT EXISTS delivery_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      min_order REAL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'percent',
      value REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      usage_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      min_order REAL,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      emoji TEXT,
      accent_color TEXT,
      img TEXT,
      cat_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      sub TEXT,
      note TEXT,
      group_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      nr TEXT,
      name TEXT NOT NULL,
      desc TEXT,
      veg INTEGER NOT NULL DEFAULT 0,
      allergens TEXT,
      sizes_json TEXT,
      prices_json TEXT NOT NULL,
      extra_group_ids_json TEXT,
      available INTEGER NOT NULL DEFAULT 1,
      item_order INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS extra_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      min_select INTEGER NOT NULL DEFAULT 0,
      max_select INTEGER
    );

    CREATE TABLE IF NOT EXISTS extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_group_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (extra_group_id) REFERENCES extra_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_num TEXT,
      user_id INTEGER,
      phone TEXT,
      fname TEXT,
      lname TEXT,
      email TEXT,
      mode TEXT,
      address TEXT,
      delivery_zone_id INTEGER,
      pickup_time TEXT,
      items_json TEXT NOT NULL,
      totals_json TEXT NOT NULL,
      coupon_code TEXT,
      payment TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS print_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_num TEXT NOT NULL,
      order_json TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      paypal_client_id TEXT,
      paypal_secret_enc TEXT,
      paypal_verified INTEGER NOT NULL DEFAULT 0,
      paypal_last_error TEXT,
      paypal_last_solution TEXT,
      bank_holder TEXT,
      iban TEXT,
      bic TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      details TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_order_num ON orders(order_num);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_menu_items_group_id ON menu_items(group_id);
    CREATE INDEX IF NOT EXISTS idx_menu_groups_category ON menu_groups(category);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
  `);
}

export function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS payment_config;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS print_queue;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS extras;
    DROP TABLE IF EXISTS extra_groups;
    DROP TABLE IF EXISTS menu_items;
    DROP TABLE IF EXISTS menu_groups;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS coupons;
    DROP TABLE IF EXISTS delivery_zones;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS addresses;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS restaurant_settings;
  `);
}
