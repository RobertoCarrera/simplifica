-- Attach Audit Triggers to missing tables (clients, tickets, jobs)

-- 1. Clients Table (Crucial for CRM)
DROP TRIGGER IF EXISTS audit_trigger_clients ON public.clients;
CREATE TRIGGER audit_trigger_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();

-- 2. Tickets Table
DROP TRIGGER IF EXISTS audit_trigger_tickets ON public.tickets;
CREATE TRIGGER audit_trigger_tickets AFTER INSERT OR UPDATE OR DELETE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();



-- 4. Storage Objects (If possible/needed? storage.objects is hard to trigger from public schema generally)
-- Skipping storage for now as it requires more permissions.

-- 5. Company Members (To track role changes)
DROP TRIGGER IF EXISTS audit_trigger_company_members ON public.company_members;
CREATE TRIGGER audit_trigger_company_members AFTER INSERT OR UPDATE OR DELETE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();
