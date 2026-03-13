-- Update RLS policies to strictly separate 'owner' from 'admin'/'super_admin' on global tables

-- 1. Domains: Owners should only manage their OWN domains. Wait, 'domains' is a global table.
-- If 'domains' relates to mail domains for the system.
