// _shared/validation.ts
// Shared Zod-based input validation middleware for Edge Functions.
// Provides a `withValidation` HOF and reusable schemas for public endpoints.
//
// Usage:
//   import { withValidation, BookingSchema } from '../_shared/validation.ts';
//   Deno.serve(withValidation(BookingSchema, async (req, data) => { ... }));

// @ts-nocheck
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Schema for POST body of booking-public. Accepts multiple actions
 * (create-booking, create-lead) so the BFF can dispatch on `action`
 * after the shared validation passes. The action-specific branches
 * inside the EF re-validate their own required fields, so most of
 * the per-action fields are optional at the schema level. */
export const BookingSchema = z
  .object({
    action: z.enum(['create-booking', 'create-lead']),
    turnstile_token: z.string().min(1, 'turnstile_token is required').max(2000),
    company_slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'company_slug must be lowercase alphanumeric with hyphens')
      .min(1)
      .max(100),
    // ── create-booking specific (also reused by create-lead for `service_id`) ──
    booking_type_id: z.string().uuid('booking_type_id must be a valid UUID').optional(),
    service_id: z.string().uuid('service_id must be a valid UUID').optional(),
    client_name: z.string().min(1).max(200).optional(),
    client_email: z.string().email().max(320).optional(),
    client_phone: z.string().regex(/^[+]?[0-9\s\-\(\)]{1,50}$/).optional(),
    requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    requested_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    professional_id: z.string().uuid().optional(),
    // ── create-lead specific ──
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    email: z.string().email().max(320).optional(),
    phone: z.string().regex(/^[+]?[0-9\s\-\(\)]{1,50}$/).optional(),
    message: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
    // ── shared optional fields ──
    variant_id: z.string().uuid().optional(),
    variant_pricing_snapshot: z
      .object({
        base_price: z.number().nonnegative(),
        billing_period: z.enum(['monthly', 'annual', 'one_time', 'session', 'custom']),
        estimated_hours: z.number().nonnegative().optional(),
        discount_percentage: z.number().min(0).max(100).optional(),
      })
      .optional(),
  })
  .strict();

/** Schema for GET/POST body of public-payment-info */
export const PaymentInfoSchema = z.object({
  token: z.string().uuid('token must be a valid UUID'),
}).strict();

/** Schema for POST body of public-payment-redirect */
export const PaymentRedirectSchema = z.object({
  token: z.string().uuid('token must be a valid UUID'),
  provider: z.enum(['paypal', 'stripe', 'local']).optional(),
}).strict();

// ─────────────────────────────────────────────────────────────────────────────
// Middleware HOF
// ─────────────────────────────────────────────────────────────────────────────

type ValidatedHandler<T> = (req: Request, data: T) => Promise<Response>;

/**
 * Higher-order function that wraps an Edge Function handler with Zod validation.
 *
 * It reads the request body as JSON, validates it against `schema`, and calls
 * `handler(req, validatedData)` on success. On validation failure it returns
 * HTTP 400 with a structured error payload — no internal details are leaked.
 *
 * Note: The request body is consumed by this wrapper. The original `req.json()`
 * must NOT be called again inside `handler`. Use the `data` argument instead.
 *
 * @param schema  A Zod schema to validate the parsed body against.
 * @param handler The actual request handler that receives the validated data.
 */
export function withValidation<T extends z.ZodType>(
  schema: T,
  handler: ValidatedHandler<z.infer<T>>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body — expected JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      // Return the first validation error message — safe to expose to callers.
      const firstError = result.error.errors[0];
      const message = firstError
        ? `${firstError.path.join('.') || 'input'}: ${firstError.message}`
        : 'Validation failed';
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return handler(req, result.data);
  };
}

export { z };
