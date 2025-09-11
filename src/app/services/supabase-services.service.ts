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
    let query: any = this.supabase.getClient()
      .from('services')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (this.isValidUuid(companyId)) {
      query = query.eq('company_id', companyId);
    } else {
      console.warn('⚠️ Invalid or missing companyId for services query, loading global/untagged services');
    }

    const { data: services, error } = await query;

    if (error) throw error;

    // Transform services data to services format
    const mapped = (services || []).map((service: any) => ({
      id: service.id,
      name: service.name,
      description: service.description || '',
      base_price: service.base_price || 0,
      estimated_hours: service.estimated_hours || 0,
  category: service.category || 'Servicio Técnico',
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
        .select('*')
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
          const csv = String(e.target?.result || '');
          const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) return reject(new Error('CSV vacío'));

          const header = lines[0].split(',').map(h => h.trim().toLowerCase());
          const rows = lines.slice(1).map(line => line.split(',').map(c => c.trim()));

          if (rows.length > MAX) return reject(new Error(`Máximo ${MAX} filas permitidas`));

          const created: Service[] = [];

          // Try batch import via Edge Function first
          const functionUrl = `${environment.supabase.url.replace(/\/$/, '')}/functions/v1/import-services`;
          try {
            const payloadRows = rows.map(cols => {
              const obj: any = {};
              header.forEach((h, i) => obj[h] = cols[i] ?? '');
              const tags = (obj['tags'] || obj['tag'] || '').split('|').map((t: string) => t.trim()).filter(Boolean);
              const companyId = this.currentCompanyId || obj['company_id'] || undefined;
              return {
                name: obj['name'] || obj['nombre'] || 'Servicio importado',
                description: obj['description'] || obj['descripcion'] || '',
                base_price: obj['base_price'] ? Number(obj['base_price']) : 0,
                estimated_hours: obj['estimated_hours'] ? Number(obj['estimated_hours']) : 0,
                company_id: companyId,
                category_name: obj['category'] || obj['categoria'] || undefined,
                tags
              };
            });

            const resp = await fetch(functionUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rows: payloadRows, upsertCategory: true })
            });

            if (resp.ok) {
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
              return;
            } else {
              console.warn('Edge function import failed, falling back to per-row import', resp.status, await resp.text());
            }
          } catch (err) {
            console.warn('Edge function call error, falling back to per-row import', err);
          }

          // Helper to perform REST calls with anon key
          const restFetch = async (path: string, options: RequestInit = {}) => {
            const url = `${environment.supabase.url}/rest/v1/${path}`;
            const defaultHeaders: Record<string, string> = {
              'Content-Type': 'application/json',
              'apikey': environment.supabase.anonKey,
              'Authorization': `Bearer ${environment.supabase.anonKey}`
            };
            options.headers = Object.assign({}, defaultHeaders, options.headers || {});
            const res = await fetch(url, options as any);
            const contentType = res.headers.get('content-type') || '';
            const body = contentType.includes('application/json') ? await res.json() : await res.text();
            if (res.status === 401) {
              // Fallback: try using the Supabase client (might have a valid session)
              try {
                const client = this.supabase.getClient();
                // Map REST path to client calls for simple cases used here
                if (path.startsWith('service_categories')) {
                  // If it's a filter query like service_categories?name=eq.X&company_id=eq.Y
                  if (path.includes('?')) {
                    const table = 'service_categories';
                    const q = client.from(table).select('*');
                    // We won't parse filters here; just return all for company if provided
                    const companyParam = path.match(/company_id=eq.([^&]+)/);
                    if (companyParam && companyParam[1]) {
                      q.eq('company_id', decodeURIComponent(companyParam[1]));
                    }
                    const { data, error } = await q;
                    if (error) throw error;
                    return data || [];
                  }
                  // create
                  const { data: createdCat, error: createErr } = await client
                    .from('service_categories')
                    .insert(JSON.parse(options.body as string))
                    .select();
                  if (createErr) throw createErr;
                  return createdCat;
                }

                if (path === 'services') {
                  if (options.method === 'POST') {
                    const bodyObj = JSON.parse(options.body as string);
                    const { data, error } = await client.from('services').insert(bodyObj).select();
                    if (error) throw error;
                    return data;
                  }
                }

                if (path.startsWith('service_tags')) {
                  if (options.method === 'POST') {
                    const bodyObj = JSON.parse(options.body as string);
                    const { data, error } = await client.from('service_tags').insert(bodyObj).select();
                    if (error) throw error;
                    return data;
                  } else {
                    // select by company
                    const companyParam = path.match(/company_id=eq.([^&]+)/);
                    const q = client.from('service_tags').select('*');
                    if (companyParam && companyParam[1]) q.eq('company_id', decodeURIComponent(companyParam[1]));
                    const { data, error } = await q;
                    if (error) throw error;
                    return data || [];
                  }
                }

                if (path === 'service_tag_relations' && options.method === 'POST') {
                  const bodyObj = JSON.parse(options.body as string);
                  const { data, error } = await client.from('service_tag_relations').insert(bodyObj).select();
                  if (error) throw error;
                  return data;
                }

              } catch (clientErr) {
                throw { status: 401, body: clientErr };
              }
            }

            if (!res.ok) throw { status: res.status, body };
            return body;
          };

          for (const cols of rows) {
            const obj: any = {};
            header.forEach((h, i) => obj[h] = cols[i] ?? '');

            const tags = (obj['tags'] || obj['tag'] || '').split('|').map((t: string) => t.trim()).filter(Boolean);
            const companyId = this.currentCompanyId || obj['company_id'] || undefined;

            const payloadForInsert: any = {
              name: obj['name'] || obj['nombre'] || 'Servicio importado',
              description: obj['description'] || obj['descripcion'] || '',
              base_price: obj['base_price'] ? Number(obj['base_price']) : 0,
              estimated_hours: obj['estimated_hours'] ? Number(obj['estimated_hours']) : 0,
              company_id: companyId
            };

            // Resolve or create category via REST if provided
            if (obj['category'] || obj['categoria']) {
              const catName = obj['category'] || obj['categoria'];
              try {
                // Try to find existing category
                const encodedName = encodeURIComponent(catName);
                let cats: any[] = [];
                try {
                  cats = await restFetch(`service_categories?name=eq.${encodedName}&company_id=eq.${encodeURIComponent(companyId || '')}`);
                } catch (e) {
                  // ignore
                }
                if (Array.isArray(cats) && cats.length > 0 && cats[0].id) {
                  payloadForInsert.category = cats[0].id;
                } else {
                  // create category
                  try {
                    const createdCat = await restFetch('service_categories', {
                      method: 'POST',
                      headers: { Prefer: 'return=representation' },
                      body: JSON.stringify([{ name: catName, company_id: companyId, color: '#6b7280', is_active: true }])
                    });
                    if (Array.isArray(createdCat) && createdCat[0]?.id) payloadForInsert.category = createdCat[0].id;
                  } catch (e) {
                    console.warn('No se pudo crear categoría por REST, guardando nombre bruto:', e);
                    payloadForInsert.category = catName;
                  }
                }
              } catch (err) {
                console.warn('Error resolviendo categoría por REST:', err);
                payloadForInsert.category = obj['category'] || obj['categoria'];
              }
            }

            try {
              // Insert service via REST and get representation
              const inserted = await restFetch('services', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify([payloadForInsert])
              });

              const svcRow = Array.isArray(inserted) ? inserted[0] : inserted;
              const svc: Service = {
                id: svcRow.id,
                name: svcRow.name,
                description: svcRow.description || '',
                base_price: svcRow.base_price || 0,
                estimated_hours: svcRow.estimated_hours || 0,
                category: svcRow.category || payloadForInsert.category || 'Servicio Técnico',
                is_active: svcRow.is_active !== undefined ? svcRow.is_active : true,
                company_id: svcRow.company_id || companyId || this.currentCompanyId || '',
                created_at: svcRow.created_at,
                updated_at: svcRow.updated_at || svcRow.created_at
              };

              // Sync tags via REST (create tags if needed and create relations)
              if (tags.length > 0) {
                // Fetch existing tags for company
                const existingTags: any[] = await (async () => {
                  try {
                    const resp = await restFetch(`service_tags?company_id=eq.${encodeURIComponent(svc.company_id)}`);
                    return Array.isArray(resp) ? resp : [];
                  } catch (e) { return []; }
                })();

                const tagIds: string[] = [];
                for (const tname of tags) {
                  let found = existingTags.find(et => String(et.name).toLowerCase() === String(tname).toLowerCase());
                  if (!found) {
                    try {
                      const createdTag = await restFetch('service_tags', {
                        method: 'POST',
                        headers: { Prefer: 'return=representation' },
                        body: JSON.stringify([{ name: tname, color: '#6b7280', company_id: svc.company_id, is_active: true }])
                      });
                      found = Array.isArray(createdTag) ? createdTag[0] : createdTag;
                      existingTags.push(found);
                    } catch (e) {
                      console.warn('Error creando tag por REST, intentando continuar:', e);
                    }
                  }
                  if (found && found.id) tagIds.push(found.id);
                }

                if (tagIds.length > 0) {
                  const relations = tagIds.map(tid => ({ service_id: svc.id, tag_id: tid }));
                  try {
                    await restFetch('service_tag_relations', {
                      method: 'POST',
                      headers: { Prefer: 'resolution=merge-duplicates' },
                      body: JSON.stringify(relations)
                    });
                  } catch (e) {
                    console.warn('Error creando relaciones tags por REST:', e);
                  }
                }
              }

              created.push(svc);
            } catch (e) {
              console.warn('Error importing row, skipping:', e);
            }
          }

          resolve(created);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file, 'utf-8');
    });
  }
}
