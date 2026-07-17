import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.js')).sort();

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
    if (applied.has(mod.version)) continue;
    const run = db.transaction(() => {
      mod.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(mod.version, mod.name, new Date().toISOString());
    });
    run();
    console.log(`[migrate] applied ${String(mod.version).padStart(3, '0')}_${mod.name}`);
  }
}

/* Rolls back the single most recently applied migration. Used by the CLI
   (`npm run migrate:down`) for local development, never called automatically. */
export async function rollbackLastMigration(db) {
  const last = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1').get();
  if (!last) return null;
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.js'));
  const file = files.find(f => f.startsWith(String(last.version).padStart(3, '0')));
  if (!file) throw new Error(`Migration file for version ${last.version} not found`);
  const mod = await import(path.join(MIGRATIONS_DIR, file));
  const run = db.transaction(() => {
    mod.down(db);
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(last.version);
  });
  run();
  return last;
}
