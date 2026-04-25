-- Step 1: Create retention_policies table
CREATE TABLE IF NOT EXISTS retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) UNIQUE NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  id_column VARCHAR(50) DEFAULT 'id',
  created_at_column VARCHAR(50) DEFAULT 'created_at',
  retention_days INTEGER NOT NULL,
  legal_basis VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Seed retention policies data
INSERT INTO retention_policies (category, table_name, id_column, created_at_column, retention_days, legal_basis, description, is_active) VALUES
('customers', 'clients', 'id', 'created_at', 1095, 'Art. 1964 Código Civil', 'Datos de clientes: 3 años desde última actividad', true),
('invoices', 'invoices', 'id', 'created_at', 1460, 'Arts. 66-70 Ley General Tributaria', 'Facturas emitidas: 4 años para auditoría fiscal', true),
('quotes', 'quotes', 'id', 'created_at', 1460, 'Código de Comercio', 'Presupuestos: 4 años para obligaciones mercantiles', true),
('bookings', 'bookings', 'id', 'created_at', 1095, 'Contractual', 'Citas y reservas: 3 años por prescripción contractual', true),
('clinical_notes', 'booking_clinical_notes', 'id', 'created_at', 1825, 'Art. 17 Ley 41/2002', 'Notas clínicas: 5 años según ley de autonomía del paciente', true),
('client_notes', 'client_clinical_notes', 'id', 'created_at', 1825, 'Art. 17 Ley 41/2002', 'Notas clínicas de cliente: 5 años según ley de autonomía', true),
('documents', 'booking_documents', 'id', 'created_at', 1825, 'Registros sanitarios', 'Documentos clínicos: 5 años como historia clínica', true),
('consents', 'gdpr_consent_records', 'id', 'created_at', 730, 'Art. 7 RGPD', 'Consentimientos GDPR: hasta revocación + 2 años', true),
('audit_logs', 'audit_logs', 'id', 'created_at', 3650, 'RGPD Art. 5.2 Accountability', 'Logs de auditoría: 10 años para responsabilidad', true)
ON CONFLICT (category) DO UPDATE SET
  table_name = EXCLUDED.table_name,
  retention_days = EXCLUDED.retention_days,
  legal_basis = EXCLUDED.legal_basis,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Step 3: Create trigger function
CREATE OR REPLACE FUNCTION check_retention_before_delete()
RETURNS TRIGGER AS $$
DECLARE
  policy_record RECORD;
  record_created_at TIMESTAMPTZ;
  cutoff_date TIMESTAMPTZ;
BEGIN
  SELECT * INTO policy_record 
  FROM retention_policies 
  WHERE table_name = TG_TABLE_NAME AND is_active = true;
  
  IF policy_record IS NULL THEN
    RETURN OLD;
  END IF;
  
  EXECUTE format('SELECT $1.%I', policy_record.created_at_column) 
    USING OLD 
    INTO record_created_at;
  
  IF record_created_at IS NULL THEN
    RETURN OLD;
  END IF;
  
  cutoff_date := now() - (policy_record.retention_days || ' days')::INTERVAL;
  
  IF record_created_at > cutoff_date THEN
    RAISE EXCEPTION 'No se puede eliminar: datos protegidos por requisito legal (%). Datos retenidos hasta %.', 
      policy_record.legal_basis,
      (record_created_at + (policy_record.retention_days || ' days')::INTERVAL)::date;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create triggers
DROP TRIGGER IF EXISTS trg_check_retention_clients ON clients;
CREATE TRIGGER trg_check_retention_clients
  BEFORE DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete();

DROP TRIGGER IF EXISTS trg_check_retention_invoices ON invoices;
CREATE TRIGGER trg_check_retention_invoices
  BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete();

DROP TRIGGER IF EXISTS trg_check_retention_quotes ON quotes;
CREATE TRIGGER trg_check_retention_quotes
  BEFORE DELETE ON quotes
  FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete();

DROP TRIGGER IF EXISTS trg_check_retention_bookings ON bookings;
CREATE TRIGGER trg_check_retention_bookings
  BEFORE DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_clinical_notes') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_check_retention_booking_clinical_notes ON booking_clinical_notes';
    EXECUTE 'CREATE TRIGGER trg_check_retention_booking_clinical_notes BEFORE DELETE ON booking_clinical_notes FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete()';
  ELSE
    RAISE NOTICE 'retention_policies: skipped trigger booking_clinical_notes — table does not exist';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_check_retention_client_clinical_notes ON client_clinical_notes;
CREATE TRIGGER trg_check_retention_client_clinical_notes
  BEFORE DELETE ON client_clinical_notes
  FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_documents') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_check_retention_booking_documents ON booking_documents';
    EXECUTE 'CREATE TRIGGER trg_check_retention_booking_documents BEFORE DELETE ON booking_documents FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete()';
  ELSE
    RAISE NOTICE 'retention_policies: skipped trigger booking_documents — table does not exist';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_check_retention_gdpr_consent_records ON gdpr_consent_records;
CREATE TRIGGER trg_check_retention_gdpr_consent_records
  BEFORE DELETE ON gdpr_consent_records
  FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_check_retention_audit_logs ON audit_logs';
    EXECUTE 'CREATE TRIGGER trg_check_retention_audit_logs BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION check_retention_before_delete()';
  ELSE
    RAISE NOTICE 'retention_policies: skipped trigger audit_logs — table does not exist';
  END IF;
END $$;