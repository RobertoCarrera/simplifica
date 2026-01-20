-- Create enum for content status
CREATE TYPE content_status AS ENUM ('idea', 'copy', 'design', 'review', 'scheduled', 'published');

-- Create content_posts table
CREATE TABLE content_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  title TEXT NOT NULL,
  status content_status DEFAULT 'idea',
  platform TEXT NOT NULL, -- 'instagram', 'tiktok', 'blog', etc.
  scheduled_date TIMESTAMP WITH TIME ZONE,
  content_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for company users" ON content_posts
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id IN (
        SELECT id FROM public.users WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Enable insert access for company users" ON content_posts
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id IN (
        SELECT id FROM public.users WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Enable update access for company users" ON content_posts
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id IN (
        SELECT id FROM public.users WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Enable delete access for company users" ON content_posts
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id IN (
        SELECT id FROM public.users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Grant permissions
GRANT ALL ON content_posts TO authenticated;
GRANT ALL ON content_posts TO service_role;
