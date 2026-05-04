-- Fix bookings with total_price = 0 or null by taking base_price from the associated service
UPDATE public.bookings
SET
  total_price = COALESCE(
    (SELECT s.base_price FROM public.services s WHERE s.id = bookings.service_id AND s.base_price IS NOT NULL AND s.base_price > 0 LIMIT 1),
    bookings.total_price
  )
WHERE
  (total_price IS NULL OR total_price = 0)
  AND service_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = bookings.service_id AND s.base_price IS NOT NULL AND s.base_price > 0
  );
