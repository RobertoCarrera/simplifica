-- Analytics RPCs for Dashboard

-- 1. Occupancy Rate (Heatmap Data)
-- Returns count of bookings per day_of_week (0-6) and hour (0-23)
CREATE OR REPLACE FUNCTION f_analytics_occupancy_heatmap(
  p_company_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT (now() - interval '30 days'),
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS TABLE (
  day_of_week INTEGER,
  hour_of_day INTEGER,
  booking_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(DOW FROM start_time)::INTEGER as day_of_week,
    EXTRACT(HOUR FROM start_time)::INTEGER as hour_of_day,
    COUNT(*) as booking_count
  FROM bookings
  WHERE company_id = p_company_id
    AND start_time >= p_start_date
    AND start_time <= p_end_date
    AND status NOT IN ('cancelled', 'no_show')
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

-- 2. Revenue Forecast (Confirmed Bookings)
-- Returns projected revenue for the next 30 days vs previous 30 days
CREATE OR REPLACE FUNCTION f_analytics_revenue_forecast(
  p_company_id UUID
)
RETURNS TABLE (
  period TEXT, -- 'past_30d', 'next_30d'
  total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 'past_30d' as period, COALESCE(SUM(total_price), 0)
  FROM bookings
  WHERE company_id = p_company_id
    AND start_time >= (now() - interval '30 days')
    AND start_time < now()
    AND status IN ('completed', 'confirmed', 'paid')
  UNION ALL
  SELECT 'next_30d' as period, COALESCE(SUM(total_price), 0)
  FROM bookings
  WHERE company_id = p_company_id
    AND start_time >= now()
    AND start_time <= (now() + interval '30 days')
    AND status IN ('confirmed', 'pending_payment');
END;
$$;

-- 3. Top Performers (Staff Leaderboard)
CREATE OR REPLACE FUNCTION f_analytics_top_performers(
  p_company_id UUID,
  p_month_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  professional_id UUID,
  professional_name TEXT,
  bookings_count BIGINT,
  total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.professional_id,
    u.name as professional_name,
    COUNT(*) as bookings_count,
    COALESCE(SUM(b.total_price), 0) as total_revenue
  FROM bookings b
  JOIN company_members cm ON b.professional_id = cm.id
  JOIN users u ON cm.user_id = u.id
  WHERE b.company_id = p_company_id
    AND date_trunc('month', b.start_time) = date_trunc('month', p_month_date)
    AND b.status NOT IN ('cancelled')
  GROUP BY b.professional_id, u.name
  ORDER BY total_revenue DESC
  LIMIT 5;
END;
$$;
