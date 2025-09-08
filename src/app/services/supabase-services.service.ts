import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';

export interface Service {
  id: string;
  name: string;
  description: string;
  base_price: number;
  estimated_hours: number;
  category?: string;
  is_active: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceStats {
  total: number;
  active: number;
  averagePrice: number;
  averageHours: number;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseServicesService {
  
  private supabase = inject(SimpleSupabaseService);
  private currentCompanyId = '1'; // Default para desarrollo

  constructor() {
    console.log('🔧 SupabaseServicesService initialized');
  }

  async getServices(companyId?: number): Promise<Service[]> {
    try {
      const targetCompanyId = companyId || parseInt(this.currentCompanyId);
      console.log(`🔧 Getting services for company ID: ${targetCompanyId}`);
      
      // Usar tabla works existente como fuente principal
      console.log('🔧 Using works table as primary source...');
      return this.getServicesFromWorks(targetCompanyId);
    } catch (error) {
      console.error('❌ Error getting services:', error);
      throw error;
    }
  }

  private async getServicesFromWorks(companyId: number): Promise<Service[]> {
    const { data: works, error } = await this.supabase.getClient()
      .from('works')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform works data to services format
    return (works || []).map(work => ({
      id: work.id,
      name: work.name,
      description: work.description || '',
      base_price: work.base_price || 0,
      estimated_hours: work.estimated_hours || 0,
      category: 'Servicio Técnico',
      is_active: true,
      company_id: companyId.toString(),
      created_at: work.created_at,
      updated_at: work.updated_at || work.created_at
    }));
  }

  async createService(serviceData: Partial<Service>): Promise<Service> {
    // Usar tabla works para la persistencia
    const workData = {
      name: serviceData.name,
      description: serviceData.description,
      base_price: serviceData.base_price,
      estimated_hours: serviceData.estimated_hours
    };

    const { data, error } = await this.supabase.getClient()
      .from('works')
      .insert([workData])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      base_price: data.base_price || 0,
      estimated_hours: data.estimated_hours || 0,
      category: serviceData.category || 'Servicio Técnico',
      is_active: true,
      company_id: this.currentCompanyId,
      created_at: data.created_at,
      updated_at: data.updated_at || data.created_at
    };
  }

  async updateService(id: string, updates: Partial<Service>): Promise<Service> {
    const workData = {
      name: updates.name,
      description: updates.description,
      base_price: updates.base_price,
      estimated_hours: updates.estimated_hours,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase.getClient()
      .from('works')
      .update(workData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      base_price: data.base_price || 0,
      estimated_hours: data.estimated_hours || 0,
      category: updates.category || 'Servicio Técnico',
      is_active: updates.is_active !== false,
      company_id: this.currentCompanyId,
      created_at: data.created_at,
      updated_at: data.updated_at || data.created_at
    };
  }

  async deleteService(id: string): Promise<void> {
    // Soft delete en tabla works
    const { error } = await this.supabase.getClient()
      .from('works')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  async toggleServiceStatus(id: string): Promise<Service> {
    // Para works table, solo simulamos el toggle
    const services = await this.getServices();
    const service = services.find(s => s.id === id);
    if (!service) throw new Error('Service not found');

    // En works no tenemos is_active, así que solo retornamos el servicio
    return service;
  }

  async duplicateService(id: string): Promise<Service> {
    const services = await this.getServices();
    const service = services.find(s => s.id === id);
    if (!service) throw new Error('Service not found');

    const duplicatedService = {
      name: `${service.name} (Copia)`,
      description: service.description,
      base_price: service.base_price,
      estimated_hours: service.estimated_hours,
      category: service.category
    };

    return this.createService(duplicatedService);
  }

  async getServicesByCategory(category: string): Promise<Service[]> {
    const services = await this.getServices();
    return services.filter(service => service.category === category);
  }

  async getActiveServices(): Promise<Service[]> {
    const services = await this.getServices();
    return services.filter(service => service.is_active);
  }

  async searchServices(searchTerm: string): Promise<Service[]> {
    const services = await this.getServices();
    const term = searchTerm.toLowerCase();
    return services.filter(service => 
      service.name.toLowerCase().includes(term) ||
      service.description.toLowerCase().includes(term) ||
      service.category?.toLowerCase().includes(term)
    );
  }

  async getServiceStats(): Promise<ServiceStats> {
    const services = await this.getServices();
    
    return {
      total: services.length,
      active: services.filter(s => s.is_active).length,
      averagePrice: services.length > 0 
        ? services.reduce((sum, s) => sum + s.base_price, 0) / services.length 
        : 0,
      averageHours: services.length > 0 
        ? services.reduce((sum, s) => sum + s.estimated_hours, 0) / services.length 
        : 0
    };
  }

  async getCategories(): Promise<string[]> {
    const services = await this.getServices();
    const categories = [...new Set(services.map(s => s.category).filter((cat): cat is string => Boolean(cat)))];
    return categories.sort();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  formatHours(hours: number): string {
    return `${hours}h`;
  }

  calculateHourlyRate(basePrice: number, estimatedHours: number): number {
    if (!basePrice || !estimatedHours || estimatedHours === 0) return 0;
    return basePrice / estimatedHours;
  }

  // Dev methods for multi-company support
  setCompanyId(companyId: string): void {
    this.currentCompanyId = companyId;
    console.log(`🔧 Company ID set to: ${companyId}`);
  }

  getCurrentCompanyId(): string {
    return this.currentCompanyId;
  }
}
