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

/** Schema for POST body of booking-public (action === 'create-booking') */
export const BookingSchema = z.object({
  action: z.literal('create-booking'),
  turnstile_token: z.string().min(1, 'turnstile_token is required'),
  company_slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'company_slug must be lowercase alphanumeric with hyphens'),
  booking_type_id: z.string().uuid('booking_type_id must be a valid UUID'),
  client_name: z.string().min(1).max(200),
  client_email: z.string().email('client_email must be a valid email address'),
  client_phone: z.string().max(50).optional(),
  requested_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'requested_date must be in YYYY-MM-DD format'),
  requested_time: z.string().regex(/^\d{2}:\d{2}$/, 'requested_time must be in HH:MM format'),
  professional_id: z.string().uuid('professional_id must be a valid UUID').optional(),
});

/** Schema for GET/POST body of public-payment-info */
export const PaymentInfoSchema = z.object({
  token: z.string().uuid('token must be a valid UUID'),
});

/** Schema for POST body of public-payment-redirect */
export const PaymentRedirectSchema = z.object({
  token: z.string().uuid('token must be a valid UUID'),
  provider: z.enum(['paypal', 'stripe', 'local']).optional(),
});

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
