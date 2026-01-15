import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface Employee {
    id: string;
    company_id: string;
    user_id?: string;
    nif?: string;
    social_security_number?: string;
    iban?: string;
    job_title?: string;
    hire_date?: string;
    contract_type?: 'indefinido' | 'temporal' | 'autonomo';
    salary_base?: number;
    commission_rate?: number;
    is_active: boolean;
    created_at: string;
    user?: {
        name: string;
        surname: string;
        email: string;
        avatar_url?: string;
    };
}

export interface EmployeeDocument {
    id: string;
    employee_id: string;
    name: string;
    file_path: string;
    file_type?: string;
    uploaded_at: string;
}

export interface Service {
    id: string;
    name: string;
    description?: string;
    base_price?: number;
}

export interface CommissionConfig {
    id?: string; // Optional for new records
    company_id: string;
    employee_id: string;
    service_id: string;
    commission_percentage: number;
    fixed_amount: number;
    service?: Service; // Joined data
    created_at?: string;
    updated_at?: string;
}

@Injectable({
    providedIn: 'root'
})
export class EmployeeService {
    private supabase = inject(SupabaseClientService).instance;

    /**
     * Get all employees for the current company
     */
    getEmployees(companyId: string): Observable<Employee[]> {
        const query = this.supabase
            .from('employees')
            .select(`
                *,
                user:user_id(name, surname, email)
            `)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        return from(query).pipe(
            map((res) => {
                const { data, error } = res;
                if (error) throw error;
                return (data || []) as Employee[];
            }),
            catchError(err => {
                console.error('Error fetching employees:', err);
                return of([]);
            })
        );
    }

    /**
     * Create a new employee profile
     */
    async createEmployee(employee: Partial<Employee>): Promise<Employee> {
        const { data, error } = await this.supabase
            .from('employees')
            .insert(employee)
            .select()
            .single();

        if (error) throw error;
        return data as Employee;
    }

    /**
     * Update employee
     */
    async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
        const { data, error } = await this.supabase
            .from('employees')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Employee;
    }

    /**
     * Get employee documents
     */
    async getDocuments(employeeId: string): Promise<EmployeeDocument[]> {
        const { data, error } = await this.supabase
            .from('employee_documents')
            .select('*')
            .eq('employee_id', employeeId)
            .order('uploaded_at', { ascending: false });

        if (error) throw error;
        return (data || []) as EmployeeDocument[];
    }

    /**
     * Upload a document
     */
    async uploadDocument(employeeId: string, companyId: string, file: File): Promise<EmployeeDocument | null> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${companyId}/${employeeId}/${fileName}`;

        // 1. Upload to Storage
        const { error: uploadError } = await this.supabase.storage
            .from('hr-documents')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Register in DB
        const { data, error: dbError } = await this.supabase
            .from('employee_documents')
            .insert({
                employee_id: employeeId,
                company_id: companyId,
                name: file.name,
                file_path: filePath,
                file_type: fileExt
            })
            .select()
            .single();

        if (dbError) throw dbError;
        return data as EmployeeDocument;
    }

    /**
     * Get signed URL for download
     */
    async getDownloadUrl(path: string): Promise<string | null> {
        const { data, error } = await this.supabase.storage
            .from('hr-documents')
            .createSignedUrl(path, 60 * 60); // 1 hour

        if (error) {
            console.error('Error creating signed URL', error);
            return null;
        }
        return data.signedUrl;
    }

    /**
    * Delete document
    */
    async deleteDocument(id: string, path: string): Promise<void> {
        // 1. Delete from Storage
        const { error: storageError } = await this.supabase.storage
            .from('hr-documents')
            .remove([path]);

        if (storageError) console.error('Error deleting from storage', storageError);

        // 2. Delete from DB
        const { error: dbError } = await this.supabase
            .from('employee_documents')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;
    }

    // --- Commissions & Services ---

    /**
     * Get all services for the current company (to handle dropdowns)
     */
    async getServices(companyId: string): Promise<Service[]> {
        const { data, error } = await this.supabase
            .from('services') // Assuming 'services' table exists
            .select('id, name, description, base_price(price)') // Adjust mapping if needed
            .eq('company_id', companyId) // Services usually linked to company
            .order('name');

        // Note: Check actual service table structure if 'base_price' is a relation or column
        // For now assuming simple structure or adaptation

        if (error) {
            console.warn('Error fetching services (maybe table name differs?):', error);
            return [];
        }
        return data.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            base_price: typeof s.base_price === 'object' ? s.base_price?.price : s.base_price
        })) as Service[];
    }

    /**
     * Get commissions config for an employee
     */
    async getCommissionsConfig(employeeId: string): Promise<CommissionConfig[]> {
        const { data, error } = await this.supabase
            .from('employee_commissions_config')
            .select(`
                *,
                service:service_id (id, name, base_price)
            `)
            .eq('employee_id', employeeId);

        if (error) throw error;
        return (data || []) as CommissionConfig[];
    }

    /**
     * Upsert commission config
     */
    async upsertCommissionConfig(config: Partial<CommissionConfig>): Promise<CommissionConfig> {
        // Remove 'service' joined object if present before upserting
        const { service, ...upsertData } = config as any;

        const { data, error } = await this.supabase
            .from('employee_commissions_config')
            .upsert(upsertData)
            .select()
            .single();

        if (error) throw error;
        return data as CommissionConfig;
    }

    /**
   * Delete commission config
   */
    async deleteCommissionConfig(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('employee_commissions_config')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
}
