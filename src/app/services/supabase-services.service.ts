import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';
import { environment } from '../../environments/environment';

export interface VariantPricing {
  billing_period: 'one_time' | 'monthly' | 'quarterly' | 'biannual' | 'annual';
  base_price: number;
  estimated_hours?: number;
  cost_price?: number;
  profit_margin?: number;
  discount_percentage?: number;
}

export interface ServiceVariant {
  id: string;
  service_id: string;
  variant_name: string;

  // NUEVO: Array de precios por periodicidad
  pricing: VariantPricing[];

  // DEPRECATED: Mantener para backwards compatibility
  billing_period?: 'one-time' | 'monthly' | 'annually' | 'custom';
  base_price?: number;
  estimated_hours?: number;
  cost_price?: number;
  profit_margin?: number;
  discount_percentage?: number;

  features?: {
    included?: string[];
    excluded?: string[];
    limits?: Record<string, any>;
  };
  display_config?: {
    highlight?: boolean;
    badge?: string | null;
    color?: string | null;
  };
  is_active: boolean;
  is_hidden?: boolean; // Si true, no se muestra en catálogo público
  sort_order: number;
  created_at: string;
  updated_at: string;

  // Asignaciones a clientes específicos (precio personalizado)
  client_assignments?: ClientVariantAssignment[];
}

export interface ClientVariantAssignment {
  id: string;
  client_id: string;
  service_id: string;
  variant_id: string;
  created_at: string;
  created_by?: string;
  client?: { id: string; name: string; email?: string };
}

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

  // Campos para Portal de Cliente
  is_public?: boolean;
  allow_direct_contracting?: boolean;
  features?: string; // JSON or text description of features
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

  // Campos para sistema de variantes
  has_variants?: boolean;
  base_features?: Record<string, any>;
  variants?: ServiceVariant[];

  // Campos para sistema de reservas
  is_bookable?: boolean;
  duration_minutes?: number;
  buffer_minutes?: number;
  booking_color?: string;

  // Campos calculados (server-side) para display
  display_price?: number;        // Precio representativo (desde variantes o base_price)
  display_price_label?: string;  // "Precio Base", "Desde", "Precio"
  display_price_from_variants?: boolean; // true si viene de variantes
  display_hours?: number;        // Horas representativas
  display_hourly_rate?: number;  // Ratio €/h calculado
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
    // Service initialized
  }

  async getServices(companyId?: string): Promise<Service[]> {
    try {
      const targetCompanyId = companyId || this.currentCompanyId;
      // Usar tabla services existente como fuente principal
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
      has_variants: !!service.has_variants, // Campo de variantes
      // Booking fields
      is_bookable: !!service.is_bookable,
      duration_minutes: service.duration_minutes ?? 60,
      buffer_minutes: service.buffer_minutes ?? 0,
      booking_color: service.booking_color || undefined,
      // Public fields
      is_public: !!service.is_public,
      allow_direct_contracting: !!service.allow_direct_contracting,
      features: service.features || undefined,
      // Preferir company_id almacenado en service cuando exista
      company_id: service.company_id ? service.company_id : companyId.toString(),
      created_at: service.created_at,
      updated_at: service.updated_at || service.created_at
    }));

    // Load tags relations from service_tag_relations -> service_tags
    const servicesWithTags = await this.loadServiceTagsForServices(mapped);

    // Load variants for services that have has_variants = true
    return await this.loadVariantsForServices(servicesWithTags);
  }

  /**
   * Load variants for all services that have has_variants = true
   * and calculate display prices for ALL services
   */
  public async loadVariantsForServices(services: Service[]): Promise<Service[]> {
    // Get IDs of services that have variants
    const serviceIdsWithVariants = services
      .filter(s => s.has_variants)
      .map(s => s.id);

    // If no services have variants, still calculate display prices
    if (serviceIdsWithVariants.length === 0) {
      return services.map(service => ({
        ...service,
        ...this.calculateDisplayPrice(service, [])
      }));
    }

    try {
      const { data: variants, error } = await this.supabase.getClient()
        .from('service_variants')
        .select('*')
        .in('service_id', serviceIdsWithVariants)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });



      if (error) {
        console.warn('⚠️ Error loading variants for services:', error);
        // Still calculate display prices even on error
        return services.map(service => ({
          ...service,
          ...this.calculateDisplayPrice(service, [])
        }));
      }

      // Group variants by service_id and parse pricing JSON
      const variantsByServiceId: Record<string, ServiceVariant[]> = {};
      for (const variant of (variants || [])) {
        // Parse pricing if it's a string (from DB jsonb)
        let parsedPricing = variant.pricing;

        if (typeof variant.pricing === 'string') {
          try {
            parsedPricing = JSON.parse(variant.pricing);
          } catch (e) {
            console.error(`   Failed to parse:`, e);
            parsedPricing = null;
          }
        }

        // Keep pricing as-is, preserving null/undefined for fallback logic
        const parsedVariant: ServiceVariant = {
          ...variant,
          pricing: Array.isArray(parsedPricing) && parsedPricing.length > 0 ? parsedPricing : []
        };


        if (!variantsByServiceId[variant.service_id]) {
          variantsByServiceId[variant.service_id] = [];
        }
        variantsByServiceId[variant.service_id].push(parsedVariant);
      }



      // Attach variants to their services and calculate display prices
      return services.map(service => {
        const serviceVariants = variantsByServiceId[service.id] || [];
        const computed = this.calculateDisplayPrice(service, serviceVariants);

        return {
          ...service,
          variants: serviceVariants,
          ...computed
        };
      });
    } catch (error) {
      console.warn('⚠️ Exception loading variants for services:', error);
      // Still calculate display prices for services without variants
      return services.map(service => ({
        ...service,
        ...this.calculateDisplayPrice(service, [])
      }));
    }
  }

  /**
   * Calculate display price, hours and hourly rate for a service
   * This is server-side calculation to avoid repeated calculations in the UI
   */
  private calculateDisplayPrice(service: Service, variants: ServiceVariant[]): {
    display_price: number;
    display_price_label: string;
    display_price_from_variants: boolean;
    display_hours: number;
    display_hourly_rate: number;
  } {
    // If service doesn't have variants or no variants loaded, use base values
    if (!service.has_variants || variants.length === 0) {
      const hours = service.estimated_hours || 1;
      const price = service.base_price || 0;
      return {
        display_price: price,
        display_price_label: 'Precio Base',
        display_price_from_variants: false,
        display_hours: hours,
        display_hourly_rate: hours > 0 ? price / hours : 0
      };
    }

    // Collect all prices from variants
    const allPrices: number[] = [];
    const allHours: number[] = [];


    for (const variant of variants) {
      // Try new pricing array first
      if (variant.pricing && Array.isArray(variant.pricing) && variant.pricing.length > 0) {
        for (const p of variant.pricing) {
          if (p.base_price && p.base_price > 0) {
            allPrices.push(p.base_price);
          }
          if (p.estimated_hours && p.estimated_hours > 0) {
            allHours.push(p.estimated_hours);
          }
        }
      }
      // Fallback to deprecated fields
      else {
        if (variant.base_price && variant.base_price > 0) {
          allPrices.push(variant.base_price);
        }
        if (variant.estimated_hours && variant.estimated_hours > 0) {
          allHours.push(variant.estimated_hours);
        }
      }
    }

    // If no prices found in variants, fall back to service base_price
    if (allPrices.length === 0) {
      const hours = service.estimated_hours || 1;
      const price = service.base_price || 0;
      return {
        display_price: price,
        display_price_label: 'Precio Base',
        display_price_from_variants: false,
        display_hours: hours,
        display_hourly_rate: hours > 0 ? price / hours : 0
      };
    }

    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const avgHours = allHours.length > 0
      ? allHours.reduce((a, b) => a + b, 0) / allHours.length
      : (service.estimated_hours || 1);

    // Determine label based on price range
    let label: string;
    if (minPrice === maxPrice) {
      label = 'Precio';
    } else {
      label = 'Desde';
    }

    return {
      display_price: minPrice,
      display_price_label: label,
      display_price_from_variants: true,
      display_hours: avgHours,
      display_hourly_rate: avgHours > 0 ? minPrice / avgHours : 0
    };
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
    if (serviceData.has_variants !== undefined) serviceDataForDB.has_variants = serviceData.has_variants;
    // Booking fields
    if (serviceData.is_bookable !== undefined) serviceDataForDB.is_bookable = serviceData.is_bookable;
    if (serviceData.duration_minutes !== undefined) serviceDataForDB.duration_minutes = serviceData.duration_minutes;
    if (serviceData.buffer_minutes !== undefined) serviceDataForDB.buffer_minutes = serviceData.buffer_minutes;
    if (serviceData.booking_color !== undefined) serviceDataForDB.booking_color = serviceData.booking_color;
    // Public fields
    if (serviceData.is_public !== undefined) serviceDataForDB.is_public = serviceData.is_public;
    if (serviceData.allow_direct_contracting !== undefined) serviceDataForDB.allow_direct_contracting = serviceData.allow_direct_contracting;
    if (serviceData.features !== undefined) serviceDataForDB.features = serviceData.features;

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

    // Tags are now handled via GlobalTagsService in the UI layer
    // if (serviceData.tags && Array.isArray(serviceData.tags) && data?.id) { ... }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      base_price: data.base_price || 0,
      estimated_hours: data.estimated_hours || 0,
      category: data.category || serviceData.category || 'Servicio Técnico',
      is_active: true,
      has_variants: data.has_variants || false,
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
    if (updates.has_variants !== undefined) serviceData.has_variants = updates.has_variants;
    // Booking fields
    if (updates.is_bookable !== undefined) serviceData.is_bookable = updates.is_bookable;
    if (updates.duration_minutes !== undefined) serviceData.duration_minutes = updates.duration_minutes;
    if (updates.buffer_minutes !== undefined) serviceData.buffer_minutes = updates.buffer_minutes;
    if (updates.booking_color !== undefined) serviceData.booking_color = updates.booking_color;
    // Public fields
    if (updates.is_public !== undefined) serviceData.is_public = updates.is_public;
    if (updates.allow_direct_contracting !== undefined) serviceData.allow_direct_contracting = updates.allow_direct_contracting;
    if (updates.features !== undefined) serviceData.features = updates.features;
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
    // Tags are now handled via GlobalTagsService in the UI layer
    // if (updates.tags && Array.isArray(updates.tags)) { ... }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      base_price: data.base_price || 0,
      estimated_hours: data.estimated_hours || 0,
      category: data.category || updates.category || 'Servicio Técnico',
      is_active: updates.is_active !== false,
      has_variants: data.has_variants || false,
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
      has_variants: data.has_variants || false,
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

  async loadServiceTagsForServices(services: Service[]): Promise<Service[]> {
    try {
      if (!services || services.length === 0) return services;

      const serviceIds = services.map(s => s.id);
      const client = this.supabase.getClient();

      // Updated to fetch from services_tags -> global_tags
      const { data: relations, error } = await client
        .from('services_tags')
        .select(`
          service_id,
          tag:global_tags(id, name, color)
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

  // NOTE: Legacy syncServiceTags removed. Tag management is now handled by GlobalTagsService and app-tag-manager.


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
          const { RuntimeConfigService } = await import('./runtime-config.service');
          const cfg = new (RuntimeConfigService as any)();
          await cfg.load?.();
          const functionUrl = `${cfg.get().supabase.url.replace(/\/$/, '')}/functions/v1/import-services`;

          // Debug logs to ensure UI triggered import
          console.log('importFromCSV: parsed', dataRows.length, 'data rows -> payloadRows length=', payloadRows.length);
          console.log('importFromCSV: attempting fetch. proxyUrl=', proxyUrl, 'functionUrl=', functionUrl);
          console.log('importFromCSV: accessToken exists?', !!accessToken);

          // Try same-origin proxy first (if configured), then direct Edge Function URL
          let resp = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': cfg.get().supabase.anonKey
            },
            body: JSON.stringify({ rows: payloadRows, upsertCategory: true })
          });

          if (!resp.ok && (resp.status === 404 || resp.status === 405)) {
            console.warn('importFromCSV: proxy returned', resp.status, 'falling back to direct function URL');
            resp = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'apikey': cfg.get().supabase.anonKey
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
    mappings: Record<string, string>,
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
    Object.entries(mappings).forEach(([csvHeader, targetField]) => {
      const idx = headerIndex[csvHeader];
      if (idx !== undefined && targetField) {
        fieldToIndex[targetField] = idx;
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
    const { RuntimeConfigService } = await import('./runtime-config.service');
    const cfg = new (RuntimeConfigService as any)();
    await cfg.load?.();
    const functionUrl = `${cfg.get().supabase.url.replace(/\/$/, '')}/functions/v1/import-services`;

    let resp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': cfg.get().supabase.anonKey },
      body: JSON.stringify({ rows: payloadRows, upsertCategory: true })
    });
    if (!resp.ok && (resp.status === 404 || resp.status === 405)) {
      resp = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': cfg.get().supabase.anonKey },
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

  // =====================================================
  // SERVICE VARIANTS METHODS
  // =====================================================

  /**
   * Get all variants for a specific service, including client assignments
   */
  async getServiceVariants(serviceId: string): Promise<ServiceVariant[]> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('service_variants')
        .select('*')
        .eq('service_id', serviceId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('variant_name', { ascending: true });

      if (error) throw error;

      // Load client assignments for each variant
      const variants = data || [];
      if (variants.length > 0) {
        const variantIds = variants.map(v => v.id);
        const { data: assignments } = await client
          .from('client_variant_assignments')
          .select(`
            id, client_id, service_id, variant_id, created_at,
            client:clients(id, name, email)
          `)
          .in('variant_id', variantIds);

        // Attach assignments to their variants
        if (assignments) {
          for (const variant of variants) {
            variant.client_assignments = assignments
              .filter((a: any) => a.variant_id === variant.id)
              .map((a: any) => ({
                id: a.id,
                client_id: a.client_id,
                service_id: a.service_id,
                variant_id: a.variant_id,
                created_at: a.created_at,
                client: a.client
              }));
          }
        }
      }

      return variants;
    } catch (error) {
      console.error('❌ Error getting service variants:', error);
      throw error;
    }
  }

  /**
   * Get a single variant by its id
   */
  async getVariantById(variantId: string): Promise<ServiceVariant | null> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('service_variants')
        .select('*')
        .eq('id', variantId)
        .maybeSingle();
      if (error) throw error;
      return (data as any) || null;
    } catch (error) {
      console.error('❌ Error getting variant by id:', error);
      return null;
    }
  }

  /**
   * Get service with all its variants
   */
  async getServiceWithVariants(serviceId: string): Promise<Service> {
    try {
      const client = this.supabase.getClient();

      // Get service
      const { data: service, error: serviceError } = await client
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single();

      if (serviceError) throw serviceError;

      // Get variants
      const variants = await this.getServiceVariants(serviceId);

      return {
        ...service,
        variants
      };
    } catch (error) {
      console.error('❌ Error getting service with variants:', error);
      throw error;
    }
  }

  /**
   * Get all services with their variants for a company
   */
  async getServicesWithVariants(companyId?: string): Promise<Service[]> {
    try {
      const targetCompanyId = companyId || this.currentCompanyId;
      const services = await this.getServices(targetCompanyId);

      // Get variants for all services
      const servicesWithVariants = await Promise.all(
        services.map(async (service) => {
          const variants = await this.getServiceVariants(service.id);
          return {
            ...service,
            variants
          };
        })
      );

      return servicesWithVariants;
    } catch (error) {
      console.error('❌ Error getting services with variants:', error);
      throw error;
    }
  }

  /**
   * Create a new service variant using RPC
   */
  async createServiceVariant(variant: Partial<ServiceVariant>): Promise<ServiceVariant> {
    try {
      const client = this.supabase.getClient();

      console.log('🚀 Creating variant via RPC:', variant);

      const { data, error } = await client.rpc('create_service_variant_rpc', {
        p_service_id: variant.service_id,
        p_variant_name: variant.variant_name,
        p_pricing: variant.pricing || [],
        p_features: variant.features || {},
        p_display_config: variant.display_config || {},
        p_is_active: variant.is_active ?? true,
        p_sort_order: variant.sort_order ?? 0
      });

      if (error) {
        console.error('❌ RPC error:', error);
        throw error;
      }

      console.log('✅ Variant created via RPC:', data);
      
      // Return constructed object or fetch fresh if needed.
      // The RPC returns { id: uuid }.
      return {
        ...variant,
        id: (data as any)?.id
      } as ServiceVariant;

    } catch (error) {
      console.error('❌ Error creating service variant:', error);
      throw error;
    }
  }

  /**
   * Update a service variant using RPC
   */
  async updateServiceVariant(variantId: string, updates: Partial<ServiceVariant>): Promise<ServiceVariant> {
    try {
      const client = this.supabase.getClient();

      // Use RPC for update with partial support via COALESCE
      const { data, error } = await client.rpc('update_service_variant_rpc', {
        p_variant_id: variantId,
        p_variant_name: updates.variant_name || null,
        p_pricing: updates.pricing || null,
        p_features: updates.features || null,
        p_display_config: updates.display_config || null,
        p_is_active: updates.is_active ?? null, // Use nullish coalescing to preserve false/true, only null if undefined
        p_sort_order: updates.sort_order ?? null   // Use nullish coalescing to preserve 0
      });

      if (error) {
        console.error('❌ RPC error:', error);
        throw error;
      }

      console.log('✅ Variant updated via RPC');
      return { ...updates, id: variantId } as ServiceVariant;
    } catch (error) {
      console.error('❌ Error updating service variant:', error);
      throw error;
    }
  }

  /**
   * Delete a service variant (soft delete)
   */
  async deleteServiceVariant(variantId: string): Promise<void> {
    try {
      const client = this.supabase.getClient();
      const { error } = await client
        .from('service_variants')
        .update({ is_active: false })
        .eq('id', variantId);

      if (error) throw error;
    } catch (error) {
      console.error('❌ Error deleting service variant:', error);
      throw error;
    }
  }

  /**
   * Calculate annual price with discount
   */
  calculateAnnualPrice(monthlyPrice: number, discountPercentage: number = 16): number {
    return Math.round((monthlyPrice * 12) * (1 - discountPercentage / 100) * 100) / 100;
  }

  /**
   * Update service to enable variants
   */
  async enableServiceVariants(serviceId: string, baseFeatures?: Record<string, any>): Promise<Service> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('services')
        .update({
          has_variants: true,
          base_features: baseFeatures || {}
        })
        .eq('id', serviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Error enabling service variants:', error);
      throw error;
    }
  }

  public async resolveCategoryNames(services: Service[]): Promise<Service[]> {
    if (!services || services.length === 0) return services;

    const isValidUuid = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // Extract potential UUIDs from category field
    const categoryIds = services
      .map(s => s.category)
      .filter(c => c && isValidUuid(c));

    if (categoryIds.length === 0) return services;

    const uniqueIds = [...new Set(categoryIds)];

    const { data: categories } = await this.supabase.getClient()
      .from('service_categories')
      .select('id, name')
      .in('id', uniqueIds);

    if (!categories || categories.length === 0) return services;

    const catMap = new Map((categories as any[]).map((c: any) => [c.id, c.name]));

    return services.map(s => {
      // Only replace if it was a UUID and we found a name
      if (s.category && isValidUuid(s.category) && catMap.has(s.category)) {
        return { ...s, category: catMap.get(s.category) };
      }
      return s;
    });
  }
}

