-- DocPlanner bookings do not always include a patient email.
-- The NOT NULL constraint was causing silent insert failures in upsertBookingFromDP,
-- leading to "66 synced" counting upserts that never actually reached the DB.
ALTER TABLE public.bookings
  ALTER COLUMN customer_email DROP NOT NULL;
