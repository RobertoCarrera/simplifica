import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class DatabaseMigrationService {
  constructor(private authService: AuthService) {}

  async applyCheckCompanyFunction() {
    const sql = `
CREATE OR REPLACE FUNCTION check_company_exists(p_company_name TEXT)
RETURNS TABLE(
    company_exists BOOLEAN,
    company_id UUID,
    company_name TEXT,
    owner_email TEXT,
    owner_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXISTS(SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(p_company_name)) as company_exists,
        c.id as company_id,
        c.name as company_name,
        u.email as owner_email,
        u.name as owner_name
    FROM public.companies c
    LEFT JOIN public.users u ON u.company_id = c.id AND u.role = 'owner' AND u.active = true
    WHERE LOWER(c.name) = LOWER(p_company_name)
    LIMIT 1;
END;
$$;`;

    try {
      // Usar el cliente Supabase del AuthService
      const client = this.authService.client;
      const { error } = await client.rpc('exec_sql', { sql });
      
      if (error) {
        console.error('Error applying function:', error);
        return { success: false, error };
      }
      console.log('✅ check_company_exists function applied successfully');
      return { success: true };
    } catch (e) {
      console.error('Error executing SQL:', e);
      return { success: false, error: e };
    }
  }

  async testCheckCompanyFunction() {
    try {
      const client = this.authService.client;
      const { data, error } = await client.rpc('check_company_exists', { 
        p_company_name: 'Digitalizamos tu PYME' 
      });
      
      if (error) {
        console.error('Error testing function:', error);
        return { success: false, error };
      }
      
      console.log('Test result:', data);
      return { success: true, data };
    } catch (e) {
      console.error('Error testing function:', e);
      return { success: false, error: e };
    }
  }
}
