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
  
  // Campos para presupuestos y facturación
  tax_rate?: number;
  unit_type?: string;
  min_quantity?: number;
  max_quantity?: number;
  
  // Campos para analíticas y métricas
  difficulty_level?: number;
  profit_margin?: number;
  cost_price?: number;
  
  // Campos adicionales para gestión
  requires_parts?: boolean;
  requires_diagnosis?: boolean;
  warranty_days?: number;
  skill_requirements?: string[];
  tools_required?: string[];
  
  // Campos para ubicación y disponibilidad
  can_be_remote?: boolean;
  priority_level?: number;
  
  // Campos para tags
  tags?: string[];
}

export interface ServiceCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  description?: string;
  company_id: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  company_id: string;
  is_active: boolean;
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

  async getServices(companyId?: string): Promise<Service[]> {
    try {
      const targetCompanyId = companyId || this.currentCompanyId;
      console.log(`🔧 Getting services for company ID: ${targetCompanyId}`);
      
      // Usar tabla services existente como fuente principal
      console.log('🔧 Using services table as primary source...');
      return this.getServicesFromTable(targetCompanyId);
    } catch (error) {
      console.error('❌ Error getting services:', error);
      throw error;
    }
  }

  async getServiceCategories(companyId: string): Promise<ServiceCategory[]> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('service_categories')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error getting service categories:', error);
      throw error;
    }
  }

  async createServiceCategory(category: Partial<ServiceCategory>): Promise<ServiceCategory> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('service_categories')
        .insert([category])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Error creating service category:', error);
      throw error;
    }
  }

  async findOrCreateCategory(categoryName: string, companyId: string): Promise<ServiceCategory> {
    try {
      // Buscar categoría existente con comparación normalizada
      const categories = await this.getServiceCategories(companyId);
      const normalizedSearch = this.normalizeText(categoryName);
      
      const existing = categories.find(cat => 
        this.normalizeText(cat.name) === normalizedSearch
      );

      if (existing) {
        return existing;
      }

      // Crear nueva categoría
      const newCategory: Partial<ServiceCategory> = {
        name: categoryName,
        company_id: companyId,
        color: this.generateCategoryColor(categoryName),
        icon: this.generateCategoryIcon(categoryName),
        description: `Categoría creada automáticamente: ${categoryName}`,
        is_active: true,
        sort_order: categories.length
      };

      return await this.createServiceCategory(newCategory);
    } catch (error) {
      console.error('❌ Error finding or creating category:', error);
      throw error;
    }
  }

  // Normalizar texto para búsqueda insensible a mayúsculas y acentos
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .trim();
  }

  private generateCategoryColor(categoryName: string): string {
    const colors = [
      '#3b82f6', '#059669', '#d97706', '#dc2626', '#7c3aed',
      '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ef4444'
    ];
    
    // Generar color basado en el hash del nombre
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
      hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  private generateCategoryIcon(categoryName: string): string {
    const iconMap: Record<string, string> = {
      'diagnóstico': 'fas fa-search',
      'software': 'fas fa-code',
      'mantenimiento': 'fas fa-tools',
      'datos': 'fas fa-database',
      'seguridad': 'fas fa-shield-alt',
      'hardware': 'fas fa-microchip',
      'redes': 'fas fa-network-wired',
      'formación': 'fas fa-graduation-cap',
      'consultoría': 'fas fa-lightbulb',
      'backup': 'fas fa-save',
      'virus': 'fas fa-bug',
      'instalación': 'fas fa-download',
      'configuración': 'fas fa-cogs',
      'limpieza': 'fas fa-broom'
    };

    const lowerName = categoryName.toLowerCase();
    for (const [key, icon] of Object.entries(iconMap)) {
      if (lowerName.includes(key)) {
        return icon;
      }
    }
    
    return 'fas fa-cog'; // Default icon
  }

  private async getServicesFromTable(companyId: string): Promise<Service[]> {
    const { data: services, error } = await this.supabase.getClient()
      .from('services')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform services data to services format
    return (services || []).map(service => ({
      id: service.id,
      name: service.name,
      description: service.description || '',
      base_price: service.base_price || 0,
      estimated_hours: service.estimated_hours || 0,
      category: service.category || 'Servicio Técnico',
      is_active: service.is_active !== undefined ? service.is_active : true, // Usar campo is_active de la BD
      // Preferir company_id almacenado en service cuando exista
      company_id: service.company_id ? service.company_id : companyId.toString(),
      created_at: service.created_at,
      updated_at: service.updated_at || service.created_at
    }));
  }

  async createService(serviceData: Partial<Service>): Promise<Service> {
    // Usar tabla services para la persistencia
    const serviceDataForDB: any = {
      name: serviceData.name,
      description: serviceData.description,
      base_price: serviceData.base_price,
      estimated_hours: serviceData.estimated_hours
    };

    if (serviceData.company_id) serviceDataForDB.company_id = serviceData.company_id;

    const { data, error } = await this.supabase.getClient()
      .from('services')
      .insert([serviceDataForDB])
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
      company_id: serviceData.company_id || this.currentCompanyId,
      created_at: data.created_at,
      updated_at: data.updated_at || data.created_at
    };
  }

  async updateService(id: string, updates: Partial<Service>): Promise<Service> {
    const serviceData: any = {
      name: updates.name,
      description: updates.description,
      base_price: updates.base_price,
      estimated_hours: updates.estimated_hours,
      updated_at: new Date().toISOString()
    };
    if (updates.company_id) serviceData.company_id = updates.company_id;

    const { data, error } = await this.supabase.getClient()
      .from('services')
      .update(serviceData)
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
      company_id: updates.company_id || this.currentCompanyId,
      created_at: data.created_at,
      updated_at: data.updated_at || data.created_at
    };
  }

  async deleteService(id: string): Promise<void> {
    // Soft delete en tabla services
    const { error } = await this.supabase.getClient()
      .from('services')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  async toggleServiceStatus(id: string): Promise<Service> {
    console.log(`🔧 Toggling service status for ID: ${id}`);
    
    // Primero obtenemos el servicio actual
    const { data: currentService, error: fetchError } = await this.supabase.getClient()
      .from('services')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!currentService) throw new Error('Service not found');

    // Cambiamos el estado
    const newStatus = !currentService.is_active;
    
    const { data, error } = await this.supabase.getClient()
      .from('services')
      .update({ is_active: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Retornamos el servicio actualizado en el formato correcto
    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      base_price: data.base_price || 0,
      estimated_hours: data.estimated_hours || 0,
      category: data.category || 'Servicio Técnico',
      is_active: data.is_active,
  company_id: data.company_id || this.currentCompanyId,
      created_at: data.created_at,
      updated_at: data.updated_at || data.created_at
    };
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

  // ====================================
  // MÉTODOS PARA GESTIÓN DE TAGS
  // ====================================

  async getServiceTags(companyId: string): Promise<ServiceTag[]> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('service_tags')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error getting service tags:', error);
      throw error;
    }
  }

  async createServiceTag(tag: Partial<ServiceTag>): Promise<ServiceTag> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('service_tags')
        .insert([{
          name: tag.name,
          color: tag.color || '#6b7280',
          description: tag.description,
          company_id: tag.company_id,
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Error creating service tag:', error);
      throw error;
    }
  }

  async loadServiceTagsForServices(services: Service[]): Promise<Service[]> {
    try {
      if (!services || services.length === 0) return services;

      const serviceIds = services.map(s => s.id);
      const client = this.supabase.getClient();

      const { data: relations, error } = await client
        .from('service_tag_relations')
        .select(`
          service_id,
          tag:service_tags(id, name, color)
        `)
        .in('service_id', serviceIds);

      if (error) throw error;

      // Agrupar tags por servicio
      const tagsByService: Record<string, string[]> = {};
      (relations || []).forEach((relation: any) => {
        const serviceId = relation.service_id;
        const tagName = relation.tag?.name;
        
        if (serviceId && tagName) {
          if (!tagsByService[serviceId]) {
            tagsByService[serviceId] = [];
          }
          tagsByService[serviceId].push(tagName);
        }
      });

      // Asignar tags a servicios
      return services.map(service => ({
        ...service,
        tags: tagsByService[service.id] || []
      }));
    } catch (error) {
      console.error('❌ Error loading tags for services:', error);
      return services; // Devolver servicios sin tags en caso de error
    }
  }

  async syncServiceTags(serviceId: string, tagNames: string[]): Promise<void> {
    try {
      const client = this.supabase.getClient();
      
      // 1. Obtener company_id del servicio
      const { data: service, error: serviceError } = await client
        .from('services')
        .select('company_id')
        .eq('id', serviceId)
        .single();

      if (serviceError || !service) {
        throw new Error('No se pudo obtener el servicio');
      }

      const companyId = service.company_id;
      const uniqueTagNames = Array.from(new Set(tagNames.filter(name => name && name.trim())));

      // 2. Crear tags que no existen
      for (const tagName of uniqueTagNames) {
        try {
          await client
            .from('service_tags')
            .insert({
              name: tagName.trim(),
              color: '#6b7280',
              company_id: companyId,
              is_active: true
            });
        } catch (insertError: any) {
          // Ignorar errores de duplicados (constraint unique)
          if (!insertError.message?.includes('duplicate') && !insertError.message?.includes('unique')) {
            console.warn('Error creando tag:', tagName, insertError);
          }
        }
      }

      // 3. Obtener IDs de los tags
      const { data: tags, error: tagsError } = await client
        .from('service_tags')
        .select('id, name')
        .eq('company_id', companyId)
        .in('name', uniqueTagNames);

      if (tagsError) throw tagsError;

      const tagIds = (tags || []).map(tag => tag.id);

      // 4. Eliminar relaciones existentes
      await client
        .from('service_tag_relations')
        .delete()
        .eq('service_id', serviceId);

      // 5. Crear nuevas relaciones
      if (tagIds.length > 0) {
        const relations = tagIds.map(tagId => ({
          service_id: serviceId,
          tag_id: tagId
        }));

        await client
          .from('service_tag_relations')
          .insert(relations);
      }

    } catch (error) {
      console.error('❌ Error syncing service tags:', error);
      throw error;
    }
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
