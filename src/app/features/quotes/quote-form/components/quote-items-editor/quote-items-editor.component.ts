import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormArray, FormGroup } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ServiceTranslatePipe } from '../../../../../shared/pipes/service-translate.pipe';
import { SupabaseServicesService, Service } from '../../../../../services/supabase-services.service';
import { ProductsService } from '../../../../../services/products.service';

export interface ServiceOption {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  estimated_hours?: number;
  category?: string;
  has_variants?: boolean;
  variants?: any[];
  holded_product_id?: string | null;
  translations?: Record<string, string>;
}

export interface ServiceVariant {
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

export interface ProductOption {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
}

export interface TaxOption {
  value: number;
  label: string;
}

@Component({
  selector: 'app-quote-items-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, ServiceTranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-items-editor.component.html',
  styleUrl: './quote-items-editor.component.scss',
})
export class QuoteItemsEditorComponent implements OnInit {
  private servicesService = inject(SupabaseServicesService);
  private productsService = inject(ProductsService);

  @Input() items!: FormArray;
  @Input() isModulesProductsEnabled: () => boolean = () => false;

  // Outputs al padre
  @Output() totalsChanged = new EventEmitter<void>();
  @Output() itemAdded = new EventEmitter<void>();
  @Output() itemRemoved = new EventEmitter<number>();

  // Local state (movido desde el padre)
  services = signal<ServiceOption[]>([]);
  products = signal<ProductOption[]>([]);
  serviceSearch = signal('');
  productSearch = signal('');
  selectedItemIndex = signal<number | null>(null);
  selectedProductIndex = signal<number | null>(null);
  selectedVariantIndex = signal<number | null>(null);
  serviceDropdownOpen = signal(false);
  variantDropdownOpen = signal(false);
  productDropdownOpen = signal(false);
  taxDropdownOpen = signal(false);
  taxDropdownOpenIndex = signal<number | null>(null);

  taxOptions: TaxOption[] = [
    { value: 0, label: '0%' },
    { value: 4, label: '4%' },
    { value: 10, label: '10%' },
    { value: 21, label: '21%' },
  ];

  filteredServices = computed(() => {
    const search = this.serviceSearch().toLowerCase();
    if (!search) return this.services();
    return this.services().filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.description?.toLowerCase().includes(search) ||
        s.category?.toLowerCase().includes(search),
    );
  });

  filteredProducts = computed(() => {
    const search = this.productSearch().toLowerCase();
    if (!search) return this.products();
    return this.products().filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        (p.description || '').toLowerCase().includes(search) ||
        (p.brand || '').toLowerCase().includes(search) ||
        (p.model || '').toLowerCase().includes(search) ||
        (p.category || '').toLowerCase().includes(search),
    );
  });

  async ngOnInit() {
    await this.loadServices();
    if (this.isModulesProductsEnabled()) {
      await this.loadProducts();
    }
  }

  async loadServices() {
    try {
      const data = (await this.servicesService.getServices()) as unknown as ServiceOption[];
      this.services.set(data || []);
    } catch (err) {
      console.error('Error loading services', err);
    }
  }

  async loadProducts() {
    try {
      const data = (await this.productsService.getProducts()) as unknown as ProductOption[];
      this.products.set(data || []);
    } catch (err) {
      console.error('Error loading products', err);
    }
  }

  // === Getters (movidos desde el padre) ===
  getSelectedServiceName(index: number): string {
    const id = this.items.at(index).get('service_id')?.value;
    if (!id) return 'Buscar servicio...';
    return this.services().find((s) => s.id === id)?.name || 'Servicio no encontrado';
  }

  getSelectedVariantName(index: number): string {
    const variantId = this.items.at(index).get('variant_id')?.value;
    if (!variantId) return 'Sin variante';
    const item = this.items.at(index);
    const serviceId = item.get('service_id')?.value;
    if (!serviceId) return 'Sin variante';
    const service = this.services().find((s) => s.id === serviceId);
    const variant = service?.variants?.find((v: any) => v.id === variantId);
    return variant?.variant_name || 'Variante no encontrada';
  }

  getSelectedProductName(index: number): string {
    const id = this.items.at(index).get('product_id')?.value;
    if (!id) return 'Buscar producto...';
    return this.products().find((p) => p.id === id)?.name || 'Producto no encontrado';
  }

  getItemTaxRate(index: number): number {
    return this.items.at(index).get('tax_rate')?.value ?? 21;
  }

  getItemTaxLabel(index: number): string {
    const rate = this.getItemTaxRate(index);
    const option = this.taxOptions.find((o) => o.value === rate);
    return option?.label || '21%';
  }

  getServiceVariants(index: number): ServiceVariant[] {
    const serviceId = this.items.at(index).get('service_id')?.value;
    if (!serviceId) return [];
    const service = this.services().find((s) => s.id === serviceId);
    return service?.variants || [];
  }

  // === Toggles (movidos desde el padre) ===
  toggleServiceDropdown(index: number) {
    if (this.selectedItemIndex() === index && this.serviceDropdownOpen()) {
      this.serviceDropdownOpen.set(false);
      this.selectedItemIndex.set(null);
    } else {
      this.selectedItemIndex.set(index);
      this.serviceDropdownOpen.set(true);
    }
  }

  toggleProductDropdown(index: number) {
    if (this.selectedProductIndex() === index && this.productDropdownOpen()) {
      this.productDropdownOpen.set(false);
      this.selectedProductIndex.set(null);
    } else {
      this.selectedProductIndex.set(index);
      this.productDropdownOpen.set(true);
    }
  }

  toggleTaxDropdown(index: number) {
    if (this.taxDropdownOpenIndex() === index) {
      this.taxDropdownOpenIndex.set(null);
    } else {
      this.taxDropdownOpenIndex.set(index);
    }
  }

  toggleVariantDropdown(index: number) {
    if (this.selectedVariantIndex() === index && this.variantDropdownOpen()) {
      this.variantDropdownOpen.set(false);
      this.selectedVariantIndex.set(null);
    } else {
      this.selectedVariantIndex.set(index);
      this.variantDropdownOpen.set(true);
    }
  }

  // === Actions (movidas desde el padre, emiten al padre) ===
  onAddItem() {
    this.itemAdded.emit();
  }

  onRemoveItem(index: number) {
    this.itemRemoved.emit(index);
  }

  selectService(service: ServiceOption, index: number) {
    this.items.at(index).get('service_id')?.setValue(service.id);
    this.items.at(index).get('unit_price')?.setValue(service.base_price);
    if (service.translations) {
      this.items.at(index).get('description')?.setValue(service.name);
    }
    this.serviceDropdownOpen.set(false);
    this.totalsChanged.emit();
  }

  selectVariant(variant: ServiceVariant, index: number) {
    this.items.at(index).get('variant_id')?.setValue(variant.id);
    this.items.at(index).get('unit_price')?.setValue(variant.base_price);
    this.variantDropdownOpen.set(false);
    this.totalsChanged.emit();
  }

  selectVariantPeriod(variant: ServiceVariant, pricing: any, index: number) {
    this.items.at(index).get('variant_id')?.setValue(variant.id);
    if (pricing?.base_price) {
      this.items.at(index).get('unit_price')?.setValue(pricing.base_price);
    }
    this.totalsChanged.emit();
  }

  selectProduct(product: ProductOption, index: number) {
    this.items.at(index).get('product_id')?.setValue(product.id);
    this.items.at(index).get('unit_price')?.setValue(product.price);
    this.productDropdownOpen.set(false);
    this.totalsChanged.emit();
  }

  selectTax(value: number, index: number) {
    this.items.at(index).get('tax_rate')?.setValue(value);
    this.taxDropdownOpenIndex.set(null);
    this.totalsChanged.emit();
  }
}
