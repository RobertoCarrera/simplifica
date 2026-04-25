-- RPC: Bulk assign resource_id to all unlinked (resource_id IS NULL) bookings for a professional
-- Excludes cancelled bookings. Returns {updated: N}
CREATE OR REPLACE FUNCTION bulk_assign_unlinked_bookings(
    p_professional_id UUID,
    p_resource_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE bookings
    SET resource_id = p_resource_id,
        updated_at = NOW()
    WHERE professional_id = p_professional_id
      AND resource_id IS NULL
      AND status != 'cancelled';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object('updated', v_updated_count);
END;
$$;

-- Grant execute to authenticated users (RLS handles company isolation)
GRANT EXECUTE ON FUNCTION bulk_assign_unlinked_bookings TO authenticated;
