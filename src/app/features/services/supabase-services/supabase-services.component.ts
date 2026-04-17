import {
  Component,
  OnInit,
  inject,
  HostListener,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  SupabaseServicesService,
  Service,
  ServiceCategory,
  ServiceVariant,
} from '../../../services/supabase-services.service';
import { SimpleSupabaseService, SimpleCompany } from '../../../services/simple-supabase.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { AuthService } from '../../../services/auth.service';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';
import { ServiceVariantsComponent } from '../service-variants/service-variants.component';
import { ServiceProfessionalsComponent } from '../service-professionals/service-professionals.component';
import { SupabaseUnitsService, UnitOfMeasure } from '../../../services/supabase-units.service';
import { ToastService } from '../../../services/toast.service';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { TiptapEditorComponent } from '../../../shared/ui/tiptap-editor/tiptap-editor.component';
import { UserModulesService } from '../../../services/user-modules.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { SafeHtmlPipe } from '../../../core/pipes/safe-html.pipe';
import { TranslocoPipe } from '@jsverse/transloco';

import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-supabase-services',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    SkeletonComponent,
    ServiceVariantsComponent,
    ServiceProfessionalsComponent,
    TagManagerComponent,
    TiptapEditorComponent,
    SafeHtmlPipe,
    TranslocoPipe,
  ],
  templateUrl: './supabase-services.component.html',
  styleUrl: './supabase-services.component.scss',
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
  loading = false;
  error: string | null = null;
  devRoleService = inject(DevRoleService);

  // Statistics
  stats = {
    total: 0,
    active: 0,
    averagePrice: 0,
    averageHours: 0,
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
  pendingTags: GlobalTag[] = []; // Used when creating a new service

  // Custom dropdown management for Unit, Difficulty, Priority
  showUnitDropdown = false;
  showDifficultyDropdown = false;
  showPriorityDropdown = false;

  // Difficulty and Priority options
  difficultyOptions = [
    { value: '1', label: '1 - Muy Fácil' },
    { value: '2', label: '2 - Fácil' },
    { value: '3', label: '3 - Medio' },
    { value: '4', label: '4 - Difícil' },
    { value: '5', label: '5 - Muy Difícil' },
  ];

  priorityOptions = [
    { value: '1', label: '1 - Muy Baja' },
    { value: '2', label: '2 - Baja' },
    { value: '3', label: '3 - Media' },
    { value: '4', label: '4 - Alta' },
    { value: '5', label: '5 - Muy Alta' },
  ];

  // Variants management
  serviceVariants: ServiceVariant[] = [];
  pendingVariants: Partial<ServiceVariant>[] = []; // Variantes creadas antes de guardar el servicio

  // Accordion management
  accordionState = {
    basicInfo: true, // Abierta por defecto
    variants: false,
    professionals: false,
    pricing: false,
    planning: false, // Merged: Tiempo + Dificultad + Estimación
    booking: false, // Reservas section
    visibility: false,
  };

  // Planning: available hours per day for completion estimate
  availableHoursPerDay = 6;

  // Form validation
  formErrors: Record<string, string> = {};

  private servicesService = inject(SupabaseServicesService);
  private simpleSupabase = inject(SimpleSupabaseService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private unitsService = inject(SupabaseUnitsService);
  private globalTagsService = inject(GlobalTagsService);
  private userModulesService = inject(UserModulesService);
  private settingsService = inject(SupabaseSettingsService);

  // IVA policy
  pricesIncludeTax = false;

  // Module availability flags (loaded on init)
  hasModuloReservas = false;
  hasModuloSAT = false; // SAT = Tickets/Servicio técnico

  // Units of measure for dynamic select
  units: UnitOfMeasure[] = [];
  unitsLoaded = false;

  // History management for modals
  private popStateListener: any = null;

  // Race condition guard for loadServices()
  private loadServicesVersion = 0;

  async ngOnInit() {
    // Phase 1: load companies + units in parallel (units have no dependency on company)
    await Promise.all([this.loadCompanies(), this.loadUnits()]);

    // Phase 2: load services (the critical render-blocking data)
    await this.loadServices();

    // Phase 3: secondary data in parallel (categories for form, modules, tax settings)
    this.loadServiceCategories();
    this.loadModules();
    this.loadTaxSettings();
  }

  async loadModules() {
    try {
      const modules = await this.userModulesService.listForCurrentUser(
        this.selectedCompanyId || undefined,
      );
      const enabledKeys = new Set(
        modules.filter((m) => m.status === 'activado').map((m) => m.module_key),
      );

      this.hasModuloReservas = enabledKeys.has('moduloReservas');
      this.hasModuloSAT = enabledKeys.has('moduloSAT');
    } catch (e: any) {
      // Silent fail — sections remain visible if module check fails
    }
  }

  /**
   * Carga la configuración de impuestos efectiva (si los precios incluyen IVA o no)
   */
  async loadTaxSettings() {
    try {
      const settings = await this.settingsService.getEffectiveTaxSettings(
        this.selectedCompanyId || undefined,
      );
      this.pricesIncludeTax = settings.pricesIncludeTax;
    } catch (e) {
      this.pricesIncludeTax = false;
    }
  }

  ngOnDestroy() {
    // Asegurar que el scroll se restaure si el componente se destruye con modal abierto
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';

    // Limpiar listener de popstate
    if (this.popStateListener) {
      window.removeEventListener('popstate', this.popStateListener);
      this.popStateListener = null;
    }
  }

  async loadCompanies() {
    try {
      const res = await this.simpleSupabase.getCompanies();
      if (res.success) {
        this.companies = res.data || [];
        if (!this.selectedCompanyId && this.companies.length > 0) {
          // Priority 1: use the active company from AuthService (what the sidebar shows)
          const authCompanyId = this.authService.currentCompanyId();
          // Priority 2: use last_active_company_id from sessionStorage
          const storedId = sessionStorage.getItem('last_active_company_id');
          const preferredId = authCompanyId || storedId;
          const uuidRegex =
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;

          if (
            preferredId &&
            uuidRegex.test(preferredId) &&
            this.companies.some((c) => c.id === preferredId)
          ) {
            this.selectedCompanyId = preferredId;
          } else {
            // Priority 3: fallback to first company that is a valid UUID
            const candidate = this.companies.find((c) => uuidRegex.test(c.id));
            if (candidate) this.selectedCompanyId = candidate.id;
          }
        }
      }
    } catch (err) {
      // Silent fail — companies will remain empty or default
    }
  }

  async loadServiceCategories() {
    if (!this.selectedCompanyId) return;

    try {
      this.serviceCategories = await this.servicesService.getServiceCategories(
        this.selectedCompanyId,
      );
      this.updateCategoryFilter();
    } catch (error: any) {
      // Silent fail — categories will remain empty
    }
  }

  async loadUnits() {
    try {
      this.units = await this.unitsService.getActiveUnits();
      this.unitsLoaded = true;
    } catch (error) {
      // Silent fail — use default empty units
      this.units = [];
      this.unitsLoaded = true;
    }
  }

  updateCategoryFilter() {
    if (!this.categoryFilterText) {
      this.filteredCategories = this.serviceCategories;
    } else {
      const searchTerm = this.normalizeText(this.categoryFilterText);
      this.filteredCategories = this.serviceCategories.filter((cat) =>
        this.normalizeText(cat.name).includes(searchTerm),
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
    return this.serviceCategories.some((cat) => this.normalizeText(cat.name) === normalizedSearch);
  }

  getExactMatch(): ServiceCategory | undefined {
    if (!this.categoryFilterText) return undefined;
    const normalizedSearch = this.normalizeText(this.categoryFilterText);
    return this.serviceCategories.find((cat) => this.normalizeText(cat.name) === normalizedSearch);
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
    this.updateCategoryFilter(); // Mostrar todas las categorías al abrir
    setTimeout(() => this.categorySearchInput?.nativeElement.focus(), 100);
  }

  async createNewCategory() {
    if (!this.categoryFilterText.trim()) return;

    try {
      // Verificar si ya existe una categoría similar
      const normalizedSearch = this.normalizeText(this.categoryFilterText);
      const existingCategory = this.serviceCategories.find(
        (cat) => this.normalizeText(cat.name) === normalizedSearch,
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
        this.selectedCompanyId,
      );

      this.serviceCategories.push(newCategory);
      this.formData.category = newCategory.name;
      this.showCategoryInput = false;
      this.categoryFilterText = '';
    } catch (error: any) {
      console.error('Error creating category:', error);
    }
  }

  // Métodos para dropdown de Unidad de Medida
  openUnitDropdown() {
    this.showUnitDropdown = true;
  }

  selectUnit(unit: UnitOfMeasure) {
    this.formData.unit_type = unit.code;
    this.showUnitDropdown = false;
  }

  getSelectedUnitLabel(): string {
    if (!this.formData.unit_type) return '';
    const unit = this.units.find((u) => u.code === this.formData.unit_type);
    return unit ? unit.name : this.formData.unit_type;
  }

  // Métodos para dropdown de Nivel de Dificultad
  openDifficultyDropdown() {
    this.showDifficultyDropdown = true;
  }

  selectDifficulty(option: { value: string; label: string }) {
    this.formData.difficulty_level = parseInt(option.value, 10);
    this.showDifficultyDropdown = false;
  }

  getSelectedDifficultyLabel(): string {
    if (!this.formData.difficulty_level) return '';
    const option = this.difficultyOptions.find(
      (o) => o.value === String(this.formData.difficulty_level),
    );
    return option ? option.label : '';
  }

  // Métodos para dropdown de Nivel de Prioridad
  openPriorityDropdown() {
    this.showPriorityDropdown = true;
  }

  selectPriority(option: { value: string; label: string }) {
    this.formData.priority_level = parseInt(option.value, 10);
    this.showPriorityDropdown = false;
  }

  getSelectedPriorityLabel(): string {
    if (!this.formData.priority_level) return '';
    const option = this.priorityOptions.find(
      (o) => o.value === String(this.formData.priority_level),
    );
    return option ? option.label : '';
  }

  onCompanyChange() {
    this.loadServices();
    this.loadServiceCategories();
    this.loadModules();
    this.loadTaxSettings();
  }

  async loadServices() {
    const version = ++this.loadServicesVersion;
    this.loading = true;
    this.error = null;

    try {
      const services = await this.servicesService.getServices(
        this.selectedCompanyId || undefined,
      );
      // Discard result if a newer request was made
      if (version !== this.loadServicesVersion) return;
      this.services = services;
      this.updateFilteredServices();
      this.updateStats();
      this.extractCategories();
    } catch (error: any) {
      if (version !== this.loadServicesVersion) return;
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        this.error = 'La carga tardó demasiado. Intentá de nuevo.';
      } else {
        this.error = error.message || 'Error al cargar servicios';
      }
    } finally {
      if (version === this.loadServicesVersion) {
        this.loading = false;
        this.adjustRootScroll();
      }
    }
  }

  retryLoadServices() {
    this.error = null;
    this.loadServices();
  }

  updateFilteredServices() {
    this.filteredServices = this.services.filter((service) => {
      const matchesSearch =
        service.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        service.description?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        service.category?.toLowerCase().includes(this.searchTerm.toLowerCase());

      return matchesSearch;
    });
    // Recalcular visibilidad del scrollbar cuando cambia el filtrado
    this.adjustRootScroll();
  }

  getActiveServices(): Service[] {
    return this.filteredServices.filter((service) => service.is_active);
  }

  getInactiveServices(): Service[] {
    return this.filteredServices.filter((service) => !service.is_active);
  }

  updateStats() {
    this.stats.total = this.services.length;
    this.stats.active = this.services.filter((s) => s.is_active).length;
    // Use server-side calculated display_price field
    this.stats.averagePrice =
      this.services.length > 0
        ? this.services.reduce((sum, s) => sum + (s.display_price ?? s.base_price ?? 0), 0) /
          this.services.length
        : 0;
    this.stats.averageHours =
      this.services.length > 0
        ? this.services.reduce((sum, s) => sum + (s.display_hours ?? s.estimated_hours ?? 0), 0) /
          this.services.length
        : 0;
  }

  extractCategories() {
    const uniqueCategories = [
      ...new Set(this.services.map((s) => s.category).filter(Boolean)),
    ] as string[];
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

    // Resolve category UUID → name if needed (services store category as UUID, not name)
    let resolvedCategory = service?.category || '';
    if (resolvedCategory && this.servicesService.isValidUuid(resolvedCategory)) {
      const match = this.serviceCategories.find((c) => c.id === resolvedCategory);
      if (match) {
        resolvedCategory = match.name;
      }
      // If not found in active categories, keep UUID as-is (category may be inactive)
    }

    this.formData = service
      ? { ...service, category: resolvedCategory }
      : {
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
          has_variants: false,
          is_bookable: this.hasModuloReservas,
          duration_minutes: 60,
          booking_color: '#3b82f6',
          max_capacity: 1,
          enable_waitlist: false,
          active_mode_enabled: true,
          passive_mode_enabled: true,
        };

    // Inicializar tags seleccionados (pendingTags used for new services)
    this.pendingTags = [];
    // If editing, TagsManagementComponent will load tags by entityId.
    // If creating, we start with empty pendingTags.

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
    this.loadUnits();

    // Añadir entrada al historial para que el botón "atrás" cierre el modal
    history.pushState({ modal: 'service-form' }, '');

    // Configurar listener de popstate si no existe
    if (!this.popStateListener) {
      this.popStateListener = (event: PopStateEvent) => {
        if (this.showForm) {
          this.closeForm();
        }
      };
      window.addEventListener('popstate', this.popStateListener);
    }

    // Bloquear scroll de la página principal de forma más agresiva
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
    // No ajustar scroll aquí porque forzamos el modo modal
  }

  async onDuplicateClick(service: Service) {
    this.loading = true;
    try {
      // 1. Obtener tags y variantes del servicio original en paralelo
      const tagsPromise = this.globalTagsService.getEntityTags('services', service.id).toPromise();
      const variantsPromise = service.has_variants
        ? this.servicesService.getServiceVariants(service.id)
        : Promise.resolve([]);

      const [tags, variants] = await Promise.all([tagsPromise, variantsPromise]);

      // 2. Abrir formulario en modo "Nuevo"
      this.openForm(undefined);

      // 3. Sobrescribir con los datos clonados
      this.formData = {
        ...service,
        id: undefined,
        name: `${service.name} (copia)`,
        created_at: undefined,
        updated_at: undefined,
        is_active: true,
        company_id: this.selectedCompanyId,
      };

      // 4. Asignar datos pendientes para que se guarden al crear
      this.pendingTags = tags || [];
      this.pendingVariants = (variants || []).map((v) => ({
        ...v,
        id: undefined,
        service_id: undefined,
        created_at: undefined,
        updated_at: undefined,
      }));

      // Importante: serviceVariants es lo que muestra el componente de variantes
      this.serviceVariants = [...this.pendingVariants] as ServiceVariant[];

      // Forzar que el estado del formulario sea coherente
      this.formData.has_variants = this.serviceVariants.length > 0;

      this.toastService.info(
        'Servicio clonado',
        'Revisa los datos y pulsa Guardar para crear la copia',
      );
    } catch (error) {
      this.toastService.error(
        'Error al duplicar',
        'No se pudieron recuperar todos los datos del servicio',
      );
    } finally {
      this.loading = false;
    }
  }

  onWaitlistToggle(state: {
    enable_waitlist: boolean;
    active_mode_enabled: boolean;
    passive_mode_enabled: boolean;
  }) {
    // Update formData with waitlist state
    this.formData.enable_waitlist = state.enable_waitlist;
    this.formData.active_mode_enabled = state.active_mode_enabled;
    this.formData.passive_mode_enabled = state.passive_mode_enabled;
  }

  closeForm() {
    this.showForm = false;
    this.editingService = null;
    this.formData = {};
    this.formErrors = {};
    this.showCategoryInput = false;
    this.categoryFilterText = '';

    // Reset tags
    this.pendingTags = [];

    this.serviceVariants = [];
    this.pendingVariants = []; // Limpiar variantes pendientes

    // Reset accordion state
    this.accordionState = {
      basicInfo: true,
      variants: false,
      professionals: false,
      pricing: false,
      planning: false,
      booking: false,
      visibility: false,
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

    // Retroceder en el historial solo si hay entrada de modal
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    }
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

    if (
      this.formData.profit_margin &&
      (this.formData.profit_margin < 0 || this.formData.profit_margin > 1000)
    ) {
      this.formErrors['profit_margin'] = 'El margen debe estar entre 0 y 1000%';
    }

    if (this.formData.min_quantity && this.formData.min_quantity <= 0) {
      this.formErrors['min_quantity'] = 'La cantidad mínima debe ser mayor a 0';
    }

    if (
      this.formData.max_quantity &&
      this.formData.min_quantity &&
      this.formData.max_quantity < this.formData.min_quantity
    ) {
      this.formErrors['max_quantity'] = 'La cantidad máxima debe ser mayor a la mínima';
    }

    if (
      this.formData.difficulty_level &&
      (this.formData.difficulty_level < 1 || this.formData.difficulty_level > 5)
    ) {
      this.formErrors['difficulty_level'] = 'La dificultad debe estar entre 1 y 5';
    }

    if (
      this.formData.priority_level &&
      (this.formData.priority_level < 1 || this.formData.priority_level > 5)
    ) {
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
      // Enforce is_bookable based on active modules (UI switch removed)
      this.formData.is_bookable = this.hasModuloReservas;

      // Add company_id and tags to form data
      const dataWithCompany = {
        ...this.formData,
        company_id: this.selectedCompanyId,
      };

      let savedServiceId: string;

      if (this.editingService) {
        await this.servicesService.updateService(this.editingService.id, dataWithCompany);
        savedServiceId = this.editingService.id;
        // Tags are handled by app-tag-manager automatically in edit mode
      } else {
        const newService = await this.servicesService.createService(dataWithCompany);
        savedServiceId = newService.id;

        // Save pending tags for new service
        if (this.pendingTags.length > 0) {
          try {
            const tagIds = this.pendingTags.map((t) => t.id);
            await this.globalTagsService
              .assignMultipleTags('services', savedServiceId, tagIds)
              .toPromise();
          } catch (tagErr) {
            console.error('Error assigning tags:', tagErr);
            this.toastService.error(
              'Error al guardar tags',
              'El servicio se guardó pero hubo un error con los tags',
            );
          }
        }

        // If user enabled variants but didn't add any yet, reopen the created service so they can add variants
        const wantsVariantsButNone =
          !!this.formData.has_variants && this.pendingVariants.length === 0;

        // Si hay variantes pendientes, crearlas ahora que tenemos el service_id
        if (this.pendingVariants.length > 0) {
          for (const pendingVariant of this.pendingVariants) {
            const variantWithServiceId: ServiceVariant = {
              ...pendingVariant,
              id: '', // Será generado por la DB
              service_id: savedServiceId,
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
          this.toastService.success(
            'Servicio y variantes creados',
            `Se creó el servicio con sus variantes`,
          );
        }

        if (wantsVariantsButNone) {
          // Inform the user and reopen the service edit modal so they can add variants
          this.toastService.info(
            'Servicio creado',
            'El servicio se creó — añade las variantes para completarlo',
          );
          // Reload services so the new service is available, then open the form for it
          await this.loadServices();
          const created = this.services.find((s) => s.id === savedServiceId);
          if (created) {
            // Open the modal in edit mode for the newly created service so the user can add variants
            this.openForm(created);

            // After the view updates, expand the variants accordion, scroll to it and open the variant form
            setTimeout(() => {
              try {
                this.accordionState.variants = true;

                // Scroll the modal body to the variants section
                const modalEl =
                  this.modalBody?.nativeElement || document.querySelector('.modal-body');
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
        // Buscar si ya existe una variante pendiente con el mismo nombre para actualizarla
        const existingIndex = this.pendingVariants.findIndex(
          (v) => v.variant_name === variant.variant_name,
        );

        if (existingIndex >= 0) {
          // Actualizar variante pendiente existente
          this.pendingVariants[existingIndex] = variant;
          this.toastService.success(
            'Variante actualizada',
            'La variante se guardará al crear el servicio',
          );
        } else {
          // Agregar nueva variante pendiente
          this.pendingVariants.push(variant);
          this.toastService.success(
            'Variante guardada',
            'La variante se guardará al crear el servicio',
          );
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
        this.toastService.success(
          'Variante actualizada',
          'La variante se ha actualizado correctamente',
        );
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
        // Buscar por variant_name si variantId no es un UUID válido
        const index = this.pendingVariants.findIndex(
          (v) => v.id === variantId || v.variant_name === variantId,
        );

        if (index >= 0) {
          this.pendingVariants.splice(index, 1);
          this.serviceVariants = [...this.pendingVariants] as ServiceVariant[];
          this.toastService.success(
            'Variante eliminada',
            'La variante pendiente ha sido eliminada',
          );
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
          category: this.formData.category || '',
        };
        await this.servicesService.enableServiceVariants(this.editingService.id, baseFeatures);
        await this.loadServiceVariants(this.editingService.id);
      } else {
        // Disable variants — use dedicated method to avoid sending null fields
        // (generic updateService sends name/description/base_price as undefined → null → PostgREST timeout)
        await this.servicesService.disableServiceVariants(this.editingService.id);
        this.serviceVariants = [];
      }

      this.toastService.success(
        newValue ? 'Variantes activadas' : 'Variantes desactivadas',
        newValue
          ? 'Ahora puedes crear variantes para este servicio'
          : 'Las variantes han sido desactivadas',
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
    const isCurrentlyOpen = this.accordionState[section];

    // Close all sections
    Object.keys(this.accordionState).forEach((key) => {
      (this.accordionState as any)[key] = false;
    });

    // Toggle logic: If it was closed, open it exclusively.
    // If it was already open, it remains closed (all are closed).
    if (!isCurrentlyOpen) {
      this.accordionState[section] = true;
    }
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

    const unit = this.units.find((u) => u.code === service.unit_type);
    return unit ? unit.name : service.unit_type;
  }

  getServiceUnitShortName(service: Service): string {
    if (!service.unit_type) return 'h'; // default fallback

    const unit = this.units.find((u) => u.code === service.unit_type);
    return unit ? unit.code : service.unit_type;
  }

  formatServiceDuration(service: Service): string {
    const value = service.display_hours ?? service.estimated_hours;
    if (!value) return '-';

    const unitName = this.getServiceUnitShortName(service);

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
    this.services.forEach((service) => {
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

    const unit = this.units.find((u) => u.code === mostCommonUnit);
    return unit ? unit.name : mostCommonUnit;
  }

  getServiceStatus(service: Service): string {
    return service.is_active ? 'Activo' : 'Inactivo';
  }

  getServiceStatusClass(service: Service): string {
    return service.is_active ? 'status-active' : 'status-inactive';
  }

  getCategoryColor(category: string): string {
    const colors = {
      Diagnóstico: '#3b82f6',
      Software: '#059669',
      Mantenimiento: '#d97706',
      Datos: '#dc2626',
      Seguridad: '#7c3aed',
      Hardware: '#f59e0b',
      Redes: '#10b981',
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
        if (totalHeight <= viewportHeight + 1) {
          // +1 por posibles diferencias de redondeo
          document.body.style.overflow = 'hidden';
          document.documentElement.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = '';
          document.documentElement.style.overflow = '';
        }
      } catch (e) {
        // Silent fail — scroll state remains unchanged
      }
    });
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.adjustRootScroll();
  }

  /**
   * Get display price info for a service (using server-side calculated fields)
   */
  getDisplayPrice(service: Service): { price: number; isFromVariants: boolean; label: string } {
    return {
      price: service.display_price ?? service.base_price ?? 0,
      isFromVariants: service.display_price_from_variants ?? false,
      label: service.display_price_label ?? 'Precio Base',
    };
  }

  /**
   * Get hourly rate for a service (using server-side calculated field)
   */
  getDisplayHourlyRate(service: Service): number {
    return service.display_hourly_rate ?? 0;
  }

  /**
   * Get representative hours for a service (using server-side calculated field)
   */
  getDisplayHours(service: Service): number {
    return service.display_hours ?? service.estimated_hours ?? 1;
  }

  // ─── Profitability Calculator (live, from formData) ────────────────────────
  get profitability() {
    const price = Number(this.formData.base_price) || 0;
    const cost = Number(this.formData.cost_price) || 0;
    const taxRate = Number(this.formData.tax_rate) ?? 21;
    const margin = Number(this.formData.profit_margin) || 0;

    // Si los precios ya incluyen IVA, el precio con IVA es el precio base
    const priceWithTax = this.pricesIncludeTax ? price : price * (1 + taxRate / 100);

    // El precio neto es lo que realmente gana la empresa (sin impuestos)
    const netPrice = this.pricesIncludeTax ? price / (1 + taxRate / 100) : price;

    const grossProfit = netPrice - cost;
    const realMargin = netPrice > 0 ? (grossProfit / netPrice) * 100 : 0;

    const breakEven = cost > 0 && margin > 0 ? cost / (1 - margin / 100) : null;

    return {
      priceWithTax: Math.round(priceWithTax * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      realMargin: Math.round(realMargin * 10) / 10,
      breakEven: breakEven != null ? Math.round(breakEven * 100) / 100 : null,
      isHealthy: realMargin >= 20,
      isPoor: realMargin < 10 && price > 0,
    };
  }

  // ─── Estimated Completion (Planificación) ──────────────────────────────────
  // Heuristic: base_days + difficulty bonus + padding flags
  get estimatedCompletion() {
    const hours = Number(this.formData.estimated_hours) || 0;
    const difficulty = Number(this.formData.difficulty_level) || 1; // 1–5
    const hasDiag = !!this.formData.requires_diagnosis;
    const hasParts = !!this.formData.requires_parts;
    const available = this.availableHoursPerDay > 0 ? this.availableHoursPerDay : 6;

    if (!hours) return null;

    // Difficulty multiplier: 1x → 1.0, 5x → 1.5
    const diffMultiplier = 1 + (difficulty - 1) * 0.125;
    const effectiveHours = hours * diffMultiplier;
    let workDays = Math.ceil(effectiveHours / available);

    // Diagnosis adds 1 day, parts add 2 days (procurement time)
    if (hasDiag) workDays += 1;
    if (hasParts) workDays += 2;

    const today = new Date();
    const deliveryDate = new Date(today);
    // Skip weekends
    let daysAdded = 0;
    while (daysAdded < workDays) {
      deliveryDate.setDate(deliveryDate.getDate() + 1);
      const dow = deliveryDate.getDay();
      if (dow !== 0 && dow !== 6) daysAdded++;
    }

    return {
      workDays,
      deliveryDate,
      label: workDays === 1 ? '1 día laborable' : `${workDays} días laborables`,
      dateLabel: deliveryDate.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      confidence: difficulty <= 2 ? 'alta' : difficulty <= 3 ? 'media' : 'baja',
    };
  }
}
