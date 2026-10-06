/**
 * Constants used across the app.
 * Centralized to avoid magic numbers and hardcoded values.
 */

// === Cart / Brinde / Kit ===

/** Subtotal threshold for free gift (brinde) in BRL */
export const BRINDE_THRESHOLD = 199;

/** Brand kit promo: 3 BRAND perfumes of same gender = this price */
export const BRAND_KIT_PRICE = 195;

/** Brand kit promo: quantity of BRAND perfumes needed for kit */
export const BRAND_KIT_QTY = 3;

// === Pricing (defaults, overridden by D1 product data) ===

/** Default price for BRAND collection 25ml perfumes */
export { DEFAULT_PRICE_BRAND, DEFAULT_PRICE_AFEER, DEFAULT_PRICE_DECANTE } from "./perfumes";

// === Decante Promo ===

/** Decante promo: 3 decantes = this price */
export const DECANTE_PROMO_PRICE = 100;

/** Decante promo: quantity needed */
export const DECANTE_PROMO_QTY = 3;
