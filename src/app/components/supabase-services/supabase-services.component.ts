import { Component, OnInit, inject, HostListener, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseServicesService, Service, ServiceCategory, ServiceTag, ServiceVariant } from '../../services/supabase-services.service';
import { SimpleSupabaseService, SimpleCompany } from '../../services/simple-supabase.service';
import { DevRoleService } from '../../services/dev-role.service';
import { CsvHeaderMapperComponent, CsvMappingResult } from '../csv-header-mapper/csv-header-mapper.component';
import { ToastService } from '../../services/toast.service';
import { SupabaseUnitsService, UnitOfMeasure } from '../../services/supabase-units.service';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { ServiceVariantsComponent } from '../service-variants/service-variants.component';

@Component({
  selector: 'app-supabase-services',
  standalone: true,
  imports: [CommonModule, FormsModule, CsvHeaderMapperComponent, SkeletonComponent, ServiceVariantsComponent],
  templateUrl: './supabase-services.component.html',
  styleUrl: './supabase-services.component.scss'
})
export class SupabaseServicesComponent implements OnInit, OnDestroy {
  @ViewChild('variantsComp') variantsComp?: ServiceVariantsComponent | any; // child reference
  @ViewChild('modalBody') modalBody?: ElementRef;
  @ViewChild('categorySearchInput') categorySearchInput?: ElementRef;
  @ViewChild('tagSearchInput') tagSearchInput?: ElementRef;
  
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
  
  // Variants management
  serviceVariants: ServiceVariant[] = [];
  pendingVariants: Partial<ServiceVariant>[] = []; // Variantes creadas antes de guardar el servicio
  
  // Accordion management
  accordionState = {
    basicInfo: true,      // Abierta por defecto
    variants: false,
    pricing: false,
    timeQuantity: false,
    difficulty: false
  };
  
  // Form validation
  formErrors: Record<string, string> = {};
  
  private servicesService = inject(SupabaseServicesService);
  private simpleSupabase = inject(SimpleSupabaseService);
  private toastService = inject(ToastService);
  private unitsService = inject(SupabaseUnitsService);
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

  // Units of measure for dynamic select
  units: UnitOfMeasure[] = [];
  unitsLoaded = false;

  ngOnInit() {
    this.loadCompanies().then(() => {
      this.loadServices();
      this.loadServiceCategories();
      this.loadServiceTags();
    });
    this.loadUnits();
  }

  showServicesImportInfo(event: Event) {
    event.stopPropagation();
    const infoMessage = `Formato: Nombre, Descripción, Precio base, Horas estimadas, Categoría, Tags.`;
    try { console.log('services import info clicked'); } catch {}
    // Try to use a toastService if available, otherwise console
    // The component doesn't inject a toastService; fallback to console.log
    // If your app uses a global toast service available via window, you may adapt here.
    (window as any)?.toastService?.info?.('CSV requerido', infoMessage, 6000);
    console.info('[CSV-INFO]', infoMessage);
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

  async loadUnits() {
    try {
      this.units = await this.unitsService.getActiveUnits();
      this.unitsLoaded = true;
    } catch (error) {
      console.warn('No se pudieron cargar unidades, se usarán opciones por defecto');
      this.units = [];
      this.unitsLoaded = true;
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
    // Auto-focus en el input de búsqueda cuando se abre
    if (this.showCategoryInput && this.categorySearchInput) {
      setTimeout(() => this.categorySearchInput?.nativeElement.focus(), 0);
    }
  }

  selectCategory(category: ServiceCategory) {
    this.formData.category = category.name;
    this.showCategoryInput = false;
    this.categoryFilterText = '';
  }

  // Método auxiliar para abrir dropdown de categorías y hacer focus
  openCategoryDropdown() {
    this.showCategoryInput = true;
    this.categoryFilterText = '';
    setTimeout(() => this.categorySearchInput?.nativeElement.focus(), 100);
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
    // Auto-focus en el input de búsqueda cuando se abre
    if (this.showTagInput && this.tagSearchInput) {
      setTimeout(() => this.tagSearchInput?.nativeElement.focus(), 0);
    }
  }

  // Método auxiliar para abrir dropdown de tags y hacer focus
  openTagDropdown() {
    this.showTagInput = true;
    this.tagFilterText = '';
    setTimeout(() => this.tagSearchInput?.nativeElement.focus(), 100);
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
      // Ajustar scrollbar de la página tras cargar los servicios
      this.adjustRootScroll();
    }
  }

  updateFilteredServices() {
    this.filteredServices = this.services.filter(service => {
      const matchesSearch = service.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                           service.description?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                           service.category?.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      return matchesSearch;
    });
    // Recalcular visibilidad del scrollbar cuando cambia el filtrado
    this.adjustRootScroll();
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
    
    // Determine default unit_type
    const defaultUnitType = this.units.length > 0 ? this.units[0].code : 'horas';
    
    this.formData = service ? { ...service } : {
      name: '',
      description: '',
      base_price: 0,
      estimated_hours: 1,
      category: '',
      is_active: true,
      tax_rate: 21,
      unit_type: defaultUnitType,
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
      priority_level: 3,
      has_variants: false
    };
    
    // Inicializar tags seleccionados
    this.selectedTags = service?.tags ? [...service.tags] : [];
    
    // Load variants if service has them
    if (service?.has_variants && service.id) {
      this.loadServiceVariants(service.id);
      this.pendingVariants = []; // Limpiar variantes pendientes al editar
    } else {
      this.serviceVariants = [];
      // Si es un servicio nuevo y tiene variantes pendientes, mostrarlas
      if (!service && this.pendingVariants.length > 0) {
        this.serviceVariants = [...this.pendingVariants] as ServiceVariant[];
      } else {
        this.pendingVariants = []; // Limpiar variantes pendientes al crear nuevo
      }
    }
    
    this.formErrors = {};
    this.loadServiceCategories();
    this.loadServiceTags();
    this.loadUnits();
    
    // Bloquear scroll de la página principal de forma más agresiva
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
    // No ajustar scroll aquí porque forzamos el modo modal
  }  closeForm() {
    this.showForm = false;
    this.editingService = null;
    this.formData = {};
    this.formErrors = {};
    this.showCategoryInput = false;
    this.categoryFilterText = '';
    this.showTagInput = false;
    this.tagFilterText = '';
    this.selectedTags = [];
    this.serviceVariants = [];
    this.pendingVariants = []; // Limpiar variantes pendientes
    
    // Reset accordion state
    this.accordionState = {
      basicInfo: true,
      variants: false,
      pricing: false,
      timeQuantity: false,
      difficulty: false
    };
    
    // Restaurar scroll de la página principal
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
    // Restaurar control dinámico del scrollbar
    this.adjustRootScroll();
  }

  validateForm(): boolean {
    this.formErrors = {};
    
    if (!this.formData.name?.trim()) {
      this.formErrors['name'] = 'El nombre es obligatorio';
    }
    
    // If service uses variants, base_price is managed per-variant and is not required here
    if (!this.formData.has_variants) {
      if (!this.formData.base_price || this.formData.base_price < 0) {
        this.formErrors['base_price'] = 'El precio debe ser mayor a 0';
      }
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

      let savedServiceId: string;

      if (this.editingService) {
        await this.servicesService.updateService(this.editingService.id, dataWithCompany);
        savedServiceId = this.editingService.id;
      } else {
        const newService = await this.servicesService.createService(dataWithCompany);
        savedServiceId = newService.id;

        // If user enabled variants but didn't add any yet, reopen the created service so they can add variants
        const wantsVariantsButNone = !!this.formData.has_variants && this.pendingVariants.length === 0;

        // Si hay variantes pendientes, crearlas ahora que tenemos el service_id
        if (this.pendingVariants.length > 0) {
          console.log(`🔄 Creando ${this.pendingVariants.length} variantes pendientes para el servicio ${savedServiceId}`);
          
          for (const pendingVariant of this.pendingVariants) {
            const variantWithServiceId: ServiceVariant = {
              ...pendingVariant,
              id: '', // Será generado por la DB
              service_id: savedServiceId
            } as ServiceVariant;
            
            try {
              await this.servicesService.createServiceVariant(variantWithServiceId);
            } catch (variantError) {
              console.error('❌ Error creating pending variant:', variantError);
              // Continuar con las demás variantes aunque una falle
            }
          }
          
          // Limpiar variantes pendientes
          this.pendingVariants = [];
          this.toastService.success('Servicio y variantes creados', `Se creó el servicio con sus variantes`);
        }
        
        if (wantsVariantsButNone) {
          // Inform the user and reopen the service edit modal so they can add variants
          this.toastService.info('Servicio creado', 'El servicio se creó — añade las variantes para completarlo');
          // Reload services so the new service is available, then open the form for it
          await this.loadServices();
          const created = this.services.find(s => s.id === savedServiceId);
          if (created) {
            // Open the modal in edit mode for the newly created service so the user can add variants
            this.openForm(created);

            // After the view updates, expand the variants accordion, scroll to it and open the variant form
            setTimeout(() => {
              try {
                this.accordionState.variants = true;

                // Scroll the modal body to the variants section
                const modalEl = this.modalBody?.nativeElement || document.querySelector('.modal-body');
                const variantsEl = modalEl?.querySelector('#variants-section');
                if (variantsEl && typeof variantsEl.scrollIntoView === 'function') {
                  variantsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }

                // Open the child variant form to force user to create the first variant
                if (this.variantsComp && typeof this.variantsComp.openForm === 'function') {
                  // Call with no args to create a new variant
                  this.variantsComp.openForm();
                }
              } catch (e) {
                console.error('❌ Error auto-opening variants section:', e);
              }
            }, 120);

            // Do not close the form flow here — exit early
            this.loading = false;
            return;
          }
        }
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

  async loadServiceVariants(serviceId: string) {
    try {
      this.serviceVariants = await this.servicesService.getServiceVariants(serviceId);
    } catch (error: any) {
      console.error('Error loading service variants:', error);
      this.serviceVariants = [];
    }
  }

  onVariantsChange(variants: ServiceVariant[]) {
    this.serviceVariants = variants;
  }

  async onVariantSave(variant: ServiceVariant) {
    this.loading = true;
    try {
      // Si el servicio aún no existe (no tiene ID), guardar como pendiente
      if (!this.editingService?.id) {
        console.log('💾 Guardando variante como pendiente (servicio no creado aún)');
        
        // Buscar si ya existe una variante pendiente con el mismo nombre para actualizarla
        const existingIndex = this.pendingVariants.findIndex(v => v.variant_name === variant.variant_name);
        
        if (existingIndex >= 0) {
          // Actualizar variante pendiente existente
          this.pendingVariants[existingIndex] = variant;
          this.toastService.success('Variante actualizada', 'La variante se guardará al crear el servicio');
        } else {
          // Agregar nueva variante pendiente
          this.pendingVariants.push(variant);
          this.toastService.success('Variante guardada', 'La variante se guardará al crear el servicio');
        }
        
        // Actualizar la lista visual de variantes
        this.serviceVariants = [...this.pendingVariants] as ServiceVariant[];
        this.loading = false;
        return;
      }
      
      // Si el servicio ya existe, guardar directamente en la BD
      if (variant.id) {
        // Update existing variant
        await this.servicesService.updateServiceVariant(variant.id, variant);
        this.toastService.success('Variante actualizada', 'La variante se ha actualizado correctamente');
      } else {
        // Create new variant
        await this.servicesService.createServiceVariant(variant);
        this.toastService.success('Variante creada', 'La variante se ha creado correctamente');
      }
      
      // Reload variants
      if (this.editingService?.id) {
        await this.loadServiceVariants(this.editingService.id);
      }
    } catch (error) {
      console.error('Error saving variant:', error);
      this.toastService.error('Error al guardar', 'No se pudo guardar la variante');
    } finally {
      this.loading = false;
    }
  }

  async onVariantDelete(variantId: string) {
    this.loading = true;
    try {
      // Si el servicio aún no existe, eliminar de pendientes
      if (!this.editingService?.id) {
        console.log('🗑️ Eliminando variante pendiente');
        
        // Buscar por variant_name si variantId no es un UUID válido
        const index = this.pendingVariants.findIndex(v => 
          v.id === variantId || v.variant_name === variantId
        );
        
        if (index >= 0) {
          this.pendingVariants.splice(index, 1);
          this.serviceVariants = [...this.pendingVariants] as ServiceVariant[];
          this.toastService.success('Variante eliminada', 'La variante pendiente ha sido eliminada');
        }
        
        this.loading = false;
        return;
      }
      
      // Si el servicio existe, eliminar de la BD
      await this.servicesService.deleteServiceVariant(variantId);
      this.toastService.success('Variante eliminada', 'La variante se ha eliminado correctamente');
      
      // Reload variants
      if (this.editingService?.id) {
        await this.loadServiceVariants(this.editingService.id);
      }
    } catch (error: any) {
      console.error('Error deleting variant:', error);
      this.toastService.error('Error al eliminar', 'No se pudo eliminar la variante');
    } finally {
      this.loading = false;
    }
  }

  async toggleHasVariants() {
    // El valor ya fue cambiado por ngModel, usar el valor actual
    const newValue = this.formData.has_variants;
    
    if (!this.editingService?.id) {
      // For new services, just clear variants if disabled
      if (!newValue) {
        this.serviceVariants = [];
      }
      return;
    }

    // For existing services, enable/disable variants in the database
    this.loading = true;
    try {
      if (newValue) {
        // Enable variants with base features
        const baseFeatures = {
          description: this.formData.description || '',
          category: this.formData.category || ''
        };
        await this.servicesService.enableServiceVariants(this.editingService.id, baseFeatures);
        await this.loadServiceVariants(this.editingService.id);
      } else {
        // Disable variants
        await this.servicesService.updateService(this.editingService.id, { has_variants: false });
        this.serviceVariants = [];
      }
      
      this.toastService.success(
        newValue ? 'Variantes activadas' : 'Variantes desactivadas',
        newValue ? 'Ahora puedes crear variantes para este servicio' : 'Las variantes han sido desactivadas'
      );
    } catch (error: any) {
      this.error = error.message;
      console.error('Error toggling variants:', error);
      this.toastService.error('Error', 'No se pudo cambiar el estado de variantes');
      // Revertir el cambio en caso de error
      this.formData.has_variants = !newValue;
    } finally {
      this.loading = false;
    }
  }

  toggleAccordion(section: keyof typeof this.accordionState) {
    this.accordionState[section] = !this.accordionState[section];
  }

  formatCurrency(amount: number): string {
    return this.servicesService.formatCurrency(amount);
  }

  formatHours(hours: number): string {
    return this.servicesService.formatHours(hours);
  }

  // New methods for dynamic unit display
  getServiceUnitName(service: Service): string {
    if (!service.unit_type) return 'h'; // default fallback
    
    const unit = this.units.find(u => u.code === service.unit_type);
    return unit ? unit.name : service.unit_type;
  }

  getServiceUnitShortName(service: Service): string {
    if (!service.unit_type) return 'h'; // default fallback
    
    const unit = this.units.find(u => u.code === service.unit_type);
    return unit ? unit.code : service.unit_type;
  }

  formatServiceDuration(service: Service): string {
    if (!service.estimated_hours) return '-';
    
    const unitName = this.getServiceUnitShortName(service);
    const value = service.estimated_hours;
    
    // Format the number nicely
    const formatted = value % 1 === 0 ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
    
    return `${formatted} ${unitName}`;
  }

  getAverageUnitDisplay(): string {
    // For average stats, we need to determine the most common unit type
    // or show a generic label
    if (this.services.length === 0) return 'h';
    
    // Count unit types
    const unitCounts: Record<string, number> = {};
    this.services.forEach(service => {
      const unitType = service.unit_type || 'horas';
      unitCounts[unitType] = (unitCounts[unitType] || 0) + 1;
    });
    
    // Find most common unit
    let mostCommonUnit = 'horas';
    let maxCount = 0;
    for (const [unit, count] of Object.entries(unitCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonUnit = unit;
      }
    }
    
    const unit = this.units.find(u => u.code === mostCommonUnit);
    return unit ? unit.name : mostCommonUnit;
  }

  getSelectedUnitLabel(): string {
    if (!this.formData.unit_type) return 'Unidades';
    
    const unit = this.units.find(u => u.code === this.formData.unit_type);
    return unit ? unit.name : 'Unidades';
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
  onEscapeKey(event: Event) {
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

  // ---------------------------
  // Control dinámico del scrollbar
  // Ocultamos el scrollbar global sólo si el contenido completo de la página
  // cabe en el alto del viewport. Si hay overflow real, lo dejamos visible.
  // Evita el "scrollbar fantasma" cuando hay pocos servicios.
  private adjustRootScroll() {
    // Si el modal está abierto dejamos que la lógica del modal gestione el scroll
    if (this.showForm) return;

    // Reset previo para medir correctamente
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // Usamos rAF para esperar al layout final antes de medir
    requestAnimationFrame(() => {
      if (this.showForm) return; // doble verificación
      try {
        const totalHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        if (totalHeight <= viewportHeight + 1) { // +1 por posibles diferencias de redondeo
          document.body.style.overflow = 'hidden';
          document.documentElement.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = '';
          document.documentElement.style.overflow = '';
        }
      } catch (e) {
        console.warn('adjustRootScroll error', e);
      }
    });
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.adjustRootScroll();
  }
}
