import { getSetting } from './settings.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const SITE_URL = process.env.SITE_URL || '';

export async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.log('[email] not configured, skipped:', subject, '->', to);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error('[email] Resend error:', await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

function emailShell({ statusText, statusColor, title, subtitle, bodyHtml }) {
  const theme = getSetting('theme') || {};
  const name = getSetting('restaurant_name') || '';
  const address = getSetting('restaurant_address') || '';
  const phone = getSetting('restaurant_phone') || '';
  const email = getSetting('restaurant_email') || '';
  const logo = theme.logo || '';
  const primary = theme.primaryColor || '#B23A2E';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F3EE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EE;padding:36px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #E3D9CC;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">

<tr><td align="center" style="background:#241609;padding:34px 28px 26px;">
  ${logo ? `<img src="${logo}" width="76" height="76" alt="${name}" style="border-radius:50%;display:block;">` : `<div style="color:#fff;font-size:20px;font-weight:bold;">${name}</div>`}
</td></tr>

<tr><td align="center" style="padding:22px 28px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:8px;height:8px;border-radius:50%;background:${statusColor || primary};font-size:0;line-height:0;">&nbsp;</td>
    <td style="padding-left:8px;font-size:12.5px;color:${statusColor || primary};font-weight:bold;">${statusText}</td>
  </tr></table>
</td></tr>

<tr><td align="center" style="padding:14px 28px 4px;">
  <div style="font-family:Georgia,serif;font-size:24px;line-height:1.3;color:#2B2016;">${title}</div>
</td></tr>
${subtitle ? `<tr><td align="center" style="padding:0 28px 26px;"><div style="font-size:13.5px;color:#6B5D52;">${subtitle}</div></td></tr>` : ''}

${bodyHtml}

<tr><td style="padding:20px 28px 28px;text-align:center;border-top:1px solid #E3D9CC;margin-top:22px;">
  <div style="font-size:12.5px;color:#6B5D52;line-height:1.6;">${[name, address].filter(Boolean).join(' &middot; ')}${phone ? `<br>Tel. ${phone}` : ''}${email ? ` &middot; <a href="mailto:${email}" style="color:#6B5D52;">${email}</a>` : ''}</div>
  <div style="margin-top:10px;font-size:11px;color:#6B5D52;opacity:.75;">This is an automated email.</div>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export function registrationEmailHtml(fname) {
  const firstOrderPct = getSetting('first_order_discount_pct') || 0;
  const promo = firstOrderPct > 0 && getSetting('first_order_discount_active')
    ? `<tr><td style="padding:0 28px 6px;text-align:center;">
  <span style="display:inline-block;background:#FFF4E2;color:#C96A00;border:1px solid #F0D9AE;border-radius:20px;padding:6px 16px;font-size:12px;font-weight:bold;">
    ${firstOrderPct}% off your first order
  </span>
</td></tr>` : '';
  const body = `${promo}
<tr><td align="center" style="padding:22px 28px 6px;">
  <a href="${SITE_URL}" style="display:inline-block;background:#EE8600;color:#2B1600;font-weight:bold;font-size:13.5px;text-decoration:none;padding:12px 26px;border-radius:8px;">Order now</a>
</td></tr>`;
  return emailShell({
    statusText: 'Registration successful',
    title: `Welcome, ${fname}!`,
    subtitle: 'Your account is ready.',
    bodyHtml: body,
  });
}

function itemRowsHtml(items, currency) {
  return (items || []).map(i => `
    <tr>
      <td style="padding:11px 0;font-size:14px;border-bottom:1px solid #E3D9CC;">
        <span style="font-weight:600;">${i.name}</span> <span style="color:#6B5D52;">&times;${i.qty}</span>
      </td>
      <td style="padding:11px 0;font-size:14px;border-bottom:1px solid #E3D9CC;text-align:right;">${(i.price * i.qty).toFixed(2)} ${currency}</td>
    </tr>`).join('');
}

/* To the customer: order confirmation with all customer-relevant details. */
export function orderConfirmationHtml(order) {
  const currency = getSetting('currency') || 'EUR';
  const t = order.totals || {};
  const customer = order.customer || {};
  const modeLabel = order.mode === 'pickup' ? `Pickup${customer.pickupTime ? ', ' + customer.pickupTime : ''}` : 'Delivery';

  const discountRows = [
    t.pickup > 0 ? `<tr><td style="padding:4px 0;font-size:13.5px;color:#3F7A4E;">Pickup discount</td><td style="padding:4px 0;font-size:13.5px;color:#3F7A4E;text-align:right;">&minus;${t.pickup.toFixed(2)} ${currency}</td></tr>` : '',
    t.firstOrder > 0 ? `<tr><td style="padding:4px 0;font-size:13.5px;color:#3F7A4E;">First-order discount</td><td style="padding:4px 0;font-size:13.5px;color:#3F7A4E;text-align:right;">&minus;${t.firstOrder.toFixed(2)} ${currency}</td></tr>` : '',
    t.coupon > 0 ? `<tr><td style="padding:4px 0;font-size:13.5px;color:#3F7A4E;">Coupon</td><td style="padding:4px 0;font-size:13.5px;color:#3F7A4E;text-align:right;">&minus;${t.coupon.toFixed(2)} ${currency}</td></tr>` : '',
    t.delivery > 0 ? `<tr><td style="padding:4px 0;font-size:13.5px;color:#6B5D52;">Delivery</td><td style="padding:4px 0;font-size:13.5px;color:#6B5D52;text-align:right;">${t.delivery.toFixed(2)} ${currency}</td></tr>` : '',
  ].join('');

  const body = `
<tr><td style="padding:0 28px 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3D9CC;border-radius:10px;">
    <tr><td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;"><span style="color:#6B5D52;">Order number</span></td>
        <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;text-align:right;"><b>#${order.orderNum || ''}</b></td></tr>
    <tr><td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;"><span style="color:#6B5D52;">Type</span></td>
        <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;text-align:right;"><b>${modeLabel}</b></td></tr>
    <tr><td style="padding:11px 16px;font-size:13px;"><span style="color:#6B5D52;">Payment</span></td>
        <td style="padding:11px 16px;font-size:13px;text-align:right;"><b>${order.payment || ''}</b></td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 28px 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6B5D52;font-weight:bold;">Your items</td></tr>
<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRowsHtml(order.items, currency)}</table>
</td></tr>

<tr><td style="padding:14px 28px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #E3D9CC;padding-top:10px;">
    <tr><td style="padding:4px 0;font-size:13.5px;color:#6B5D52;">Subtotal</td><td style="padding:4px 0;font-size:13.5px;color:#6B5D52;text-align:right;">${(t.sub || 0).toFixed(2)} ${currency}</td></tr>
    ${discountRows}
    <tr><td style="padding:10px 0 0;font-size:17px;font-weight:bold;border-top:1px solid #E3D9CC;">Total</td>
        <td style="padding:10px 0 0;font-size:17px;font-weight:bold;border-top:1px solid #E3D9CC;text-align:right;">${(t.grand || 0).toFixed(2)} ${currency}</td></tr>
  </table>
</td></tr>`;

  return emailShell({
    statusText: 'Order confirmed',
    title: `Thanks, ${customer.fname || ''} — your order is on its way to the kitchen.`,
    subtitle: 'We are preparing everything fresh for you.',
    bodyHtml: body,
  });
}

/* To the restaurant: full order and customer details for preparation/delivery. */
export function restaurantOrderNotificationHtml(order) {
  const currency = getSetting('currency') || 'EUR';
  const t = order.totals || {};
  const customer = order.customer || {};
  const modeLabel = order.mode === 'pickup' ? `Pickup${customer.pickupTime ? ', ' + customer.pickupTime : ''}` : 'Delivery';

  const body = `
<tr><td style="padding:0 28px 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3D9CC;border-radius:10px;">
    <tr><td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;"><span style="color:#6B5D52;">Order number</span></td>
        <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;text-align:right;"><b>#${order.orderNum || ''}</b></td></tr>
    <tr><td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;"><span style="color:#6B5D52;">Type</span></td>
        <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;text-align:right;"><b>${modeLabel}</b></td></tr>
    <tr><td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;"><span style="color:#6B5D52;">Customer</span></td>
        <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;text-align:right;"><b>${customer.fname || ''} ${customer.lname || ''}</b></td></tr>
    <tr><td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;"><span style="color:#6B5D52;">Phone</span></td>
        <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;text-align:right;"><b>${customer.phone || '—'}</b></td></tr>
    ${order.mode === 'delivery' ? `<tr><td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;"><span style="color:#6B5D52;">Address</span></td>
        <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #E3D9CC;text-align:right;"><b>${customer.address || '—'}</b></td></tr>` : ''}
    <tr><td style="padding:11px 16px;font-size:13px;"><span style="color:#6B5D52;">Payment</span></td>
        <td style="padding:11px 16px;font-size:13px;text-align:right;"><b>${order.payment || ''}</b></td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 28px 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6B5D52;font-weight:bold;">Ordered items</td></tr>
<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRowsHtml(order.items, currency)}</table>
</td></tr>

<tr><td style="padding:14px 28px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #E3D9CC;padding-top:10px;">
    <tr><td style="padding:10px 0 0;font-size:17px;font-weight:bold;">Total</td>
        <td style="padding:10px 0 0;font-size:17px;font-weight:bold;text-align:right;">${(t.grand || 0).toFixed(2)} ${currency}</td></tr>
  </table>
</td></tr>`;

  return emailShell({
    statusText: 'New order',
    statusColor: '#C96A00',
    title: `New order #${order.orderNum || ''}`,
    subtitle: '',
    bodyHtml: body,
  });
}

export function passwordResetEmailHtml(resetUrl) {
  const body = `
<tr><td align="center" style="padding:22px 28px 6px;">
  <a href="${resetUrl}" style="display:inline-block;background:#EE8600;color:#2B1600;font-weight:bold;font-size:13.5px;text-decoration:none;padding:12px 26px;border-radius:8px;">Reset password</a>
</td></tr>
<tr><td align="center" style="padding:10px 28px 0;font-size:12px;color:#6B5D52;">This link expires in 1 hour. If you didn't request this, ignore this email.</td></tr>`;
  return emailShell({ statusText: 'Password reset requested', title: 'Reset your password', subtitle: '', bodyHtml: body });
}

export function verifyEmailHtml(verifyUrl) {
  const body = `
<tr><td align="center" style="padding:22px 28px 6px;">
  <a href="${verifyUrl}" style="display:inline-block;background:#EE8600;color:#2B1600;font-weight:bold;font-size:13.5px;text-decoration:none;padding:12px 26px;border-radius:8px;">Verify email</a>
</td></tr>`;
  return emailShell({ statusText: 'Confirm your email', title: 'Please verify your email address', subtitle: '', bodyHtml: body });
}
