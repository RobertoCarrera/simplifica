
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'services';

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'company_settings';

SELECT unnest(enum_range(NULL::quote_status));
