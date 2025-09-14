import { Component, OnInit, inject, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseServicesService, Service, ServiceCategory, ServiceTag } from '../../services/supabase-services.service';
import { SimpleSupabaseService, SimpleCompany } from '../../services/simple-supabase.service';
import { DevRoleService } from '../../services/dev-role.service';
import { CsvHeaderMapperComponent, CsvMappingResult } from '../csv-header-mapper/csv-header-mapper.component';

@Component({
  selector: 'app-supabase-services',
  standalone: true,
  imports: [CommonModule, FormsModule, CsvHeaderMapperComponent],
  templateUrl: './supabase-services.component.html',
  styleUrl: './supabase-services.component.scss'
})
export class SupabaseServicesComponent implements OnInit, OnDestroy {
  
  // Company selector (loaded from DB)
  selectedCompanyId: string = '';
  companies: SimpleCompany[] = [];
  
  // Core data
  services: Service[] = [];
  filteredServices: Service[] = [];
  serviceCategories: ServiceCategory[] = [];
  serviceTags: ServiceTag[] = [];
  loading = false;
  error: string | null = null;
  devRoleService = inject(DevRoleService);
  
  // Statistics
  stats = {
    total: 0,
    active: 0,
    averagePrice: 0,
    averageHours: 0
  };
  
  // Filters and search
  searchTerm = '';
  categories: string[] = [];
  
  // Form management
  showForm = false;
  editingService: Service | null = null;
  formData: Partial<Service> = {};
  
  // Category form management
  showCategoryInput = false;
  categoryFilterText = '';
  filteredCategories: ServiceCategory[] = [];
  
  // Tag form management
  showTagInput = false;
  tagFilterText = '';
  filteredTags: ServiceTag[] = [];
  selectedTags: string[] = [];
  
  // Form validation
  formErrors: Record<string, string> = {};
  
  private servicesService = inject(SupabaseServicesService);
  private simpleSupabase = inject(SimpleSupabaseService);
  @ViewChild(CsvHeaderMapperComponent) private csvMapperCmp?: CsvHeaderMapperComponent;

  // CSV Mapper state for services
  showCsvMapper = false;
  csvHeaders: string[] = [];
  csvData: string[][] = [];
  pendingCsvFile: File | null = null;
  // Services-specific mapper config
  mapperFieldOptions = [
    { value: 'name', label: 'Nombre *', required: true },
    { value: 'description', label: 'Descripción' },
    { value: 'base_price', label: 'Precio base (€)' },
    { value: 'estimated_hours', label: 'Horas estimadas' },
    { value: 'category', label: 'Categoría' },
    { value: 'tags', label: 'Tags (separados por |)' }
  ];
  mapperRequiredFields = ['name'];
  mapperAliasMap: Record<string, string[]> = {
    name: ['name', 'nombre', 'service', 'servicio'],
    description: ['description', 'descripcion', 'descripción', 'detalle', 'notes'],
    base_price: ['base_price', 'precio', 'price', 'importe'],
    estimated_hours: ['estimated_hours', 'horas', 'duracion', 'duración', 'tiempo'],
    category: ['category', 'categoria', 'categoría'],
    tags: ['tags', 'etiquetas']
  };

  ngOnInit() {
    this.loadCompanies().then(() => {
      this.loadServices();
      this.loadServiceCategories();
      this.loadServiceTags();
    });
  }

  ngOnDestroy() {
    // Asegurar que el scroll se restaure si el componente se destruye con modal abierto
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
  }

  async loadCompanies() {
    try {
      const res = await this.simpleSupabase.getCompanies();
      if (res.success) {
        this.companies = res.data || [];
        // Default to first company if none selected
        // Only default to first company when its id looks like a UUID to avoid appending invalid filters (e.g. '1')
        if (!this.selectedCompanyId && this.companies.length > 0) {
          const candidate = this.companies[0].id;
          if (candidate && /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/.test(candidate)) {
            this.selectedCompanyId = candidate;
          } else {
            console.warn('Skipping default company id because it is not a UUID:', candidate);
          }
        }
      } else {
        console.warn('No se pudieron cargar companies:', res.error);
      }
    } catch (err) {
      console.error('Error cargando companies', err);
    }
  }

  async loadServiceCategories() {
    if (!this.selectedCompanyId) return;
    
    try {
      this.serviceCategories = await this.servicesService.getServiceCategories(this.selectedCompanyId);
      this.updateCategoryFilter();
    } catch (error: any) {
      console.error('Error loading service categories:', error);
    }
  }

  async loadServiceTags() {
    if (!this.selectedCompanyId) return;
    
    try {
      this.serviceTags = await this.servicesService.getServiceTags(this.selectedCompanyId);
      this.updateTagFilter();
    } catch (error: any) {
      console.error('Error loading service tags:', error);
    }
  }

  updateCategoryFilter() {
    if (!this.categoryFilterText) {
      this.filteredCategories = this.serviceCategories;
    } else {
      const searchTerm = this.normalizeText(this.categoryFilterText);
      this.filteredCategories = this.serviceCategories.filter(cat =>
        this.normalizeText(cat.name).includes(searchTerm)
      );
    }
  }

  updateTagFilter() {
    if (!this.tagFilterText) {
      this.filteredTags = this.serviceTags;
    } else {
      const searchTerm = this.normalizeText(this.tagFilterText);
      this.filteredTags = this.serviceTags.filter(tag =>
        this.normalizeText(tag.name).includes(searchTerm)
      );
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

  hasExactMatch(): boolean {
    if (!this.categoryFilterText) return false;
    const normalizedSearch = this.normalizeText(this.categoryFilterText);
    return this.serviceCategories.some(cat => 
      this.normalizeText(cat.name) === normalizedSearch
    );
  }

  getExactMatch(): ServiceCategory | undefined {
    if (!this.categoryFilterText) return undefined;
    const normalizedSearch = this.normalizeText(this.categoryFilterText);
    return this.serviceCategories.find(cat => 
      this.normalizeText(cat.name) === normalizedSearch
    );
  }

  selectExistingMatch() {
    const existingCategory = this.getExactMatch();
    if (existingCategory) {
      this.selectCategory(existingCategory);
    }
  }

  onCategoryFilterChange() {
    this.updateCategoryFilter();
  }

  selectCategory(category: ServiceCategory) {
    this.formData.category = category.name;
    this.showCategoryInput = false;
    this.categoryFilterText = '';
  }

  async createNewCategory() {
    if (!this.categoryFilterText.trim()) return;
    
    try {
      // Verificar si ya existe una categoría similar
      const normalizedSearch = this.normalizeText(this.categoryFilterText);
      const existingCategory = this.serviceCategories.find(cat => 
        this.normalizeText(cat.name) === normalizedSearch
      );

      if (existingCategory) {
        // Si existe, seleccionarla en lugar de crear una nueva
        this.formData.category = existingCategory.name;
        this.showCategoryInput = false;
        this.categoryFilterText = '';
        return;
      }

      const newCategory = await this.servicesService.findOrCreateCategory(
        this.categoryFilterText.trim(),
        this.selectedCompanyId
      );
      
      this.serviceCategories.push(newCategory);
      this.formData.category = newCategory.name;
      this.showCategoryInput = false;
      this.categoryFilterText = '';
      
    } catch (error: any) {
      console.error('Error creating category:', error);
    }
  }

  // Métodos de gestión de tags
  selectTag(tag: ServiceTag) {
    if (!this.selectedTags.includes(tag.name)) {
      this.selectedTags.push(tag.name);
    }
    this.showTagInput = false;
    this.tagFilterText = '';
  }

  hasExactTagMatch(): boolean {
    const normalizedSearch = this.normalizeText(this.tagFilterText);
    return this.serviceTags.some(tag => 
      this.normalizeText(tag.name) === normalizedSearch
    );
  }

  async createNewTag() {
    if (!this.tagFilterText.trim()) return;
    
    try {
      // Verificar si ya existe una tag similar
      const normalizedSearch = this.normalizeText(this.tagFilterText);
      const existingTag = this.serviceTags.find(tag => 
        this.normalizeText(tag.name) === normalizedSearch
      );

      if (existingTag) {
        // Si existe, seleccionarla en lugar de crear una nueva
        if (!this.selectedTags.includes(existingTag.name)) {
          this.selectedTags.push(existingTag.name);
        }
        this.showTagInput = false;
        this.tagFilterText = '';
        return;
      }

      const newTag = await this.servicesService.createServiceTag({
        name: this.tagFilterText.trim(),
        company_id: this.selectedCompanyId,
        color: '#3B82F6', // Color por defecto
        description: '',
        is_active: true
      });
      
      this.serviceTags.push(newTag);
      this.selectedTags.push(newTag.name);
      this.showTagInput = false;
      this.tagFilterText = '';
      
    } catch (error: any) {
      console.error('Error creating tag:', error);
    }
  }

  onTagFilterChange() {
    this.filteredTags = this.serviceTags.filter(tag =>
      tag.name.toLowerCase().includes(this.tagFilterText.toLowerCase())
    );
  }

  removeTag(tag: string) {
    const index = this.selectedTags.indexOf(tag);
    if (index > -1) {
      this.selectedTags.splice(index, 1);
    }
  }

  onCompanyChange() {
    this.loadServices();
    this.loadServiceCategories();
    this.loadServiceTags();
  }

  async loadServices() {
    this.loading = true;
    this.error = null;
    
    try {
  this.services = await this.servicesService.getServices(this.selectedCompanyId || undefined);
      this.updateFilteredServices();
      this.updateStats();
      this.extractCategories();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error loading services:', error);
    } finally {
      this.loading = false;
    }
  }

  updateFilteredServices() {
    this.filteredServices = this.services.filter(service => {
      const matchesSearch = service.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                           service.description?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                           service.category?.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      return matchesSearch;
    });
  }

  getActiveServices(): Service[] {
    return this.filteredServices.filter(service => service.is_active);
  }

  getInactiveServices(): Service[] {
    return this.filteredServices.filter(service => !service.is_active);
  }

  updateStats() {
    this.stats.total = this.services.length;
    this.stats.active = this.services.filter(s => s.is_active).length;
    this.stats.averagePrice = this.services.length > 0 
      ? this.services.reduce((sum, s) => sum + s.base_price, 0) / this.services.length 
      : 0;
    this.stats.averageHours = this.services.length > 0 
      ? this.services.reduce((sum, s) => sum + s.estimated_hours, 0) / this.services.length 
      : 0;
  }

  extractCategories() {
    const uniqueCategories = [...new Set(this.services.map(s => s.category).filter(Boolean))] as string[];
    this.categories = uniqueCategories.sort();
  }

  onSearch() {
    this.updateFilteredServices();
  }

  openForm(service?: Service) {
    this.showForm = true;
    this.editingService = service || null;
    this.formData = service ? { ...service } : {
      name: '',
      description: '',
      base_price: 0,
      estimated_hours: 1,
      category: '',
      is_active: true,
      tax_rate: 21,
      unit_type: 'horas',
      min_quantity: 1,
      difficulty_level: 1,
      profit_margin: 30,
      cost_price: 0,
      requires_parts: false,
      requires_diagnosis: false,
      warranty_days: 30,
      skill_requirements: [],
      tools_required: [],
      can_be_remote: true,
      priority_level: 3
    };
    
    // Inicializar tags seleccionados
    this.selectedTags = service?.tags ? [...service.tags] : [];
    
    this.formErrors = {};
    this.loadServiceCategories();
    this.loadServiceTags();
    
    // Bloquear scroll de la página principal de forma más agresiva
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
  }

  closeForm() {
    this.showForm = false;
    this.editingService = null;
    this.formData = {};
    this.formErrors = {};
    this.showCategoryInput = false;
    this.categoryFilterText = '';
    this.showTagInput = false;
    this.tagFilterText = '';
    this.selectedTags = [];
    
    // Restaurar scroll de la página principal
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
  }

  validateForm(): boolean {
    this.formErrors = {};
    
    if (!this.formData.name?.trim()) {
      this.formErrors['name'] = 'El nombre es obligatorio';
    }
    
    if (!this.formData.base_price || this.formData.base_price < 0) {
      this.formErrors['base_price'] = 'El precio debe ser mayor a 0';
    }
    
    if (!this.formData.estimated_hours || this.formData.estimated_hours <= 0) {
      this.formErrors['estimated_hours'] = 'Las horas estimadas deben ser mayor a 0';
    }
    
    if (!this.formData.category?.trim()) {
      this.formErrors['category'] = 'La categoría es obligatoria';
    }

    if (this.formData.cost_price && this.formData.cost_price < 0) {
      this.formErrors['cost_price'] = 'El costo no puede ser negativo';
    }

    if (this.formData.tax_rate && (this.formData.tax_rate < 0 || this.formData.tax_rate > 100)) {
      this.formErrors['tax_rate'] = 'El IVA debe estar entre 0 y 100%';
    }

    if (this.formData.profit_margin && (this.formData.profit_margin < 0 || this.formData.profit_margin > 1000)) {
      this.formErrors['profit_margin'] = 'El margen debe estar entre 0 y 1000%';
    }

    if (this.formData.min_quantity && this.formData.min_quantity <= 0) {
      this.formErrors['min_quantity'] = 'La cantidad mínima debe ser mayor a 0';
    }

    if (this.formData.max_quantity && this.formData.min_quantity && 
        this.formData.max_quantity < this.formData.min_quantity) {
      this.formErrors['max_quantity'] = 'La cantidad máxima debe ser mayor a la mínima';
    }

    if (this.formData.difficulty_level && (this.formData.difficulty_level < 1 || this.formData.difficulty_level > 5)) {
      this.formErrors['difficulty_level'] = 'La dificultad debe estar entre 1 y 5';
    }

    if (this.formData.priority_level && (this.formData.priority_level < 1 || this.formData.priority_level > 5)) {
      this.formErrors['priority_level'] = 'La prioridad debe estar entre 1 y 5';
    }

    if (this.formData.warranty_days && this.formData.warranty_days < 0) {
      this.formErrors['warranty_days'] = 'Los días de garantía no pueden ser negativos';
    }
    
    return Object.keys(this.formErrors).length === 0;
  }

  async saveService() {
    if (!this.validateForm()) return;
    
    this.loading = true;
    try {
      // Add company_id and tags to form data
      const dataWithCompany = {
        ...this.formData,
        company_id: this.selectedCompanyId,
        tags: this.selectedTags
      };

      if (this.editingService) {
        await this.servicesService.updateService(this.editingService.id, dataWithCompany);
      } else {
        await this.servicesService.createService(dataWithCompany);
      }
      
      this.closeForm();
      await this.loadServices();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error saving service:', error);
    } finally {
      this.loading = false;
    }
  }

  async toggleServiceStatus(service: Service) {
    this.loading = true;
    try {
      await this.servicesService.toggleServiceStatus(service.id);
      await this.loadServices();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error toggling service status:', error);
    } finally {
      this.loading = false;
    }
  }

  formatCurrency(amount: number): string {
    return this.servicesService.formatCurrency(amount);
  }

  formatHours(hours: number): string {
    return this.servicesService.formatHours(hours);
  }

  getServiceStatus(service: Service): string {
    return service.is_active ? 'Activo' : 'Inactivo';
  }

  getServiceStatusClass(service: Service): string {
    return service.is_active ? 'status-active' : 'status-inactive';
  }

  getCategoryColor(category: string): string {
    const colors = {
      'Diagnóstico': '#3b82f6',
      'Software': '#059669',
      'Mantenimiento': '#d97706',
      'Datos': '#dc2626',
      'Seguridad': '#7c3aed',
      'Hardware': '#f59e0b',
      'Redes': '#10b981'
    };
    return colors[category as keyof typeof colors] || '#6b7280';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    const categoryContainer = target.closest('.category-input-container');
    
    // Cerrar dropdown si se hace clic fuera del contenedor de categorías
    if (!categoryContainer && this.showCategoryInput) {
      this.showCategoryInput = false;
      this.categoryFilterText = '';
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.showCategoryInput) {
      this.showCategoryInput = false;
      this.categoryFilterText = '';
    }
  }

  // Simple CSV import: direct call to SupabaseServicesService.importFromCSV
  async onServicesCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files || input.files.length === 0) {
      this.error = 'Por favor selecciona un archivo CSV válido.';
      return;
    }
    const file = input.files[0];
    // Option A: Direct import (fast path)
    // Option B: Show mapper first — enable this block to use the mapper UI
    // We'll show the mapper by default now that it exists, to let you confirm columnas
    this.pendingCsvFile = file;
    try {
      const { headers, data } = await this.servicesService.parseCSVFileForServices(file);
      this.csvHeaders = headers;
      this.csvData = data.slice(0, 11); // header + 10 rows preview
      this.showCsvMapper = true;
    } catch (e: any) {
      // Fallback to direct import if parsing for mapper fails
      console.warn('Mapper parse failed, falling back to direct import:', e);
      this.loading = true;
      this.error = null;
      try {
        if (this.selectedCompanyId) this.servicesService.setCompanyId(this.selectedCompanyId);
        const imported = await this.servicesService.importFromCSV(file);
        await this.loadServices();
        console.log(`✅ Importación directa de servicios: ${imported.length} filas`);
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error('❌ Error importando servicios (fallback):', err);
        this.error = `Error importando servicios: ${msg}`;
      } finally {
        this.loading = false;
      }
    } finally {
      try { (event.target as HTMLInputElement).value = ''; } catch {}
    }
  }

  // Handler from mapper modal
  onServicesCsvMappingConfirmed(result: CsvMappingResult) {
    this.showCsvMapper = false;
    if (!this.pendingCsvFile) return;
    this.loading = true;
    this.error = null;
    this.servicesService
      .mapAndUploadServicesCsv(this.pendingCsvFile, result.mappings, this.selectedCompanyId)
      .then(async (count) => {
        await this.loadServices();
        console.log(`✅ Importación con mapeo completada: ${count} filas`);
      })
      .catch((e) => {
        const msg = e?.message || String(e);
        console.error('❌ Error importando con mapeo:', e);
        this.error = `Error importando con mapeo: ${msg}`;
      })
      .finally(() => {
        this.loading = false;
        this.pendingCsvFile = null;
      });
  }

  onServicesCsvMappingCancelled() {
    this.showCsvMapper = false;
    this.pendingCsvFile = null;
  }
}
