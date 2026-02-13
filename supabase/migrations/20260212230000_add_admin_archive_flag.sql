-- Add is_internal_archived column to projects table
ALTER TABLE public.projects 
ADD COLUMN is_internal_archived BOOLEAN DEFAULT FALSE;

-- Add comment to explain the column
COMMENT ON COLUMN public.projects.is_internal_archived IS 'If true, this project is hidden from admin/staff dashboards but remains visible to clients. Used for decluttering admin views while maintaining client visibility.';
