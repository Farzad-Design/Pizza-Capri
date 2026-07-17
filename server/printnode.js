import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'printnode-config.json');

export function readLiveConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

export function writeLiveConfig(partial) {
  const current = readLiveConfig();
  const next = { ...current, ...partial };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function transliterate(str) {
  const map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
  return String(str || '').replace(/[äöüÄÖÜß]/g, (c) => map[c]);
}

function priceLine(label, amount, width, currency) {
  const priceStr = `${amount.toFixed(2)} ${currency}`;
  const maxLabel = width - priceStr.length - 1;
  const shownLabel = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '.' : label;
  const pad = width - shownLabel.length - priceStr.length;
  return shownLabel + ' '.repeat(Math.max(1, pad)) + priceStr;
}

/* Default receipt width mirrors a standard 80mm thermal printer (42 chars
   at the common 12cpi kitchen-printer font); override via the
   receipt_width_chars setting for 58mm printers or a different font. */
function buildReceiptText(order) {
  const width = getSetting('receipt_width_chars') || 42;
  const currency = getSetting('currency') || 'EUR';
  const restaurantAddress = getSetting('restaurant_address') || '';
  const timezone = getSetting('timezone') || 'UTC';
  const deliveryMaxMinutes = getSetting('delivery_max_minutes') || 45;

  const lines = [];
  const t = order.totals || {};
  const receivedAt = new Date(order.receivedAt || Date.now());
  if (restaurantAddress) lines.push(transliterate(restaurantAddress));
  lines.push(`Order #${order.orderNum || ''}`);
  lines.push(receivedAt.toLocaleString('en-GB', { timeZone: timezone }));
  lines.push(order.modeLabel || (order.mode === 'pickup' ? 'PICKUP' : 'DELIVERY'));
  if (order.mode === 'delivery') {
    const deadline = new Date(receivedAt.getTime() + deliveryMaxMinutes * 60000);
    const deadlineStr = deadline.toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
    lines.push(`Deliver by: ${deadlineStr}`);
  }
  if (t.firstOrder > 0) lines.push('*** FIRST ORDER DISCOUNT ***');
  lines.push('-'.repeat(width));

  for (const item of order.items || []) {
    const label = (item.nr != null ? `#${item.nr} ` : '') + `${item.qty}x ${transliterate(item.name)}`;
    lines.push(priceLine(label, item.price * item.qty, width, currency));
  }

  lines.push('-'.repeat(width));
  if (t.sub != null) lines.push(`Subtotal: ${t.sub.toFixed(2)} ${currency}`);
  if (t.pickup > 0) lines.push(`Pickup discount: -${t.pickup.toFixed(2)} ${currency}`);
  if (t.firstOrder > 0) lines.push(`First-order discount: -${t.firstOrder.toFixed(2)} ${currency}`);
  if (t.coupon > 0) lines.push(`Coupon: -${t.coupon.toFixed(2)} ${currency}`);
  if (t.delivery > 0) lines.push(`Delivery: ${t.delivery.toFixed(2)} ${currency}`);
  if (t.grand != null) lines.push(`Total: ${t.grand.toFixed(2)} ${currency}`);
  lines.push(`Payment: ${transliterate(order.payment)}`);

  const customer = order.customer || {};
  const fullName = transliterate([customer.fname, customer.lname].filter(Boolean).join(' '));
  lines.push('-'.repeat(width));
  lines.push(fullName || '');
  if (order.mode === 'delivery') {
    lines.push(transliterate(customer.address) || '');
  } else if (customer.pickupTime) {
    lines.push(`Pickup time: ${customer.pickupTime}`);
  }
  if (customer.phone) lines.push(customer.phone);

  // Extra blank lines so the cutter (fires a few cm below the print head)
  // never slices through the last printed lines.
  return lines.join('\n') + '\n\n\n\n\n\n\n';
}

const ESC_INIT = Buffer.from([0x1B, 0x40]);
const ALIGN_CENTER = Buffer.from([0x1B, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([0x1B, 0x61, 0x00]);
const CUT_FULL = Buffer.from([0x1D, 0x56, 0x00]);

function buildReceiptBuffer(order) {
  // Umlauts are already transliterated to plain ASCII in buildReceiptText,
  // so no printer codepage guessing is needed — ASCII prints identically
  // on every codepage.
  const text = buildReceiptText(order);
  const textBuf = Buffer.from(text, 'ascii');
  const restaurantName = getSetting('restaurant_name') || 'KITCHEN RECEIPT';
  const header = Buffer.concat([
    ALIGN_CENTER, Buffer.from(`\n${transliterate(restaurantName).toUpperCase()}\nKITCHEN RECEIPT\n`, 'ascii'), ALIGN_LEFT,
  ]);
  return Buffer.concat([ESC_INIT, header, textBuf, CUT_FULL]);
}

export async function autoPrintOrder(order) {
  const live = readLiveConfig();
  const apiKey = live.apiKey || process.env.PRINTNODE_API_KEY;
  const printerId = live.printerId || process.env.PRINTNODE_PRINTER_ID;
  if (!apiKey || !printerId) return { ok: false, error: 'PrintNode not configured' };

  const receiptBuffer = buildReceiptBuffer(order);

  const response = await axios({
    method: 'post',
    url: 'https://api.printnode.com/printjobs',
    auth: { username: apiKey, password: '' },
    data: {
      printerId: Number(printerId),
      title: `Order #${order.orderNum || ''}`,
      contentType: 'raw_base64',
      content: receiptBuffer.toString('base64'),
      source: 'Restaurant Pizzeria Capri',
    },
  });

  return { ok: true, jobId: response.data };
}
