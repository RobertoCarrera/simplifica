import { Component, OnInit, inject, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseServicesService, Service, ServiceCategory } from '../../services/supabase-services.service';
import { SimpleSupabaseService, SimpleCompany } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-supabase-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  loading = false;
  error: string | null = null;
  
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
  
  // Form validation
  formErrors: Record<string, string> = {};
  
  private servicesService = inject(SupabaseServicesService);
  private simpleSupabase = inject(SimpleSupabaseService);

  ngOnInit() {
    this.loadCompanies().then(() => {
      this.loadServices();
      this.loadServiceCategories();
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
  if (!this.selectedCompanyId && this.companies.length > 0) this.selectedCompanyId = this.companies[0].id;
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

  onCompanyChange() {
    console.log(`Cambiando a empresa ID: ${this.selectedCompanyId}`);
    this.loadServices();
    this.loadServiceCategories();
  }

  async loadServices() {
    this.loading = true;
    this.error = null;
    
    try {
  console.log(`Cargando servicios para empresa ID: ${this.selectedCompanyId}`);
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
    this.formErrors = {};
    this.loadServiceCategories();
    
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
      // Add company_id to form data
      const dataWithCompany = {
        ...this.formData,
        company_id: this.selectedCompanyId
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
    if (this.showForm) {
      this.closeForm();
    }
  }
}
