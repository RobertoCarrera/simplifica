-- Fix: resources were created with Spanish display values from the Angular form.
-- The edge functions filter by type='room'. Map all Spanish values to canonical ones.

-- Drop the check constraint so we can do the UPDATE freely
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_type_check;
ALTER TABLE resources DROP CONSTRAINT IF EXISTS check_resource_type;

-- Room-like types → 'room'
UPDATE resources
  SET type = 'room'
  WHERE type IN ('Sala', 'sala', 'Room', 'Box', 'box', 'Cabina', 'cabina');

-- Equipment-like types → 'equipment'
UPDATE resources
  SET type = 'equipment'
  WHERE type IN ('Equipo', 'equipo', 'Equipment', 'Equipamiento', 'equipamiento',
                 'Vehículo', 'vehiculo', 'Otro', 'otro', 'Other');

-- Any remaining non-standard values: default to 'room'
UPDATE resources
  SET type = 'room'
  WHERE type NOT IN ('room', 'equipment');

-- Re-add the constraint with the canonical values only
ALTER TABLE resources
  ADD CONSTRAINT resources_type_check CHECK (type IN ('room', 'equipment'));

-- Verify
DO $$
DECLARE v_rooms INT; v_equipment INT; v_other INT;
BEGIN
  SELECT COUNT(*) INTO v_rooms FROM resources WHERE type = 'room';
  SELECT COUNT(*) INTO v_equipment FROM resources WHERE type = 'equipment';
  SELECT COUNT(*) INTO v_other FROM resources WHERE type NOT IN ('room', 'equipment');
  RAISE NOTICE 'Resources type=room: %, type=equipment: %, non-standard: %',
    v_rooms, v_equipment, v_other;
END $$;
