/* Shared cart/discount calculation engine — the same logic the storefront
   uses client-side for instant feedback, run again here so the server is
   always the authoritative source of truth for what a customer actually
   pays (a client can never talk itself into a bigger discount than the
   business rules configured in the admin panel allow).

   All percentages/thresholds come from restaurant_settings (admin-panel
   configurable) and delivery_zones/coupons tables — nothing here is
   hardcoded per restaurant. Field names (pickup_discount_pct,
   first_order_discount_pct, min_order_delivery, free_item_threshold)
   mirror the discount concepts documented in TEMPLATE_CUSTOMIZATION.md. */

export function calculateTotals({ items, mode, deliveryZone, settings, coupon, isFirstOrderEligible }) {
  const sub = round2(items.reduce((sum, i) => sum + i.price * i.qty, 0));

  let pickupDiscount = 0;
  if (mode === 'pickup' && settings.pickup_discount_active) {
    pickupDiscount = round2(sub * (settings.pickup_discount_pct / 100));
  }

  let firstOrderDiscount = 0;
  if (settings.first_order_discount_active && isFirstOrderEligible) {
    if (!pickupDiscount || settings.discounts_stack) {
      firstOrderDiscount = round2(sub * (settings.first_order_discount_pct / 100));
    }
  }

  let couponDiscount = 0;
  if (coupon && coupon.active) {
    const eligible = !coupon.min_order || sub >= coupon.min_order;
    if (eligible && (!pickupDiscount && !firstOrderDiscount || settings.discounts_stack)) {
      couponDiscount = coupon.type === 'percent'
        ? round2(sub * (coupon.value / 100))
        : round2(Math.min(coupon.value, sub));
    }
  }

  const deliveryFee = mode === 'delivery' && deliveryZone ? deliveryZone.fee : 0;
  const deliveryBlocked = mode === 'delivery' && settings.min_order_delivery > 0 && sub < settings.min_order_delivery;

  const totalDiscount = round2(pickupDiscount + firstOrderDiscount + couponDiscount);
  const grand = round2(Math.max(0, sub - totalDiscount) + deliveryFee);

  return {
    sub,
    pickup: pickupDiscount,
    firstOrder: firstOrderDiscount,
    coupon: couponDiscount,
    delivery: deliveryFee,
    grand,
    deliveryBlocked,
    minOrderDelivery: settings.min_order_delivery,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
