-- Add 'client' to the allowed roles in company_invitations
ALTER TABLE "public"."company_invitations" DROP CONSTRAINT "company_invitations_role_check";

ALTER TABLE "public"."company_invitations" ADD CONSTRAINT "company_invitations_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'professional'::text, 'agent'::text, 'client'::text]));
