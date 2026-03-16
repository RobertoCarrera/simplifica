const TRUSTED_PAYMENT_DOMAINS = [
  'paypal.com',
  'www.paypal.com',
  'sandbox.paypal.com',
  'stripe.com',
  'checkout.stripe.com',
  'pay.stripe.com',
];

export function isTrustedPaymentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return TRUSTED_PAYMENT_DOMAINS.some(
      (d) => parsed.hostname === d
    );
  } catch {
    return false;
  }
}
