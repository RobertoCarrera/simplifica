import { Component, OnInit, AfterViewInit, HostListener, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { Customer } from '../../../models/customer';
import { CreateQuoteDTO, CreateQuoteItemDTO } from '../../../models/quote.model';
import { debounceTime } from 'rxjs/operators';

interface ClientOption {
  id: string;
  name: string;
  apellidos?: string;
  business_name?: string;
  tax_id?: string;
  email?: string;
  phone?: string;
}

interface ServiceOption {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  estimated_hours?: number;
  category?: string;
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
  private router = inject(Router);
  private route = inject(ActivatedRoute);

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
  
  // Templates
  templates = signal<QuoteTemplate[]>([]);
  selectedTemplate = signal<string | null>(null);
  
  // Cálculos automáticos
  subtotal = signal(0);
  taxAmount = signal(0);
  totalAmount = signal(0);
  
  // Preview
  showPreview = signal(false);

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
    this.setupAutoCalculations();
    
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.editMode.set(true);
        this.quoteId.set(params['id']);
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
  }

  createItemFormGroup(): FormGroup {
    return this.fb.group({
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      tax_rate: [21, [Validators.required, Validators.min(0), Validators.max(100)]],
      discount_percent: [0, [Validators.min(0), Validators.max(100)]],
      notes: ['']
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
    const items = this.items.value;
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item: any) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const discount = parseFloat(item.discount_percent) || 0;
      const taxRate = parseFloat(item.tax_rate) || 0;

      const itemSubtotal = qty * price;
      const itemDiscount = itemSubtotal * (discount / 100);
      const itemSubtotalAfterDiscount = itemSubtotal - itemDiscount;
      const itemTax = itemSubtotalAfterDiscount * (taxRate / 100);

      subtotal += itemSubtotalAfterDiscount;
      taxAmount += itemTax;
    });

    this.subtotal.set(subtotal);
    this.taxAmount.set(taxAmount);
    this.totalAmount.set(subtotal + taxAmount);
  }

  loadClients() {
    this.customersService.getCustomers().subscribe({
      next: (customers: Customer[]) => {
        this.clients.set(customers.map(c => ({
          id: c.id,
          name: c.nombre || c.name || 'Sin nombre',
          apellidos: c.apellidos,
          business_name: c.empresa,
          tax_id: c.dni,
          email: c.email,
          phone: c.telefono || c.phone
        })));
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
      this.services.set(services.map((s: Service) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        base_price: s.base_price,
        estimated_hours: s.estimated_hours,
        category: s.category
      })));
    } catch (err) {
      console.error('Error al cargar servicios:', err);
      // No mostramos error para no bloquear el formulario
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
    item.patchValue({
      description: service.name,
      unit_price: service.base_price,
      quantity: 1
    });
    this.serviceDropdownOpen.set(false);
    this.selectedItemIndex.set(null);
    this.serviceSearch.set('');
    this.calculateTotals();
  }

  closeServiceDropdown() {
    this.serviceDropdownOpen.set(false);
    this.selectedItemIndex.set(null);
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
    const formValue = this.quoteForm.value;

    const dto: CreateQuoteDTO = {
      client_id: formValue.client_id,
      title: formValue.title,
      description: formValue.description,
      quote_date: formValue.issue_date,
      valid_until: formValue.valid_until,
      notes: formValue.notes,
      terms_conditions: formValue.terms_conditions,
      items: formValue.items as CreateQuoteItemDTO[]
    };

    this.quotesService.createQuote(dto).subscribe({
      next: (quote) => {
        this.loading.set(false);
        this.router.navigate(['/presupuestos', quote.id]);
      },
      error: (err) => {
        this.error.set('Error al guardar: ' + err.message);
        this.loading.set(false);
      }
    });
  }

  cancel() {
    this.router.navigate(['/presupuestos']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }
}
