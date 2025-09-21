import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';
import { environment } from '../../environments/environment';

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
  private currentCompanyId = ''; // Default vacío (usar tenant/current_company_id cuando esté disponible)

  // Validar UUID simple
  private isValidUuid(id: string | undefined | null): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

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
      let query: any = client
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (this.isValidUuid(companyId)) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;

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
    // Fetch services first (no PostgREST join because there's no FK between services.category and service_categories)
    let query: any = this.supabase.getClient()
      .from('services')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (this.isValidUuid(companyId)) {
      query = query.eq('company_id', companyId);
    } else {
      // Invalid or missing companyId: proceed with global/untagged query (suppress warning)
    }

    const { data: services, error } = await query;

    if (error) throw error;

    // If services reference category as UUIDs, fetch those categories and map names client-side
    const categoryIds = Array.from(new Set((services || [])
      .map((s: any) => s?.category)
      .filter((id: any) => typeof id === 'string' && this.isValidUuid(id))));

    let categoriesById: Record<string, { id: string; name: string; color?: string; icon?: string }> = {};
    if (categoryIds.length > 0) {
      const { data: cats, error: catErr } = await this.supabase.getClient()
        .from('service_categories')
        .select('id, name, color, icon')
        .in('id', categoryIds);
      if (!catErr && Array.isArray(cats)) {
        categoriesById = cats.reduce((acc: any, c: any) => {
          acc[c.id] = c;
          return acc;
        }, {} as Record<string, { id: string; name: string; color?: string; icon?: string }>);
      }
    }

    // Transform services data to services format and map category id -> name
    const mapped = (services || []).map((service: any) => ({
      id: service.id,
      name: service.name,
      description: service.description || '',
      base_price: service.base_price || 0,
      estimated_hours: service.estimated_hours || 0,
      // Map category UUID to its name if available; otherwise keep original string or fallback
      category: (typeof service.category === 'string' && this.isValidUuid(service.category) && categoriesById[service.category])
        ? categoriesById[service.category].name
        : (service.category || 'Servicio Técnico'),
  is_active: service.is_active !== undefined ? service.is_active : true, // Usar campo is_active de la BD
  // Additional management fields
  tax_rate: service.tax_rate !== undefined && service.tax_rate !== null ? Number(service.tax_rate) : undefined,
  unit_type: service.unit_type || undefined,
  min_quantity: service.min_quantity !== undefined && service.min_quantity !== null ? Number(service.min_quantity) : undefined,
  max_quantity: service.max_quantity !== undefined && service.max_quantity !== null ? Number(service.max_quantity) : undefined,
  difficulty_level: service.difficulty_level !== undefined && service.difficulty_level !== null ? Number(service.difficulty_level) : undefined,
  profit_margin: service.profit_margin !== undefined && service.profit_margin !== null ? Number(service.profit_margin) : undefined,
  cost_price: service.cost_price !== undefined && service.cost_price !== null ? Number(service.cost_price) : undefined,
  requires_parts: !!service.requires_parts,
  requires_diagnosis: !!service.requires_diagnosis,
  warranty_days: service.warranty_days !== undefined && service.warranty_days !== null ? Number(service.warranty_days) : undefined,
  skill_requirements: service.skill_requirements || [],
  tools_required: service.tools_required || [],
  can_be_remote: !!service.can_be_remote,
  priority_level: service.priority_level !== undefined && service.priority_level !== null ? Number(service.priority_level) : undefined,
      // Preferir company_id almacenado en service cuando exista
      company_id: service.company_id ? service.company_id : companyId.toString(),
      created_at: service.created_at,
      updated_at: service.updated_at || service.created_at
    }));

    // Load tags relations from service_tag_relations -> service_tags
    return await this.loadServiceTagsForServices(mapped);
  }

  async createService(serviceData: Partial<Service>): Promise<Service> {
    // Prepare payload for DB insert
    const serviceDataForDB: any = {
      name: serviceData.name,
      description: serviceData.description,
      base_price: serviceData.base_price,
      estimated_hours: serviceData.estimated_hours
    };

    if (serviceData.company_id) serviceDataForDB.company_id = serviceData.company_id;

  // Management fields
  if (serviceData.tax_rate !== undefined) serviceDataForDB.tax_rate = serviceData.tax_rate;
  if (serviceData.unit_type !== undefined) serviceDataForDB.unit_type = serviceData.unit_type;
  if (serviceData.min_quantity !== undefined) serviceDataForDB.min_quantity = serviceData.min_quantity;
  if (serviceData.max_quantity !== undefined) serviceDataForDB.max_quantity = serviceData.max_quantity;
  if (serviceData.difficulty_level !== undefined) serviceDataForDB.difficulty_level = serviceData.difficulty_level;
  if (serviceData.profit_margin !== undefined) serviceDataForDB.profit_margin = serviceData.profit_margin;
  if (serviceData.cost_price !== undefined) serviceDataForDB.cost_price = serviceData.cost_price;
  if (serviceData.requires_parts !== undefined) serviceDataForDB.requires_parts = serviceData.requires_parts;
  if (serviceData.requires_diagnosis !== undefined) serviceDataForDB.requires_diagnosis = serviceData.requires_diagnosis;
  if (serviceData.warranty_days !== undefined) serviceDataForDB.warranty_days = serviceData.warranty_days;
  if (serviceData.skill_requirements !== undefined) serviceDataForDB.skill_requirements = serviceData.skill_requirements;
  if (serviceData.tools_required !== undefined) serviceDataForDB.tools_required = serviceData.tools_required;
  if (serviceData.can_be_remote !== undefined) serviceDataForDB.can_be_remote = serviceData.can_be_remote;
  if (serviceData.priority_level !== undefined) serviceDataForDB.priority_level = serviceData.priority_level;

    // If a category is provided, try to resolve it to a category id
    if (serviceData.category) {
      try {
        if (this.isValidUuid(serviceData.category)) {
          serviceDataForDB.category = serviceData.category;
        } else {
          const companyId = serviceData.company_id || this.currentCompanyId;
          const category = await this.findOrCreateCategory(serviceData.category as string, companyId);
          serviceDataForDB.category = category.id;
        }
      } catch (err) {
        console.warn('Warning: could not resolve category to id on createService, storing raw value', err);
        serviceDataForDB.category = serviceData.category;
      }
    }

    const { data, error } = await this.supabase.getClient()
      .from('services')
      .insert([serviceDataForDB])
      .select()
      .single();

    if (error) throw error;

    // If tags were provided, sync them to relations
    if (serviceData.tags && Array.isArray(serviceData.tags) && data?.id) {
      try {
        await this.syncServiceTags(data.id, serviceData.tags as string[]);
      } catch (e) {
        console.warn('Could not sync tags on createService:', e);
      }
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      base_price: data.base_price || 0,
      estimated_hours: data.estimated_hours || 0,
      category: data.category || serviceData.category || 'Servicio Técnico',
      is_active: true,
      company_id: data.company_id || serviceData.company_id || this.currentCompanyId,
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
  // Management fields
  if (updates.tax_rate !== undefined) serviceData.tax_rate = updates.tax_rate;
  if (updates.unit_type !== undefined) serviceData.unit_type = updates.unit_type;
  if (updates.min_quantity !== undefined) serviceData.min_quantity = updates.min_quantity;
  if (updates.max_quantity !== undefined) serviceData.max_quantity = updates.max_quantity;
  if (updates.difficulty_level !== undefined) serviceData.difficulty_level = updates.difficulty_level;
  if (updates.profit_margin !== undefined) serviceData.profit_margin = updates.profit_margin;
  if (updates.cost_price !== undefined) serviceData.cost_price = updates.cost_price;
  if (updates.requires_parts !== undefined) serviceData.requires_parts = updates.requires_parts;
  if (updates.requires_diagnosis !== undefined) serviceData.requires_diagnosis = updates.requires_diagnosis;
  if (updates.warranty_days !== undefined) serviceData.warranty_days = updates.warranty_days;
  if (updates.skill_requirements !== undefined) serviceData.skill_requirements = updates.skill_requirements;
  if (updates.tools_required !== undefined) serviceData.tools_required = updates.tools_required;
  if (updates.can_be_remote !== undefined) serviceData.can_be_remote = updates.can_be_remote;
  if (updates.priority_level !== undefined) serviceData.priority_level = updates.priority_level;
    // Resolve category name to id if needed
    if (updates.category) {
      try {
        if (this.isValidUuid(updates.category)) {
          serviceData.category = updates.category;
        } else {
          const companyId = updates.company_id || this.currentCompanyId;
          const category = await this.findOrCreateCategory(updates.category as string, companyId);
          serviceData.category = category.id;
        }
      } catch (err) {
        console.warn('Warning: could not resolve category to id on updateService', err);
        serviceData.category = updates.category;
      }
    }

    const { data, error } = await this.supabase.getClient()
      .from('services')
      .update(serviceData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    // If tags were provided, sync them to relations
    if (updates.tags && Array.isArray(updates.tags)) {
      try {
        await this.syncServiceTags(id, updates.tags as string[]);
      } catch (e) {
        console.warn('Could not sync tags on updateService:', e);
      }
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      base_price: data.base_price || 0,
      estimated_hours: data.estimated_hours || 0,
      category: data.category || updates.category || 'Servicio Técnico',
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

    const duplicatedService: any = {
      name: `${service.name} (Copia)`,
      description: service.description,
      base_price: service.base_price,
      estimated_hours: service.estimated_hours,
      company_id: service.company_id
    };

    // Preserve category: if it's already an id, keep it; if it's a name, try to resolve
    if (service.category) {
      if (this.isValidUuid(service.category)) {
        duplicatedService.category = service.category;
      } else {
        try {
          const category = await this.findOrCreateCategory(service.category as string, service.company_id);
          duplicatedService.category = category.id;
        } catch (err) {
          console.warn('Could not resolve category when duplicating service:', err);
        }
      }
    }

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
    if (hours === null || hours === undefined) return '-';
    const num = Number(hours);
    if (isNaN(num)) return '-';

    const minutes = Math.round(num * 60);
    // If less than 120 minutes, show minutes
    if (minutes < 120) {
      return `${minutes} min`;
    }

    // Otherwise show hours with up to 2 decimal places
    const hoursValue = Math.round((minutes / 60) * 100) / 100;
    const formatted = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(hoursValue);
    return `${formatted} h`;
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
      let query: any = client
        .from('service_tags')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (this.isValidUuid(companyId)) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;

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
      const payload = [{
        name: (tag.name || '').trim(),
        color: tag.color || '#6b7280',
        description: tag.description,
        company_id: tag.company_id,
        is_active: true
      }];

      // Use upsert to avoid unique constraint conflicts when the tag already exists
      // on (company_id, name). upsert will insert or update the existing row.
      const { data, error } = await client
        .from('service_tags')
        .upsert(payload, { onConflict: 'company_id,name' })
        .select()
        .limit(1)
        .single();

      // If the driver returns a 409 or similar for race conditions, try a read fallback
      if (error) {
        // If it's a conflict-like error, attempt to fetch the existing tag
        try {
          const { data: existing, error: fetchErr } = await client
            .from('service_tags')
            .select('*')
            .eq('company_id', tag.company_id)
            .eq('name', (tag.name || '').trim())
            .maybeSingle();
          if (fetchErr) throw fetchErr;
          if (existing) return existing as ServiceTag;
        } catch (e) {
          // Fall through to throwing the original error
        }
        throw error;
      }

      return data as ServiceTag;
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
        .select('*')
        .eq('id', serviceId)
        .single();

      if (serviceError || !service) {
        throw new Error('No se pudo obtener el servicio');
      }

      const companyId = service.company_id;
      const uniqueTagNames = Array.from(new Set(tagNames.filter(name => name && name.trim())));

      // 2. Create or update tags in a single upsert to avoid unique constraint errors
      const tagPayload = uniqueTagNames.map(n => ({
        name: n.trim(),
        color: '#6b7280',
        company_id: companyId,
        is_active: true
      }));

      if (tagPayload.length > 0) {
        try {
          // upsert on (company_id, name) so concurrent creations don't fail
          const { error: upsertErr } = await client
            .from('service_tags')
            .upsert(tagPayload, { onConflict: 'company_id,name' });
          if (upsertErr) {
            // If it's a conflict or similar, ignore; otherwise log
            const msg = String(upsertErr.message || upsertErr.code || '');
            if (!msg.includes('duplicate') && !msg.includes('unique') && !msg.includes('conflict')) {
              console.warn('Warning upserting tags:', upsertErr);
            }
          }
        } catch (e: any) {
          // In case the driver throws, try to continue — we'll fetch existing tags later
          console.warn('Warning: unexpected error during tags upsert, continuing to fetch existing tags', e);
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

  /**
   * Importar services desde CSV. Se insertan usando createService para resolver categoría/tags.
   * Formato esperado (columnas flexibles, se intentan mapear por nombre):
   * name,description,base_price,estimated_hours,category,tags (tags separados por |)
   */
  importFromCSV(file: File): Promise<Service[]> {
    const MAX = 1000;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          if (!arrayBuffer) return reject(new Error('CSV vacío'));

          // Try decode heuristics: prefer UTF-8, fallback to windows-1252 if text looks mojibake
          const tryDecode = (enc: string) => {
            try {
              // TextDecoder supports many labels in modern browsers
              return new TextDecoder(enc).decode(arrayBuffer);
            } catch (_err) {
              return null;
            }
          };

          let text = tryDecode('utf-8');
          const looksMojibake = (t: string | null) => {
            if (!t) return false;
            // common mojibake indicators: sequences like Ã©, Ã³, â, Â, replacement char �
            const m = t.match(/Ã[\x80-\xBF]|â|Â|�/g);
            return !!(m && m.length > 2);
          };

          if (looksMojibake(text)) {
            const alt = tryDecode('windows-1252') || tryDecode('iso-8859-1');
            if (alt && !looksMojibake(alt)) text = alt;
          }

          if (!text) return reject(new Error('No se pudo decodificar el CSV. Asegúrate de que esté en UTF-8 o Windows-1252.'));

          // Robust CSV parser: supports quoted fields, embedded commas and newlines, and double quotes escaping
          const parseCSV = (input: string) => {
            const rows: string[][] = [];
            let cur = '';
            let row: string[] = [];
            let inQuotes = false;
            for (let i = 0; i < input.length; i++) {
              const ch = input[i];
              if (inQuotes) {
                if (ch === '"') {
                  if (input[i + 1] === '"') { cur += '"'; i++; }
                  else { inQuotes = false; }
                } else {
                  cur += ch;
                }
              } else {
                if (ch === '"') { inQuotes = true; }
                else if (ch === ',') { row.push(cur); cur = ''; }
                else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
                else if (ch === '\r') { /* skip, handled by \n */ }
                else { cur += ch; }
              }
            }
            // push last
            row.push(cur);
            rows.push(row);
            return rows;
          };

          const allRows = parseCSV(text);
          if (!allRows || allRows.length === 0) return reject(new Error('CSV vacío o formato inválido'));

          // Trim header & rows and remove empty trailing rows
          const header = allRows[0].map(h => (h || '').toString().trim().toLowerCase());
          const dataRows = allRows.slice(1).filter(r => r.some(cell => (cell || '').toString().trim() !== ''));

          if (dataRows.length === 0) return reject(new Error('CSV sin filas de datos'));
          if (dataRows.length > MAX) return reject(new Error(`Máximo ${MAX} filas permitidas`));

          // Heuristic: if decoded text still looks mojibake, abort rather than import garbage
          if (looksMojibake(text)) return reject(new Error('El archivo parece tener problemas de codificación (mojibake). Guarda el CSV en UTF-8 y vuelve a intentarlo.'));

          const created: Service[] = [];
          const payloadRows = dataRows.map(cols => {
            const obj: any = {};
            header.forEach((h, i) => obj[h] = cols[i] ?? '');
            const tags = (obj['tags'] || obj['tag'] || '').toString().split('|').map((t: string) => t.trim()).filter(Boolean);
            const companyId = this.currentCompanyId || obj['company_id'] || undefined;
            return {
              // send empty name when missing so the server can generate unique fallback names
              name: (obj['name'] || obj['nombre'] || '').toString().trim(),
              description: (obj['description'] || obj['descripcion'] || '').toString().trim(),
              base_price: obj['price'] || obj['base_price'] ? Number(obj['price'] || obj['base_price']) : 0,
              estimated_hours: obj['estimated_hours'] ? Number(obj['estimated_hours']) : 0,
              company_id: companyId,
              category_name: obj['category'] || obj['categoria'] || undefined,
              tags
            };
          });

          // Acquire current session token for Authorization header
          const client = this.supabase.getClient();
          const { data: sessionData } = await client.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (!accessToken) {
            console.warn('importFromCSV: no access token found in sessionData', sessionData);
            throw new Error('No hay sesión activa. Inicia sesión para importar servicios.');
          }

          const proxyUrl = `/api/import-services`;
          const functionUrl = `${environment.supabase.url.replace(/\/$/, '')}/functions/v1/import-services`;

          // Debug logs to ensure UI triggered import
          console.log('importFromCSV: parsed', dataRows.length, 'data rows -> payloadRows length=', payloadRows.length);
          console.log('importFromCSV: attempting fetch. proxyUrl=', proxyUrl, 'functionUrl=', functionUrl);
          console.log('importFromCSV: accessToken exists?', !!accessToken);

          // Try same-origin proxy first (if configured), then direct Edge Function URL
          let resp = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ rows: payloadRows, upsertCategory: true })
          });

          if (!resp.ok && (resp.status === 404 || resp.status === 405)) {
            console.warn('importFromCSV: proxy returned', resp.status, 'falling back to direct function URL');
            resp = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({ rows: payloadRows, upsertCategory: true })
            });
          }

          if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Fallo al importar servicios (${resp.status}): ${errText}`);
          }

          const json = await resp.json();
          const insertedRows = Array.isArray(json.inserted) ? json.inserted : (json.inserted || []);
          for (const svcRow of insertedRows) {
            const svc: Service = {
              id: svcRow.id,
              name: svcRow.name,
              description: svcRow.description || '',
              base_price: svcRow.base_price || 0,
              estimated_hours: svcRow.estimated_hours || 0,
              category: svcRow.category || 'Servicio Técnico',
              is_active: svcRow.is_active !== undefined ? svcRow.is_active : true,
              company_id: svcRow.company_id || this.currentCompanyId || '',
              created_at: svcRow.created_at,
              updated_at: svcRow.updated_at || svcRow.created_at
            };
            created.push(svc);
          }

          resolve(created);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      // Use readAsArrayBuffer so we can decode with different encodings if needed
      reader.readAsArrayBuffer(file);
    });
  }

  // =============================
  // CSV Mapper helpers (Services)
  // =============================
  async parseCSVFileForServices(file: File): Promise<{ headers: string[]; data: string[][] }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          if (!arrayBuffer) return reject(new Error('CSV vacío'));

          const tryDecode = (enc: string) => {
            try { return new TextDecoder(enc).decode(arrayBuffer); } catch { return null; }
          };

          let text = tryDecode('utf-8');
          const looksMojibake = (t: string | null) => !!(t && t.match(/Ã[\x80-\xBF]|â|Â|�/g)?.length && t.match(/Ã[\x80-\xBF]|â|Â|�/g)!.length > 2);
          if (looksMojibake(text)) {
            const alt = tryDecode('windows-1252') || tryDecode('iso-8859-1');
            if (alt && !looksMojibake(alt)) text = alt;
          }
          if (!text) return reject(new Error('No se pudo decodificar el CSV. Asegúrate de que esté en UTF-8 o Windows-1252.'));

          const parseCSV = (input: string) => {
            const rows: string[][] = [];
            let cur = '';
            let row: string[] = [];
            let inQuotes = false;
            for (let i = 0; i < input.length; i++) {
              const ch = input[i];
              if (inQuotes) {
                if (ch === '"') {
                  if (input[i + 1] === '"') { cur += '"'; i++; }
                  else { inQuotes = false; }
                } else { cur += ch; }
              } else {
                if (ch === '"') { inQuotes = true; }
                else if (ch === ',') { row.push(cur); cur = ''; }
                else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
                else if (ch === '\r') { /* skip */ }
                else { cur += ch; }
              }
            }
            row.push(cur);
            rows.push(row);
            return rows;
          };

          const allRows = parseCSV(text);
          if (!allRows || allRows.length < 1) return reject(new Error('CSV vacío o formato inválido'));

          const header = allRows[0].map(h => (h || '').toString().trim());
          const data = allRows.filter(r => r.some(cell => (cell || '').toString().trim() !== ''));
          resolve({ headers: header, data });
        } catch (err) { reject(err); }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }

  async mapAndUploadServicesCsv(
    file: File,
    mappings: Array<{ csvHeader: string; targetField: string | null }>,
    companyId?: string | null
  ): Promise<number> {
    // 1) Parse file to get headers and rows
    const { headers, data } = await this.parseCSVFileForServices(file);
    if (!headers || headers.length === 0) throw new Error('CSV sin cabecera');
    if (!data || data.length < 2) throw new Error('CSV sin filas de datos');

    // 2) Build a lookup from header name to index
    const headerIndex: Record<string, number> = {};
    headers.forEach((h, i) => { headerIndex[h] = i; });

    // 3) Build a lookup from target field to header index (only mapped ones)
    const fieldToIndex: Record<string, number> = {};
    mappings.forEach(m => {
      if (m.targetField && typeof m.csvHeader === 'string') {
        const idx = headerIndex[m.csvHeader];
        if (idx !== undefined) fieldToIndex[m.targetField] = idx;
      }
    });

    // Helper to get a cell by target name
    const getVal = (row: string[], field: string): string => {
      const idx = fieldToIndex[field];
      if (idx === undefined) return '';
      return (row[idx] ?? '').toString().trim();
    };

    // 4) Map rows to payload expected by Edge Function
    const dataRows = data.slice(1).filter(r => r.some(cell => (cell || '').toString().trim() !== ''));
    const payloadRows = dataRows.map(row => {
      const name = getVal(row, 'name');
      const description = getVal(row, 'description');
      const priceStr = getVal(row, 'base_price') || getVal(row, 'price');
      const hoursStr = getVal(row, 'estimated_hours') || getVal(row, 'hours');
      const category = getVal(row, 'category');
      const tagsStr = getVal(row, 'tags');
      const tags = tagsStr ? tagsStr.split('|').map(t => t.trim()).filter(Boolean) : [];

      return {
        name: name, // empty allowed: server will generate fallback unique names
        description: description,
        base_price: priceStr ? Number(priceStr.replace(',', '.')) : 0,
        estimated_hours: hoursStr ? Number(hoursStr.replace(',', '.')) : 0,
        company_id: companyId || this.currentCompanyId || undefined,
        category_name: category || undefined,
        tags
      };
    });

    // 5) Acquire token and call Edge Function
    const client = this.supabase.getClient();
    const { data: sessionData } = await client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('No hay sesión activa. Inicia sesión para importar servicios.');

    const proxyUrl = `/api/import-services`;
    const functionUrl = `${environment.supabase.url.replace(/\/$/, '')}/functions/v1/import-services`;

    let resp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ rows: payloadRows, upsertCategory: true })
    });
    if (!resp.ok && (resp.status === 404 || resp.status === 405)) {
      resp = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ rows: payloadRows, upsertCategory: true })
      });
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Fallo al importar servicios (${resp.status}): ${errText}`);
    }
    const json = await resp.json();
    const insertedRows = Array.isArray(json.inserted) ? json.inserted : (json.inserted || []);
    return insertedRows.length || 0;
  }
}
