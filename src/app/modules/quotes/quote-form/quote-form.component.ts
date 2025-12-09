import { Component, OnInit, AfterViewInit, HostListener, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { ProductsService } from '../../../services/products.service';
import { Customer } from '../../../models/customer';
import { CreateQuoteDTO, CreateQuoteItemDTO, QuoteItem } from '../../../models/quote.model';
import { debounceTime } from 'rxjs/operators';
import { SupabaseSettingsService, type AppSettings, type CompanySettings } from '../../../services/supabase-settings.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../services/toast.service';

interface ClientOption {
  id: string;
  name: string;
  apellidos?: string;
  business_name?: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  // Flag de completitud Verifactu (todos los datos fiscales mínimos presentes)
  complete: boolean;
  // Lista de campos faltantes para mostrar en UI o diagnósticos
  missingFields: string[];
}

interface ServiceOption {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  estimated_hours?: number;
  category?: string;
  has_variants?: boolean;
  variants?: ServiceVariant[];
}

interface ServiceVariant {
  id: string;
  service_id: string;
  variant_name: string;
  billing_period: 'one-time' | 'monthly' | 'annually' | 'custom';
  base_price: number;
  estimated_hours?: number;
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
  sort_order: number;
}

interface ProductOption {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
}

interface QuoteTemplate {
  id: string;
  name: string;
  description?: string;
  items: any[];
}

@Component({
  selector: 'app-quote-form',
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './quote-form.component.html',
  styleUrl: './quote-form.component.scss'
})
export class QuoteFormComponent implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private quotesService = inject(SupabaseQuotesService);
  private customersService = inject(SupabaseCustomersService);
  private servicesService = inject(SupabaseServicesService);
  private productsService = inject(ProductsService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private settingsService = inject(SupabaseSettingsService);
  private modulesService = inject(SupabaseModulesService);
  private toast = inject(ToastService);

  quoteForm!: FormGroup;
  loading = signal(false);
  error = signal<string | null>(null);
  editMode = signal(false);
  quoteId = signal<string | null>(null);
  
  // Selector de clientes
  clients = signal<ClientOption[]>([]);
  clientSearch = signal('');
  clientDropdownOpen = signal(false);
  filteredClients = computed(() => {
    const search = this.clientSearch().toLowerCase();
    if (!search) return this.clients();
    return this.clients().filter(c => 
      c.name.toLowerCase().includes(search) ||
      c.apellidos?.toLowerCase().includes(search) ||
      c.business_name?.toLowerCase().includes(search) ||
      c.tax_id?.includes(search) ||
      c.email?.toLowerCase().includes(search) ||
      c.phone?.includes(search)
    );
  });

  // Helpers para estado de cliente seleccionado (evita funciones arrow en template)
  getSelectedClient(): ClientOption | undefined {
    if (!this.quoteForm) return undefined;
    const id = this.quoteForm.get('client_id')?.value;
    if (!id) return undefined;
    return this.clients().find(c => c.id === id);
  }

  isSelectedClientIncomplete(): boolean {
    const c = this.getSelectedClient();
    return !!c && !c.complete;
  }

  getSelectedClientMissingFields(): string[] {
    const c = this.getSelectedClient();
    return c?.missingFields || [];
  }

  // Dropdown de Estado personalizado
  statusDropdownOpen = signal(false);
  statusOptions = [
    { value: 'draft', label: 'Borrador' },
    { value: 'sent', label: 'Enviado' },
    { value: 'accepted', label: 'Aceptado' },
    { value: 'rejected', label: 'Rechazado' },
    { value: 'expired', label: 'Expirado' }
  ];

  toggleStatusDropdown() {
    this.statusDropdownOpen.set(!this.statusDropdownOpen());
  }

  selectStatus(value: string) {
    this.quoteForm.get('status')?.setValue(value);
    this.statusDropdownOpen.set(false);
  }

  getSelectedStatusLabel(): string {
    const value = this.quoteForm.get('status')?.value;
    const option = this.statusOptions.find(o => o.value === value);
    return option?.label || 'Seleccionar estado';
  }
  
  // Dropdown de Plantilla
  templateDropdownOpen = signal(false);

  toggleTemplateDropdown() {
    this.templateDropdownOpen.set(!this.templateDropdownOpen());
  }

  selectTemplate(templateId: string | null) {
    this.quoteForm.get('template_id')?.setValue(templateId);
    this.templateDropdownOpen.set(false);
  }

  getSelectedTemplateLabel(): string {
    const value = this.quoteForm.get('template_id')?.value;
    if (!value) return 'Sin plantilla';
    const template = this.templates().find(t => t.id === value);
    return template?.name || 'Sin plantilla';
  }
  
  // Dropdown de IVA (Tax Rate) - por ítem
  taxDropdownOpenIndex = signal<number | null>(null);
  taxOptions = [
    { value: 0, label: '0%' },
    { value: 4, label: '4%' },
    { value: 10, label: '10%' },
    { value: 21, label: '21%' }
  ];

  toggleTaxDropdown(index: number) {
    if (this.taxDropdownOpenIndex() === index) {
      this.taxDropdownOpenIndex.set(null);
    } else {
      this.taxDropdownOpenIndex.set(index);
    }
  }

  selectTax(value: number, index: number) {
    this.items.at(index).get('tax_rate')?.setValue(value);
    this.taxDropdownOpenIndex.set(null);
    this.calculateTotals();
  }

  getItemTaxRate(index: number): number {
    return this.items.at(index).get('tax_rate')?.value ?? 21;
  }

  getItemTaxLabel(index: number): string {
    const rate = this.getItemTaxRate(index);
    const option = this.taxOptions.find(o => o.value === rate);
    return option?.label || '21%';
  }
  
  // Selector de servicios
  services = signal<ServiceOption[]>([]);
  serviceSearch = signal('');
  selectedItemIndex = signal<number | null>(null);
  serviceDropdownOpen = signal(false);
  filteredServices = computed(() => {
    const search = this.serviceSearch().toLowerCase();
    if (!search) return this.services();
    return this.services().filter(s => 
      s.name.toLowerCase().includes(search) ||
      s.description?.toLowerCase().includes(search) ||
      s.category?.toLowerCase().includes(search)
    );
  });
  
  // Selector de productos
  products = signal<ProductOption[]>([]);
  productSearch = signal('');
  productDropdownOpen = signal(false);
  selectedProductIndex = signal<number | null>(null);
  filteredProducts = computed(() => {
    const search = this.productSearch().toLowerCase();
    if (!search) return this.products();
    return this.products().filter(p =>
      p.name.toLowerCase().includes(search) ||
      (p.description || '').toLowerCase().includes(search) ||
      (p.brand || '').toLowerCase().includes(search) ||
      (p.model || '').toLowerCase().includes(search) ||
      (p.category || '').toLowerCase().includes(search)
    );
  });
  
  // Selector de variantes
  variantDropdownOpen = signal(false);
  selectedVariantIndex = signal<number | null>(null);
  
  // Recurrence lock (when variant has billing_period)
  recurrenceLocked = signal(false);
  recurrenceLockedReason = signal<string | null>(null);
  
  // Templates
  templates = signal<QuoteTemplate[]>([]);
  selectedTemplate = signal<string | null>(null);
  
  // Cálculos automáticos
  subtotal = signal(0);
  taxAmount = signal(0);
  irpfAmount = signal(0);
  totalAmount = signal(0);

  // Tax configuration (derived from settings)
  pricesIncludeTax = signal<boolean>(false);
  ivaEnabled = signal<boolean>(true);
  ivaRate = signal<number>(21);
  irpfEnabled = signal<boolean>(false);
  irpfRate = signal<number>(15);
  
  // Preview
  showPreview = signal(false);

  // Server-side allowed modules set for this user/company
  allowedModuleKeysSet = signal<Set<string> | null>(null);

  productModuleEnabled(): boolean {
    const s = this.allowedModuleKeysSet();
    // If modules not loaded yet, be conservative and treat as disabled
    if (!s) return false;
    return s.has('moduloMaterial');
  }

  // Sticky sidebar handling
  @ViewChild('rightCol') rightCol!: ElementRef<HTMLDivElement>;
  @ViewChild('summaryAside') summaryAside!: ElementRef<HTMLElement>;
  private stickyInitialTop = 0;
  private isFixed = false;
  private rAFPending = false;
  fixedSpacerHeight = 0;
  summaryStyles: { [k: string]: any } = {};

  ngOnInit() {
    this.initForm();
    this.loadClients();
    this.loadServices();
    this.loadTemplates();
  this.loadProducts();
    this.loadTaxSettings();
    this.setupAutoCalculations();
    
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.editMode.set(true);
        this.quoteId.set(params['id']);
        this.loadQuote(params['id']);
      }
    });

    // Load effective modules and build allowed set
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods) => {
        const allowed = new Set(mods.filter((m: any) => m.enabled).map((m: any) => m.key));
        this.allowedModuleKeysSet.set(allowed);
      },
      error: (e) => {
        console.warn('No se pudieron cargar los módulos efectivos (quotes):', e);
        // mark as loaded with empty set -> modules disabled
        this.allowedModuleKeysSet.set(new Set());
      }
    });
  }

  ngAfterViewInit() {
    // Initialize sticky after view is ready
    setTimeout(() => {
      this.initSticky();
      this.scheduleStickyUpdate();
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    // Cerrar dropdown de clientes si se hace clic fuera
    if (!target.closest('.client-dropdown-container')) {
      this.closeClientDropdown();
    }
    
    // Cerrar dropdown de servicios si se hace clic fuera
    if (!target.closest('.service-dropdown-container')) {
      this.closeServiceDropdown();
    }
    
    // Cerrar dropdown de variantes si se hace clic fuera
    if (!target.closest('.variant-dropdown-container')) {
      this.closeVariantDropdown();
    }
    
    // Cerrar dropdown de estado si se hace clic fuera
    if (!target.closest('.status-dropdown-container')) {
      this.statusDropdownOpen.set(false);
    }
    
    // Cerrar dropdown de plantilla si se hace clic fuera
    if (!target.closest('.template-dropdown-container')) {
      this.templateDropdownOpen.set(false);
    }
    
    // Cerrar dropdown de IVA si se hace clic fuera
    if (!target.closest('.tax-dropdown-container')) {
      this.taxDropdownOpenIndex.set(null);
    }
  }

  @HostListener('window:scroll')
  onWindowScroll() { this.scheduleStickyUpdate(); }

  @HostListener('window:resize')
  onWindowResize() {
    this.initSticky();
    this.scheduleStickyUpdate();
  }

  private initSticky() {
    if (!this.rightCol) return;
    const rect = this.rightCol.nativeElement.getBoundingClientRect();
    this.stickyInitialTop = window.scrollY + rect.top;
  }

  private scheduleStickyUpdate() {
    if (this.rAFPending) return;
    this.rAFPending = true;
    requestAnimationFrame(() => {
      this.rAFPending = false;
      this.applySticky();
    });
  }

  private applySticky() {
    // Only apply on large screens (lg: 1024px)
    if (window.innerWidth < 1024 || !this.rightCol) {
      this.isFixed = false;
      this.fixedSpacerHeight = 0;
      this.summaryStyles = {};
      return;
    }

    const offset = 24; // matches top-6
    const containerRect = this.rightCol.nativeElement.getBoundingClientRect();
    const width = Math.round(containerRect.width);

    const shouldFix = window.scrollY + offset >= this.stickyInitialTop;
    if (shouldFix) {
      const left = Math.round(containerRect.left + window.scrollX);
      // set spacer height once when entering fixed
      if (!this.isFixed && this.summaryAside) {
        this.fixedSpacerHeight = this.summaryAside.nativeElement.offsetHeight || 0;
      }
      this.isFixed = true;
      this.summaryStyles = {
        position: 'fixed',
        top: offset + 'px',
        left: left + 'px',
        width: width + 'px',
        zIndex: 40,
        transition: 'top 180ms ease-out, left 180ms ease-out, width 180ms ease-out'
      };

  
  
    } else {
      this.isFixed = false;
      this.fixedSpacerHeight = 0;
      this.summaryStyles = {};
    }
  }

  initForm() {
    const today = new Date().toISOString().split('T')[0];
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30); // 30 días por defecto
    
    this.quoteForm = this.fb.group({
      client_id: ['', Validators.required],
      title: ['', Validators.required],
      description: [''],
      issue_date: [today, Validators.required],
      valid_until: [validUntil.toISOString().split('T')[0], Validators.required],
      status: ['draft', Validators.required],
      template_id: [null],
      notes: [''],
      terms_conditions: [''],
      // Recurrencia
      recurrence_type: ['none'], // none | weekly | monthly | quarterly | yearly
      recurrence_day: [null],    // semanal: 0-6; mensual/anual: 1-28
      recurrence_start_date: [null],
      recurrence_end_date: [null],
      recurrence_interval: [1],
      items: this.fb.array([this.createItemFormGroup()])
    });

    // Si el usuario selecciona una plantilla, aplicamos sus items automáticamente
    const templateCtrl = this.quoteForm.get('template_id');
    templateCtrl?.valueChanges.subscribe((val) => {
      // Manejar valores null o cadena 'null' desde el <select>
      if (val && val !== 'null') {
        this.applyTemplate(String(val));
      }
    });

    // Reglas de habilitado/limpieza para recurrencia
    const recTypeCtrl = this.quoteForm.get('recurrence_type');
    recTypeCtrl?.valueChanges.subscribe((type) => {
      const dayCtrl = this.quoteForm.get('recurrence_day');
      const startCtrl = this.quoteForm.get('recurrence_start_date');
      const endCtrl = this.quoteForm.get('recurrence_end_date');
      const intervalCtrl = this.quoteForm.get('recurrence_interval');

      if (type === 'none') {
        dayCtrl?.setValue(null, { emitEvent: false });
        startCtrl?.setValue(null, { emitEvent: false });
        endCtrl?.setValue(null, { emitEvent: false });
        intervalCtrl?.setValue(1, { emitEvent: false });
      } else if (type === 'weekly') {
        // por defecto Lunes (1), valores 0-6 con Domingo=0
        if (dayCtrl?.value === null || dayCtrl?.value === undefined) {
          dayCtrl?.setValue(1, { emitEvent: false });
        }
        intervalCtrl?.setValue(1, { emitEvent: false });
      } else {
        // mensual/trimestral/anual -> día del mes (1-28)
        if (!dayCtrl?.value || dayCtrl?.value < 1) {
          dayCtrl?.setValue(1, { emitEvent: false });
        }
        intervalCtrl?.setValue(1, { emitEvent: false });
      }
    });
  }

  createItemFormGroup(): FormGroup {
    return this.fb.group({
      description: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      tax_rate: [{ value: this.ivaEnabled() ? this.ivaRate() : 0, disabled: !this.ivaEnabled() }, [Validators.required, Validators.min(0), Validators.max(100)]],
      discount_percent: [0, [Validators.min(0), Validators.max(100)]],
      notes: [''],
      service_id: [null],
      variant_id: [null],
      product_id: [null],
      billing_period: [null]
    });
  }

  setupAutoCalculations() {
    this.quoteForm.get('items')?.valueChanges
      .pipe(debounceTime(300))
      .subscribe(() => {
        this.calculateTotals();
      });
  }

  calculateTotals() {
    let subtotal = 0;
    let taxAmount = 0;
    let baseNetForIrpf = 0;

    this.items.controls.forEach((group) => {
      const qty = Number(group.get('quantity')?.value ?? 0);
      const price = Number(group.get('unit_price')?.value ?? 0);
      // Leer descuento directamente del control para evitar desincronizaciones (especialmente en el primer ítem)
      const discount = Number(group.get('discount_percent')?.value ?? 0);
      const taxRate = Number(group.get('tax_rate')?.value ?? 0);

      if (this.pricesIncludeTax() && this.ivaEnabled() && taxRate > 0) {
        // unit_price es BRUTO (IVA incluido): convertir a neto y luego aplicar descuento
        const gross = qty * price;
        const netBeforeDiscount = gross / (1 + taxRate / 100);
        const itemDiscount = netBeforeDiscount * (discount / 100);
        const itemNet = netBeforeDiscount - itemDiscount;
        const itemTax = itemNet * (taxRate / 100);
        subtotal += itemNet;
        taxAmount += itemTax;
        baseNetForIrpf += itemNet;
      } else {
        // unit_price es NETO
        const itemSubtotal = qty * price;
        const itemDiscount = itemSubtotal * (discount / 100);
        const itemNet = itemSubtotal - itemDiscount;
        const itemTax = (this.ivaEnabled() ? itemNet * (taxRate / 100) : 0);
        subtotal += itemNet;
        taxAmount += itemTax;
        baseNetForIrpf += itemNet;
      }
    });

    this.subtotal.set(subtotal);
    this.taxAmount.set(taxAmount);
    const irpf = this.irpfEnabled() ? baseNetForIrpf * (this.irpfRate() / 100) : 0;
    this.irpfAmount.set(irpf);
    this.totalAmount.set(subtotal + taxAmount - irpf);
  }

  // Método para mostrar el importe correcto según configuración
  displayAmount(): number {
    // Si los precios incluyen IVA, mostramos el subtotal (neto)
    // Si no, mostramos el total con IVA
    if (this.pricesIncludeTax()) {
      return this.subtotal();
    }
    return this.totalAmount();
  }

  loadClients() {
    this.customersService.getCustomers().subscribe({
      next: (customers: Customer[]) => {
        this.clients.set(customers.map(c => {
          const { complete, missingFields } = this.customersService.computeCompleteness(c);
          const nombre = c.nombre || c.name;
          const telefono = c.telefono || c.phone;
          return {
            id: c.id,
            name: nombre || 'Sin nombre',
            apellidos: c.apellidos,
            business_name: c.empresa || c.business_name,
            tax_id: c.dni || c.cif_nif,
            email: c.email,
            phone: telefono,
            complete,
            missingFields
          } as ClientOption;
        }));
      },
      error: (err) => {
        console.error('Error al cargar clientes:', err);
        this.error.set('Error al cargar clientes');
      }
    });
  }

  async loadServices() {
    try {
      const services = await this.servicesService.getServices();
      // Map services with variants
      const servicesWithVariants = await Promise.all(
        services.map(async (s: Service) => {
          const variants = s.has_variants && s.id 
            ? await this.servicesService.getServiceVariants(s.id)
            : [];
          return {
            id: s.id,
            name: s.name,
            description: s.description,
            base_price: s.base_price,
            estimated_hours: s.estimated_hours,
            category: s.category,
            has_variants: s.has_variants,
            variants: variants.filter(v => v.is_active).sort((a, b) => a.sort_order - b.sort_order)
          } as ServiceOption;
        })
      );
      this.services.set(servicesWithVariants);
    } catch (err) {
      console.error('Error al cargar servicios:', err);
      // No mostramos error para no bloquear el formulario
    }
  }

  async loadProducts() {
    try {
      this.productsService.getProducts().subscribe({
        next: (prods) => {
          this.products.set(prods.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            brand: p.brand,
            model: p.model,
            category: p.category
          })));
        },
        error: (err) => {
          console.warn('Error al cargar productos:', err);
        }
      });
    } catch (err) {
      console.warn('Error al cargar productos:', err);
    }
  }

  loadTemplates() {
    // Mock data - reemplazar con servicio real
    this.templates.set([
      {
        id: '1',
        name: 'Servicios de consultoría',
        description: 'Template para servicios de consultoría estándar',
        items: [
          { description: 'Consultoría inicial', quantity: 1, unit_price: 500, tax_rate: 21 },
          { description: 'Horas de desarrollo', quantity: 40, unit_price: 60, tax_rate: 21 }
        ]
      },
      {
        id: '2',
        name: 'Mantenimiento web',
        description: 'Template para servicios de mantenimiento web mensual',
        items: [
          { description: 'Mantenimiento básico', quantity: 1, unit_price: 150, tax_rate: 21 },
          { description: 'Actualizaciones de seguridad', quantity: 1, unit_price: 75, tax_rate: 21 }
        ]
      }
    ]);
  }

  loadQuote(id: string) {
    this.loading.set(true);
    this.quotesService.getQuote(id).subscribe({
      next: (quote) => {
        console.log('📄 Cargando presupuesto para edición:', quote);
        
        // Cargar datos principales del formulario
        this.quoteForm.patchValue({
          client_id: quote.client_id,
          title: quote.title,
          description: quote.description || '',
          issue_date: quote.quote_date,
          valid_until: quote.valid_until,
          status: quote.status,
          notes: quote.notes || '',
          terms_conditions: quote.terms_conditions || '',
          // Recurrencia
          recurrence_type: (quote as any).recurrence_type || 'none',
          recurrence_day: (quote as any).recurrence_day ?? null,
          recurrence_start_date: (quote as any).recurrence_start_date ?? null,
          recurrence_end_date: (quote as any).recurrence_end_date ?? null,
          recurrence_interval: (quote as any).recurrence_interval ?? 1
        });

        // Limpiar items actuales
        while (this.items.length > 0) {
          this.items.removeAt(0);
        }

        // Cargar items del presupuesto
        if (quote.items && quote.items.length > 0) {
          console.log('🔍 Items recibidos de BD:', quote.items);
          quote.items.forEach((item: QuoteItem) => {
            const itemGroup = this.createItemFormGroup();
            const patchData = {
              description: item.description,
              quantity: item.quantity,
              // Fallback for legacy data that might use different field names
              unit_price: (item as any).unit_price ?? (item as any).price ?? (item as any).price_per_unit ?? 0,
              tax_rate: item.tax_rate,
              discount_percent: item.discount_percent || 0,
              notes: item.notes || '',
              service_id: (item as any).service_id || null,
              product_id: (item as any).product_id || null,
              variant_id: (item as any).variant_id || null,
              billing_period: (item as any).billing_period || null
            };
            console.log('🔍 Datos a patchear en item:', patchData);
            itemGroup.patchValue(patchData);
            this.items.push(itemGroup);
          });
        } else {
          // Si no hay items, añadir uno vacío
          this.items.push(this.createItemFormGroup());
        }

        // Recheck recurrence lock and backfill empty descriptions (ensure services present)
        (async () => {
          console.log('🔍 Services disponibles antes de recheck:', this.services().length);
          await this.recheckRecurrenceLock();
          await this.backfillEmptyItemDescriptions();
        })();
        
        this.calculateTotals();
        this.loading.set(false);
        console.log('✅ Presupuesto cargado correctamente en el formulario');
      },
      error: (err) => {
        console.error('❌ Error al cargar presupuesto:', err);
        this.error.set('Error al cargar presupuesto: ' + err.message);
        this.loading.set(false);
      }
    });
  }

  /**
   * If some items come from DB with empty description, fill them using service description/name
   * and append variant name when available. This improves UX on edit even if legacy rows exist.
   */
  private async backfillEmptyItemDescriptions() {
    for (let i = 0; i < this.items.length; i++) {
      const grp = this.items.at(i);
      const current = (grp.get('description')?.value || '').toString().trim();
      let serviceId = grp.get('service_id')?.value as string | null;
      const variantId = grp.get('variant_id')?.value as string | null;
      // Legacy: infer service_id from variant if missing
      if (!serviceId && variantId) {
        try {
          const v = await this.servicesService.getVariantById(variantId);
          if (v?.service_id) {
            serviceId = v.service_id;
            grp.patchValue({ service_id: serviceId });
          }
        } catch {}
      }
      // Ensure service is loaded if referenced
      let service: ServiceOption | undefined;
      if (serviceId) {
        service = this.services().find(s => s.id === serviceId);
        if (!service) {
          try {
            const s = await this.servicesService.getServiceWithVariants(serviceId);
            service = {
              id: s.id,
              name: s.name,
              description: s.description,
              base_price: s.base_price,
              estimated_hours: s.estimated_hours,
              category: s.category,
              has_variants: s.has_variants,
              variants: (s.variants || []).filter(v => v.is_active).sort((a, b) => a.sort_order - b.sort_order)
            } as ServiceOption;
            const map = new Map(this.services().map(ss => [ss.id, ss] as [string, ServiceOption]));
            map.set(service.id, service);
            this.services.set(Array.from(map.values()));
          } catch {}
        }
      }

      const baseServiceDesc = service ? (service.description || service.name) : '';

      // Desired behavior: description must remain ONLY the service description (or name) without variant suffix.
      // 1. If empty and we have a service: set it.
      if (!current && baseServiceDesc) {
        grp.patchValue({ description: baseServiceDesc });
        continue;
      }

      // 2. If description previously contained a variant suffix ("Servicio - Variante"), strip it.
      if (current && baseServiceDesc && current.startsWith(baseServiceDesc + ' - ')) {
        grp.patchValue({ description: baseServiceDesc });
        continue;
      }
    }
  }

  applyTemplate(templateId: string) {
    const template = this.templates().find(t => t.id === templateId);
    if (!template) return;

    // Limpiar items actuales
    while (this.items.length > 0) {
      this.items.removeAt(0);
    }

    // Añadir items del template
    template.items.forEach(item => {
      const group = this.createItemFormGroup();
      group.patchValue(item);
      this.items.push(group);
    });

    this.selectedTemplate.set(templateId);
    this.calculateTotals();
  }

  get items(): FormArray {
    return this.quoteForm.get('items') as FormArray;
  }

  addItem() {
    this.items.push(this.createItemFormGroup());
  }

  removeItem(index: number) {
    if (this.items.length > 1) {
      this.items.removeAt(index);
      this.calculateTotals();
      
      // Recheck if recurrence should still be locked
      this.recheckRecurrenceLock();
    }
  }

  /**
   * Recheck if any remaining variant requires recurrence lock
   */
  private async recheckRecurrenceLock() {
    console.log('🔒 recheckRecurrenceLock() iniciado');

    // Ensure services with variants are available. If not, load on-demand for the services used in items.
    if (!this.services() || this.services().length === 0) {
      const serviceIds = new Set<string>();
      for (let i = 0; i < this.items.length; i++) {
        const sid = this.items.at(i).get('service_id')?.value as string | null;
        if (sid) serviceIds.add(sid);
      }
      if (serviceIds.size > 0) {
        try {
          const loaded = await Promise.all(
            Array.from(serviceIds).map(async (sid) => {
              const s = await this.servicesService.getServiceWithVariants(sid);
              return {
                id: s.id,
                name: s.name,
                description: s.description,
                base_price: s.base_price,
                estimated_hours: s.estimated_hours,
                category: s.category,
                has_variants: s.has_variants,
                variants: (s.variants || []).filter(v => v.is_active).sort((a, b) => a.sort_order - b.sort_order)
              } as ServiceOption;
            })
          );
          // Merge with any existing services (avoid duplicates by id)
          const existing = this.services();
          const map = new Map<string, ServiceOption>();
          [...existing, ...loaded].forEach(s => map.set(s.id, s));
          this.services.set(Array.from(map.values()));
        } catch (e) {
          console.warn('No se pudieron cargar servicios para re-evaluar recurrencia:', e);
        }
      }
    }

    let hasLockedVariant = false;
    let lockedVariant: ServiceVariant | null = null;
    
    // Check all items for variants with billing periods
    for (let i = 0; i < this.items.length; i++) {
      const variantId = this.items.at(i).get('variant_id')?.value;
      const serviceId = this.items.at(i).get('service_id')?.value;
      console.log(`🔍 Item ${i}: variantId=${variantId}, serviceId=${serviceId}`);
      
      if (variantId && serviceId) {
        const service = this.services().find(s => s.id === serviceId);
        console.log('🔍 Service encontrado:', service?.name, 'con variants:', service?.variants?.length);
        const variant = service?.variants?.find(v => v.id === variantId);
        console.log('🔍 Variant encontrada:', variant?.variant_name, 'billing_period:', variant?.billing_period);
        
        if (variant) {
          // Prefer pricing array (new model). If absent, fall back to deprecated billing_period.
          const parsed = this.variantPricing(variant);
          const pricingPeriods: string[] = parsed.length > 0 ? parsed.map((p: any) => p.billing_period) : [];

          const hasRecurringInPricing = pricingPeriods.some(p => ['monthly', 'annually'].includes(p));
          const hasDeprecatedRecurring = ['monthly', 'annually'].includes(variant.billing_period as any);
          console.log('🔍 hasRecurringInPricing:', hasRecurringInPricing, 'hasDeprecatedRecurring:', hasDeprecatedRecurring);

          if (hasRecurringInPricing || hasDeprecatedRecurring) {
            hasLockedVariant = true;
            lockedVariant = variant;
            console.log('✅ Variant recurrente encontrada, bloqueando recurrencia');
            break;
          }
        }
      }
    }
    
    if (hasLockedVariant && lockedVariant) {
      console.log('🔒 Llamando updateRecurrenceFromVariant');
      this.updateRecurrenceFromVariant(lockedVariant);
    } else {
      console.log('🔓 No hay variantes recurrentes, desbloqueando');
      this.unlockRecurrence();
    }
  }

  duplicateItem(index: number) {
    const item = this.items.at(index);
    const newItem = this.createItemFormGroup();
    newItem.patchValue(item.value);
    this.items.insert(index + 1, newItem);
    this.calculateTotals();
  }

  selectClient(clientId: string) {
    this.quoteForm.patchValue({ client_id: clientId });
    this.clientSearch.set('');
    this.clientDropdownOpen.set(false);
  }

  toggleClientDropdown() {
    this.clientDropdownOpen.set(!this.clientDropdownOpen());
  }

  closeClientDropdown() {
    this.clientDropdownOpen.set(false);
  }

  getSelectedClientName(): string {
    const clientId = this.quoteForm.get('client_id')?.value;
    if (!clientId) return 'Seleccionar cliente';
    const client = this.clients().find(c => c.id === clientId);
    return client?.business_name || client?.name || 'Cliente seleccionado';
  }

  // Métodos para selector de servicios
  toggleServiceDropdown(itemIndex: number) {
    if (this.selectedItemIndex() === itemIndex && this.serviceDropdownOpen()) {
      this.serviceDropdownOpen.set(false);
      this.selectedItemIndex.set(null);
    } else {
      this.selectedItemIndex.set(itemIndex);
      this.serviceDropdownOpen.set(true);
      this.serviceSearch.set('');
    }
  }

  selectService(service: ServiceOption, itemIndex: number) {
    const item = this.items.at(itemIndex);
    // Compute unit price respecting settings
    const base = Number(service.base_price || 0); // asumimos base siempre NETO
    const finalUnit = base; // nunca inflar aquí; la vista calculará IVA incluido si se requiere
    
    // Si el servicio tiene variantes, seleccionar automáticamente la primera activa
    let autoVariant: ServiceVariant | null = null;
    if (service.has_variants && service.variants && service.variants.length > 0) {
      autoVariant = service.variants[0];
    }
    
    if (autoVariant) {
      // Establecer service_id primero, antes de seleccionar variante
      item.patchValue({
        service_id: service.id,
        product_id: null
      });
      // Auto-seleccionar primera variante
      this.selectVariant(autoVariant, itemIndex);
    } else {
      // Servicio sin variantes: uso normal
      // Only auto-fill description if the user hasn't already entered one
      const currentDesc = (item.get('description')?.value || '').toString().trim();
      const toPatch: any = {
        unit_price: finalUnit,
        quantity: 1,
        tax_rate: this.ivaEnabled() ? this.ivaRate() : 0,
        service_id: service.id,
        variant_id: null,
        product_id: null,
        billing_period: 'one-time'
      };
      if (!currentDesc) {
        toPatch.description = service.description;
      }
      item.patchValue(toPatch);
    }
    
    this.serviceDropdownOpen.set(false);
    this.selectedItemIndex.set(null);
    this.serviceSearch.set('');
    
    // Recheck recurrence lock after service change
    this.recheckRecurrenceLock();
    
    this.calculateTotals();
  }

  closeServiceDropdown() {
    this.serviceDropdownOpen.set(false);
    this.selectedItemIndex.set(null);
  }

  // Métodos para selector de productos
  toggleProductDropdown(itemIndex: number) {
    if (this.selectedProductIndex() === itemIndex && this.productDropdownOpen()) {
      this.productDropdownOpen.set(false);
      this.selectedProductIndex.set(null);
    } else {
      this.selectedProductIndex.set(itemIndex);
      this.productDropdownOpen.set(true);
      this.productSearch.set('');
    }
  }

  selectProduct(product: ProductOption, itemIndex: number) {
    const item = this.items.at(itemIndex);
    // Compute unit price respecting settings
    const base = Number(product.price || 0); // precio neto
    const finalUnit = base;
    // Only auto-fill description if the user hasn't already entered one
    const currentDescP = (item.get('description')?.value || '').toString().trim();
    const toPatchP: any = {
      unit_price: finalUnit,
      quantity: 1,
      tax_rate: this.ivaEnabled() ? this.ivaRate() : 0,
      product_id: product.id,
      service_id: null,
      billing_period: 'one-time'
    };
    if (!currentDescP) {
      toPatchP.description = product.description || product.name;
    }
    item.patchValue(toPatchP);
    this.productDropdownOpen.set(false);
    this.selectedProductIndex.set(null);
    this.productSearch.set('');
    this.calculateTotals();
  }

  closeProductDropdown() {
    this.productDropdownOpen.set(false);
    this.selectedProductIndex.set(null);
  }

  // Métodos para selector de variantes
  toggleVariantDropdown(itemIndex: number) {
    if (this.selectedVariantIndex() === itemIndex && this.variantDropdownOpen()) {
      this.variantDropdownOpen.set(false);
      this.selectedVariantIndex.set(null);
    } else {
      this.selectedVariantIndex.set(itemIndex);
      this.variantDropdownOpen.set(true);
    }
  }

  selectVariant(variant: ServiceVariant, itemIndex: number) {
    const item = this.items.at(itemIndex);
    // Compute unit price respecting settings
    // Prefer new pricing array (first element) when available, otherwise fall back to deprecated base_price
    let base = 0;
    let chosenPeriod: string | null = null;
    const parsedPricing = this.variantPricing(variant);
    if (parsedPricing.length > 0) {
      // Elegir entrada de pricing más adecuada (prioridad mensual > anual > quarterly > one_time > primera)
      const entries = parsedPricing as any[];
      const preferred = entries.find(e => e.billing_period === 'monthly')
        || entries.find(e => e.billing_period === 'annual')
        || entries.find(e => e.billing_period === 'quarterly')
        || entries.find(e => e.billing_period === 'one_time')
        || entries[0];
      base = Number(preferred?.base_price ?? 0);
      chosenPeriod = preferred?.billing_period || null;
    } else {
      base = Number(variant.base_price || 0);
      chosenPeriod = variant.billing_period || 'one-time';
    }
    const finalUnit = base; // almacenar siempre neto
    
    // Description handling: append variant name if not present when description is
    // (a) empty or (b) exactly the service description/name. Avoid overwriting full custom texts.
    const existingDesc = (item.get('description')?.value || '').toString().trim();
    const patchObj: any = {
      unit_price: finalUnit,
      variant_id: variant.id,
      service_id: variant.service_id
    };
    // Auto-fill description from service when empty (do not overwrite custom text)
    try {
      const existingDesc = (item.get('description')?.value || '').toString().trim();
      if (!existingDesc) {
        const svc = this.services().find(s => s.id === variant.service_id);
        const baseDesc = svc ? (svc.description || svc.name) : '';
        if (baseDesc) patchObj.description = baseDesc;
      }
    } catch {}
    // Auto-fill discount from variant/pricing if item doesn't already have a discount
    try {
      const currentDiscount = Number(item.get('discount_percent')?.value ?? 0);
      // preferred was calculated above when choosing pricing; try to reuse it
      const parsedPricing = this.variantPricing(variant);
      let variantDiscount = 0;
      // If parsed pricing exists, try to find the preferred entry used earlier
      if (parsedPricing.length > 0) {
        const entries = parsedPricing as any[];
        const preferred = entries.find(e => e.billing_period === 'monthly')
          || entries.find(e => e.billing_period === 'annual')
          || entries.find(e => e.billing_period === 'quarterly')
          || entries.find(e => e.billing_period === 'one_time')
          || entries[0];
        variantDiscount = Number(
          (preferred && (preferred.discount_percent ?? preferred.discount_percentage)) ?? 0
        );
      }
      // Fallbacks on variant level (support both naming styles)
      if (!variantDiscount) variantDiscount = Number(((variant as any).discount_percent ?? (variant as any).discount_percentage) ?? 0);
      if ((currentDiscount === 0 || currentDiscount === null || Number.isNaN(currentDiscount)) && variantDiscount > 0) {
        // Set explicitly to avoid UI not refreshing (observed on first item)
        const discCtrl = item.get('discount_percent');
        if (discCtrl) {
          discCtrl.setValue(variantDiscount, { emitEvent: true });
          discCtrl.markAsDirty();
          discCtrl.updateValueAndValidity({ emitEvent: false });
        } else {
          patchObj.discount_percent = variantDiscount;
        }
      }
    } catch {}
    // Do NOT modify description anymore; keep it strictly as service description or user custom text.
    // (If empty, we leave it empty so backfill can supply service description later.)
    item.patchValue(patchObj);
    // Asegurar que el control refleja inmediatamente el precio (a veces patchValue no refresca visualmente en algunos escenarios de signals)
    const unitCtrl = item.get('unit_price');
    if (unitCtrl) {
      unitCtrl.setValue(finalUnit, { emitEvent: true });
      unitCtrl.markAsDirty();
      unitCtrl.updateValueAndValidity({ emitEvent: false });
    }
    // Guardar periodicidad normalizada
    item.patchValue({ billing_period: this.normalizeBillingPeriod(chosenPeriod) });
    this.variantDropdownOpen.set(false);
    this.selectedVariantIndex.set(null);
    
    // Auto-set recurrence based on variant billing_period
    this.updateRecurrenceFromVariant(variant);
    // Re-evaluate aggregate recurrence across all items (new rule: if ANY one-time/custom => none; else choose least restrictive / largest interval)
    this.evaluateAggregateRecurrence();
    
    this.calculateTotals();
  }

  /** Seleccionar explícitamente una entrada de pricing (periodicidad concreta) */
  selectVariantPeriod(variant: ServiceVariant, pricing: any, itemIndex: number, event?: Event) {
    if (event) event.stopPropagation();
    const item = this.items.at(itemIndex);
    const period = pricing?.billing_period || null;
    const unit = Number(pricing?.base_price ?? 0);
    // If description is empty, auto-fill from service
    const toPatch: any = {
      unit_price: unit,
      variant_id: variant.id,
      service_id: variant.service_id,
      billing_period: this.normalizeBillingPeriod(period)
    };
    try {
      const existing = (item.get('description')?.value || '').toString().trim();
      if (!existing) {
        const svc = this.services().find(s => s.id === variant.service_id);
        const baseDesc = svc ? (svc.description || svc.name) : '';
        if (baseDesc) toPatch.description = baseDesc;
      }
    } catch {}
    // Auto-fill discount from pricing entry or variant if item doesn't already have a discount
    try {
      const currentDiscount = Number(item.get('discount_percent')?.value ?? 0);
      let pricingDiscount = Number((pricing?.discount_percent ?? pricing?.discount_percentage) ?? 0);
      if (!pricingDiscount) pricingDiscount = Number(((variant as any).discount_percent ?? (variant as any).discount_percentage) ?? 0);
      if ((currentDiscount === 0 || currentDiscount === null || Number.isNaN(currentDiscount)) && pricingDiscount > 0) {
        const discCtrl = item.get('discount_percent');
        if (discCtrl) {
          discCtrl.setValue(pricingDiscount, { emitEvent: true });
          discCtrl.markAsDirty();
          discCtrl.updateValueAndValidity({ emitEvent: false });
        } else {
          toPatch.discount_percent = pricingDiscount;
        }
      }
    } catch {}
    item.patchValue(toPatch);
    // Refresco explícito del control para evitar que se quede mostrando 0
    const unitCtrl = item.get('unit_price');
    if (unitCtrl) {
      unitCtrl.setValue(unit, { emitEvent: true });
      unitCtrl.markAsDirty();
      unitCtrl.updateValueAndValidity({ emitEvent: false });
    }
    this.updateRecurrenceFromBillingPeriod(period);
    // Re-evaluate aggregate recurrence across all items after explicit period selection
    this.evaluateAggregateRecurrence();
    this.variantDropdownOpen.set(false);
    this.selectedVariantIndex.set(null);
    this.calculateTotals();
  }

  /** Normaliza valores distintos de periodicidad a un set consistente */
  private normalizeBillingPeriod(period: string | null | undefined): string | null {
    if (!period) return null;
    const map: Record<string, string> = {
      'one-time': 'one-time',
      'one_time': 'one-time',
      'monthly': 'monthly',
      'annually': 'annually',
      'annual': 'annually',
      'quarterly': 'quarterly',
      'custom': 'custom',
      'yearly': 'annually'
    };
    return map[period] || period;
  }

  /** Actualiza la recurrencia a partir de un billing_period directamente seleccionado */
  private updateRecurrenceFromBillingPeriod(billingPeriod: string | null | undefined) {
    if (!billingPeriod) {
      this.unlockRecurrence();
      return;
    }
    const norm = this.normalizeBillingPeriod(billingPeriod);
    const map: Record<string, string> = {
      'one-time': 'none',
      'monthly': 'monthly',
      'annually': 'yearly',
      'annual': 'yearly'
    };
    const recurrenceType = map[norm || 'one-time'] || 'none';
    const shouldLock = ['monthly', 'yearly'].includes(recurrenceType);
    if (shouldLock) {
      this.recurrenceLocked.set(true);
      const periodNames: Record<string, string> = { monthly: 'Mensual', yearly: 'Anual' };
      this.recurrenceLockedReason.set(`Este servicio tiene facturación ${periodNames[recurrenceType] || recurrenceType}`);
      this.quoteForm.patchValue({ recurrence_type: recurrenceType });
      this.quoteForm.get('recurrence_type')?.disable();
      if ((recurrenceType === 'monthly' || recurrenceType === 'yearly') && !this.quoteForm.get('recurrence_day')?.value) {
        this.quoteForm.patchValue({ recurrence_day: 1 });
      }
    } else {
      this.unlockRecurrence();
    }
  }

  /**
   * Nueva lógica agregada de recurrencia:
   * - Si hay >1 ítem y alguno es one-time/custom/undefined => la cotización NO es recurrente (recurrence_type = 'none').
   * - Si TODOS los ítems son recurrentes, elegir la periodicidad menos restrictiva (la de mayor intervalo).
   *   Orden de menor a mayor intervalo: weekly < monthly < quarterly < annually.
   *   "Menos restrictiva" => mayor intervalo (annually más que monthly, etc.).
   */
  private evaluateAggregateRecurrence() {
    try {
      const periods = this.items.controls.map(ctrl => this.normalizeBillingPeriod(ctrl.get('billing_period')?.value));
      if (periods.length === 0) return; // nothing yet

      // Si cualquier periodo es one-time/custom/null => NONE
      if (periods.some(p => !p || p === 'one-time' || p === 'custom')) {
        // Sólo forzar none si actualmente está lockeado o distinto
        const current = this.quoteForm.get('recurrence_type')?.value;
        if (current !== 'none') {
          this.quoteForm.patchValue({ recurrence_type: 'none' });
        }
        this.unlockRecurrence();
        return;
      }

      // Todos son recurrentes. Elegimos el de mayor intervalo.
      // Ranking: weekly(1), monthly(2), quarterly(3), annually(4)
      const rank: Record<string, number> = { weekly: 1, monthly: 2, quarterly: 3, annually: 4 };
      let chosen: string | null = null;
      let maxRank = -1;
      for (const p of periods) {
        if (!p) continue;
        const r = rank[p] ?? 0;
        if (r > maxRank) { maxRank = r; chosen = p; }
      }
      if (!chosen) {
        // fallback
        this.quoteForm.patchValue({ recurrence_type: 'none' });
        this.unlockRecurrence();
        return;
      }
      // Map billing_period -> recurrence_type
      const map: Record<string, string> = {
        weekly: 'weekly',
        monthly: 'monthly',
        quarterly: 'monthly', // Represent quarterly as monthly is incorrect? keep none for safety.
        annually: 'yearly'
      };
      const recurrenceType = map[chosen] || 'none';
      // Ajuste especial: si chosen es quarterly podemos optar por no bloquear y dejar usuario configurar manualmente.
      if (chosen === 'quarterly') {
        // No bloquear; usuario decide configuración personalizada (podría mapearse a interval=3 monthly).
        this.quoteForm.patchValue({ recurrence_type: 'monthly', recurrence_interval: 3 });
        this.quoteForm.get('recurrence_type')?.disable();
        this.recurrenceLocked.set(true);
        this.recurrenceLockedReason.set('Items trimestrales: facturación cada 3 meses');
        if (!this.quoteForm.get('recurrence_day')?.value) this.quoteForm.patchValue({ recurrence_day: 1 });
        return;
      }
      if (recurrenceType === 'weekly' || recurrenceType === 'monthly' || recurrenceType === 'yearly') {
        const current = this.quoteForm.get('recurrence_type')?.value;
        if (current !== recurrenceType) {
          this.quoteForm.patchValue({ recurrence_type: recurrenceType });
        }
        // Lock y establecer día por defecto si falta
        this.recurrenceLocked.set(true);
        const names: Record<string,string> = { weekly: 'Semanal', monthly: 'Mensual', yearly: 'Anual' };
        this.recurrenceLockedReason.set(`Periodicidad agregada: ${names[recurrenceType]}`);
        this.quoteForm.get('recurrence_type')?.disable();
        if ((recurrenceType === 'monthly' || recurrenceType === 'yearly') && !this.quoteForm.get('recurrence_day')?.value) {
          this.quoteForm.patchValue({ recurrence_day: 1 });
        }
        if (recurrenceType === 'weekly' && !this.quoteForm.get('recurrence_day')?.value) {
          this.quoteForm.patchValue({ recurrence_day: 1 }); // lunes por defecto
        }
      } else {
        // fallback none
        this.quoteForm.patchValue({ recurrence_type: 'none' });
        this.unlockRecurrence();
      }
    } catch (e) {
      // En caso de fallo silencioso, no romper flujo
      console.warn('evaluateAggregateRecurrence error', e);
    }
  }

  /**
   * Map variant billing_period to quote recurrence_type and lock if applicable
   */
  private updateRecurrenceFromVariant(variant: ServiceVariant) {
    // Prefer pricing array (new model). If absent, fall back to deprecated billing_period.
    const parsed = this.variantPricing(variant);
    const billingPeriod = (parsed.length > 0)
      ? parsed[0].billing_period
      : variant.billing_period;
    
    // Map billing_period to recurrence_type
    const recurrenceMap: Record<string, string> = {
      'one-time': 'none',
      'one_time': 'none',
      'monthly': 'monthly',
      'annually': 'yearly',
      'annual': 'yearly',
      'custom': 'none' // Custom remains as none, user can configure manually
    };
    
    const recurrenceType = recurrenceMap[billingPeriod] || 'none';
    
    // Lock recurrence if variant has specific billing period (not one-time or custom)
  const shouldLock = ['monthly', 'annually', 'annual'].includes(billingPeriod);
    
    if (shouldLock) {
      this.recurrenceLocked.set(true);
      
      // Set user-friendly reason
      const periodNames: Record<string, string> = {
        'monthly': 'Mensual',
        'annually': 'Anual',
        'annual': 'Anual'
      };
      const periodName = periodNames[billingPeriod] || billingPeriod;
      this.recurrenceLockedReason.set(`Este servicio tiene facturación ${periodName}`);
      
      // Update form and disable recurrence controls
      this.quoteForm.patchValue({
        recurrence_type: recurrenceType
      });
      this.quoteForm.get('recurrence_type')?.disable();
      
      // Set default day if needed
      if (recurrenceType === 'monthly' || recurrenceType === 'yearly') {
        if (!this.quoteForm.get('recurrence_day')?.value) {
          this.quoteForm.patchValue({ recurrence_day: 1 });
        }
      }
      // Store normalized billing_period on matching item if variant already selected
      try {
        const vId = variant.id;
        for (let i = 0; i < this.items.length; i++) {
          const itemVariant = this.items.at(i).get('variant_id')?.value;
          if (itemVariant === vId) {
            this.items.at(i).patchValue({ billing_period: this.normalizeBillingPeriod(billingPeriod) });
            break;
          }
        }
      } catch {}
    } else {
      // Unlock if variant is one-time or custom
      this.unlockRecurrence();
    }
  }

  /**
   * Unlock recurrence controls
   */
  private unlockRecurrence() {
    this.recurrenceLocked.set(false);
    this.recurrenceLockedReason.set(null);
    this.quoteForm.get('recurrence_type')?.enable();
  }

  closeVariantDropdown() {
    this.variantDropdownOpen.set(false);
    this.selectedVariantIndex.set(null);
  }

  // Helper visible to template: check if a given variant-period is the selected one for an item
  isVariantPeriodSelected(variant: ServiceVariant, period: string | null | undefined, itemIndex: number): boolean {
    try {
      const grp = this.items.at(itemIndex);
      const vId = grp.get('variant_id')?.value;
      const pVal = grp.get('billing_period')?.value;
      return vId === variant.id && this.normalizeBillingPeriod(pVal) === this.normalizeBillingPeriod(period || null);
    } catch {
      return false;
    }
  }

  getSelectedVariantName(index: number): string {
    try {
      const variantId = this.items.at(index)?.get('variant_id')?.value as string | null;
      const serviceId = this.items.at(index)?.get('service_id')?.value as string | null;
      const billingPeriod = this.items.at(index)?.get('billing_period')?.value as string | null;
      
      if (!variantId || !serviceId) return 'Seleccionar variante...';
      
      const service = this.services().find(s => s.id === serviceId);
      if (!service || !service.variants) return 'Seleccionar variante...';
      
      const variant = service.variants.find(v => v.id === variantId);
      if (!variant) return 'Seleccionar variante...';
      // Append period label if available
      const label = this.formatBillingPeriodLabel(this.normalizeBillingPeriod(billingPeriod));
      return billingPeriod ? `${variant.variant_name} (${label})` : variant.variant_name;
    } catch {
      return 'Seleccionar variante...';
    }
  }

  getServiceVariants(index: number): ServiceVariant[] {
    try {
      const serviceId = this.items.at(index)?.get('service_id')?.value as string | null;
      if (!serviceId) return [];
      
      const service = this.services().find(s => s.id === serviceId);
      return service?.variants || [];
    } catch {
      return [];
    }
  }

  serviceHasVariants(index: number): boolean {
    try {
      const serviceId = this.items.at(index)?.get('service_id')?.value as string | null;
      if (!serviceId) return false;
      
      const service = this.services().find(s => s.id === serviceId);
      return !!service?.has_variants && !!service?.variants?.length;
    } catch {
      return false;
    }
  }

  // Helpers to show selected names in template
  getSelectedServiceName(index: number): string {
    try {
      const id = this.items.at(index)?.get('service_id')?.value as string | null;
      if (!id) return 'Buscar servicio...';
      const s = this.services().find(x => x.id === id);
      return s?.name || 'Buscar servicio...';
    } catch {
      return 'Buscar servicio...';
    }
  }

  getSelectedProductName(index: number): string {
    try {
      const id = this.items.at(index)?.get('product_id')?.value as string | null;
      if (!id) return 'Buscar producto...';
      const p = this.products().find(x => x.id === id);
      return p?.name || 'Buscar producto...';
    } catch {
      return 'Buscar producto...';
    }
  }

  togglePreview() {
    this.showPreview.set(!this.showPreview());
  }

  save() {
    if (this.quoteForm.invalid) {
      this.error.set('Por favor completa todos los campos requeridos');
      Object.keys(this.quoteForm.controls).forEach(key => {
        const control = this.quoteForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    this.loading.set(true);
    const formValue = this.quoteForm.getRawValue(); // Use getRawValue to include disabled fields

    // Validar completitud del cliente sólo en creación (no bloqueamos edición de históricos)
    if (!this.editMode()) {
      const selectedClient = this.clients().find(c => c.id === formValue.client_id);
      if (!selectedClient) {
        this.loading.set(false);
        this.error.set('Seleccione un cliente válido');
        return;
      }
      if (!selectedClient.complete) {
        this.loading.set(false);
        // Mensaje detallado con campos faltantes
        const faltan = selectedClient.missingFields.join(', ');
        const msg = `El cliente no tiene datos fiscales completos para emitir el presupuesto (faltan: ${faltan}). Complete la ficha antes de continuar.`;
        this.error.set(msg);
        this.toast.error('Cliente incompleto', msg);
        return;
      }
    }

    // Si estamos en modo edición, actualizar en lugar de crear
  if (this.editMode() && this.quoteId()) {
      console.log('📝 Actualizando presupuesto existente:', this.quoteId());
      
      // Primero actualizar los campos básicos del presupuesto
      const updateDto: any = {
        // Campos principales
        title: formValue.title,
        description: formValue.description,
        valid_until: formValue.valid_until,
        notes: formValue.notes,
        terms_conditions: formValue.terms_conditions,
        // Permitir modificar estado y fechas/cliente si cambia
        status: formValue.status,
        quote_date: formValue.issue_date,
        client_id: formValue.client_id,
        // Recurrencia
        recurrence_type: formValue.recurrence_type || 'none',
        recurrence_interval: formValue.recurrence_interval ?? 1,
        recurrence_day: formValue.recurrence_type === 'none' ? null : (formValue.recurrence_day ?? null),
        recurrence_start_date: formValue.recurrence_type === 'none' ? null : (formValue.recurrence_start_date ?? null),
        recurrence_end_date: formValue.recurrence_type === 'none' ? null : (formValue.recurrence_end_date ?? null)
    };

    // Debug: log update payload to verify description and recurrence are present
    console.log('🔁 updateDto payload:', updateDto);

      this.quotesService.updateQuote(this.quoteId()!, updateDto).subscribe({
        next: async (quote) => {
          try {
            // Ahora actualizar los items: eliminar todos y volver a crear
            const client = this.quotesService['supabaseClient'].instance;
            
            // Eliminar items existentes
            await client
              .from('quote_items')
              .delete()
              .eq('quote_id', this.quoteId()!);
            
            // Crear nuevos items
            const companyId = this.quotesService['authService'].companyId();
            const items = formValue.items.map((item: any, index: number) => ({
              quote_id: this.quoteId()!,
              company_id: companyId,
              line_number: index + 1,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate: item.tax_rate || 21,
              discount_percent: item.discount_percent || 0,
              notes: item.notes || '',
              service_id: item.service_id || null,
              product_id: item.product_id || null,
              variant_id: item.variant_id || null,
              billing_period: item.billing_period || null
            }));
            
            await client
              .from('quote_items')
              .insert(items);
            
            this.loading.set(false);
            console.log('✅ Presupuesto actualizado correctamente');
            this.toast.success('Presupuesto actualizado', 'Los cambios fueron guardados correctamente.');
            this.router.navigate(['/presupuestos', quote.id]);
          } catch (err: any) {
            console.error('❌ Error al actualizar items:', err);
            this.error.set('Error al actualizar items: ' + err.message);
            this.toast.error('Error al actualizar', err?.message || 'No se pudo actualizar el presupuesto');
            this.loading.set(false);
          }
        },
        error: (err) => {
          console.error('❌ Error al actualizar presupuesto:', err);
          this.error.set('Error al actualizar: ' + err.message);
          this.toast.error('Error al actualizar', err?.message || 'No se pudo actualizar el presupuesto');
          this.loading.set(false);
        }
      });
    } else {
  console.log('📝 Creando nuevo presupuesto (cliente verificado completo)');
      const dto: CreateQuoteDTO = {
        client_id: formValue.client_id,
        title: formValue.title,
        description: formValue.description,
        quote_date: formValue.issue_date,
        valid_until: formValue.valid_until,
        notes: formValue.notes,
        terms_conditions: formValue.terms_conditions,
        items: formValue.items as CreateQuoteItemDTO[],
        // Recurrencia
        recurrence_type: formValue.recurrence_type || 'none',
        recurrence_interval: formValue.recurrence_interval ?? 1,
        recurrence_day: formValue.recurrence_type === 'none' ? null : (formValue.recurrence_day ?? null),
        recurrence_start_date: formValue.recurrence_type === 'none' ? null : (formValue.recurrence_start_date ?? null),
        recurrence_end_date: formValue.recurrence_type === 'none' ? null : (formValue.recurrence_end_date ?? null)
      };

  // Debug: log create payload to verify description and items
  console.log('✨ create DTO payload:', dto);

      this.quotesService.createQuote(dto).subscribe({
        next: (quote) => {
          this.loading.set(false);
          console.log('✅ Presupuesto creado correctamente');
          this.toast.success('Presupuesto creado', 'El presupuesto se creó correctamente.');
          this.router.navigate(['/presupuestos', quote.id]);
        },
        error: (err) => {
          console.error('❌ Error al crear presupuesto:', err);
          this.error.set('Error al guardar: ' + err.message);
          this.toast.error('Error al crear', err?.message || 'No se pudo crear el presupuesto');
          this.loading.set(false);
        }
      });
    }
  }

  cancel() {
    this.router.navigate(['/presupuestos']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  /**
   * Return a numeric base price to display for a variant.
   * Prefers the first entry in the new `pricing` array when present,
   * otherwise falls back to the deprecated `base_price` field.
   */
  getVariantDisplayPrice(variant: ServiceVariant): number {
    try {
      const pricing = this.variantPricing(variant);
      if (pricing.length > 0) {
        const p = pricing[0];
        return Number(p?.base_price ?? variant.base_price ?? 0);
      }
      return Number(variant.base_price ?? 0);
    } catch {
      return 0;
    }
  }

  /**
   * Return the billing_period for display for a variant.
   * Prefers the first pricing entry's billing_period when available.
   */
  getVariantBillingPeriod(variant: ServiceVariant): string {
    try {
      const pricing = this.variantPricing(variant);
      if (pricing.length > 0) return pricing[0].billing_period || variant.billing_period || 'one-time';
      return variant.billing_period || 'one-time';
    } catch {
      return 'one-time';
    }
  }

  // Helper: return pricing list for variant (new model)
  variantPricing(variant: ServiceVariant): any[] {
    try {
      const raw = (variant as any).pricing;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      }
      return [];
    } catch { return []; }
  }

  // Helper: map billing period key to Spanish label
  formatBillingPeriodLabel(period: string | null | undefined): string {
    const key = (period || '').toString();
    const map: Record<string, string> = {
      'one-time': 'Pago único',
      'one_time': 'Pago único',
      'monthly': 'Mensual',
      'quarterly': 'Trimestral',
      'biannual': 'Semestral',
      'annual': 'Anual',
      'annually': 'Anual',
      'yearly': 'Anual',
      'custom': 'Personalizado'
    };
    return map[key] || key;
  }

  private async loadTaxSettings() {
    try {
      const [app, company] = await Promise.all([
        firstValueFrom(this.settingsService.getAppSettings()),
        firstValueFrom(this.settingsService.getCompanySettings())
      ]);

      // Resolve effective settings: company overrides when set (and enforce_company_defaults if needed)
      const effectivePricesIncludeTax = (company?.prices_include_tax ?? null) ?? (app?.default_prices_include_tax ?? false);
      const effectiveIvaEnabled = (company?.iva_enabled ?? null) ?? (app?.default_iva_enabled ?? true);
      const effectiveIvaRate = (company?.iva_rate ?? null) ?? (app?.default_iva_rate ?? 21);
      const effectiveIrpfEnabled = (company?.irpf_enabled ?? null) ?? (app?.default_irpf_enabled ?? false);
      const effectiveIrpfRate = (company?.irpf_rate ?? null) ?? (app?.default_irpf_rate ?? 15);

      this.pricesIncludeTax.set(!!effectivePricesIncludeTax);
      this.ivaEnabled.set(!!effectiveIvaEnabled);
      this.ivaRate.set(Number(effectiveIvaRate || 0));
      this.irpfEnabled.set(!!effectiveIrpfEnabled);
      this.irpfRate.set(Number(effectiveIrpfRate || 0));

      // Update defaults in existing first item if fresh form
      if (this.items.length === 1) {
        const ctrl = this.items.at(0);
        ctrl.patchValue({ tax_rate: this.ivaEnabled() ? this.ivaRate() : 0 }, { emitEvent: false });
      }

      this.calculateTotals();
    } catch (e) {
      // Keep safe defaults on error
      this.calculateTotals();
    }
  }

  // Helper para mostrar precio unitario con IVA incluido en UI cuando corresponde
  displayUnitPriceWithTax(index: number): number {
    try {
      const itemGroup = this.items.at(index);
      const unit = Number(itemGroup.get('unit_price')?.value || 0);
      const rate = this.ivaEnabled() ? Number(itemGroup.get('tax_rate')?.value || this.ivaRate()) : 0;
      // Si la preferencia es IVA incluido, el unit ya es bruto
      if (this.pricesIncludeTax()) return unit;
      // Si la preferencia es sin IVA, mostrar bruto derivado
      if (this.ivaEnabled() && rate > 0) return Math.round(unit * (1 + rate / 100) * 100) / 100;
      return unit;
    } catch {
      return 0;
    }
  }
}
