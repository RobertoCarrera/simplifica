import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceVariant, VariantPricing } from '../../services/supabase-services.service';
import { SupabaseSettingsService } from '../../services/supabase-settings.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-service-variants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './service-variants.component.html',
  styleUrl: './service-variants.component.scss'
})
export class ServiceVariantsComponent implements OnInit {
  private settingsService = inject(SupabaseSettingsService);

  @Input() serviceId: string = '';
  @Input() serviceName: string = '';
  @Input() variants: ServiceVariant[] = [];
  @Output() variantsChange = new EventEmitter<ServiceVariant[]>();
  @Output() onSave = new EventEmitter<ServiceVariant>();
  @Output() onDelete = new EventEmitter<string>();

  showForm = false;
  editingVariant: ServiceVariant | null = null;
  formData: Partial<ServiceVariant> = {}; // Inicializar vacío, se llena en openForm

  // Temporary fields for feature inputs
  newIncludedFeature: string = '';
  newExcludedFeature: string = '';
  
  // Automation settings
  copyFeaturesMode = false;
  allFeatures: string[] = [];
  newGlobalFeature: string = '';

  billingPeriods = [
    { value: 'one_time', label: 'Pago único' },
    { value: 'monthly', label: 'Mensual' },
    { value: 'quarterly', label: 'Trimestral' },
    { value: 'biannual', label: 'Semestral' },
    { value: 'annual', label: 'Anual' }
  ];

  async ngOnInit() {
    this.sortVariants();
    console.log('🔧 ServiceVariants ngOnInit:', {
      serviceId: this.serviceId,
      serviceName: this.serviceName,
      variantsCount: this.variants?.length || 0
    });

    try {
      const settings = await firstValueFrom(this.settingsService.getCompanySettings());
      this.copyFeaturesMode = settings?.copy_features_between_variants ?? false;
    } catch (error) {
      console.error('Error loading settings in ServiceVariants:', error);
    }
  }

  sortVariants() {
    if (!this.variants || !Array.isArray(this.variants)) {
      this.variants = [];
      return;
    }
    this.variants.sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.variant_name.localeCompare(b.variant_name);
    });
  }

  getEmptyFormData(): Partial<ServiceVariant> {
    return {
      service_id: this.serviceId,
      variant_name: '',
      pricing: [], // Array vacío de precios
      features: {
        included: [],
        excluded: [],
        limits: {}
      },
      display_config: {
        highlight: false,
        badge: null,
        color: null
      },
      is_active: true,
      sort_order: this.variants.length
    };
  }

  openForm(variant?: ServiceVariant) {
    console.log('🔧 Opening variant form. serviceId:', this.serviceId, 'variant:', variant);
    
    this.newIncludedFeature = '';
    this.newExcludedFeature = '';

    if (variant) {
      this.editingVariant = variant;
      // Asegurar que pricing existe y es array
      this.formData = { 
        ...variant,
        pricing: Array.isArray(variant.pricing) ? [...variant.pricing] : []
      };
    } else {
      this.editingVariant = null;
      this.formData = this.getEmptyFormData();
    }
    
    console.log('📋 Form data initialized:', {
      variant_name: this.formData.variant_name,
      pricing: this.formData.pricing,
      service_id: this.formData.service_id
    });
    
    this.showForm = true;
    
    if (this.copyFeaturesMode) {
      this.computeAllFeatures();
    }
  }

  closeForm() {
    this.showForm = false;
    this.editingVariant = null;
    this.formData = this.getEmptyFormData();
  }

  saveVariant() {
    console.log('💾 Saving variant. formData:', this.formData);
    console.log('💾 serviceId:', this.serviceId);
    
    if (!this.formData.variant_name) {
      alert('Por favor completa el nombre de la variante');
      return;
    }

    // Validar que hay al menos un precio configurado
    if (!this.formData.pricing || this.formData.pricing.length === 0) {
      alert('Debes añadir al menos una configuración de precio');
      return;
    }

    // Validar que cada precio tiene billing_period y base_price
    for (const price of this.formData.pricing) {
      if (!price.billing_period || price.base_price === undefined) {
        alert('Todos los precios deben tener periodicidad y precio base');
        return;
      }
    }

    const variant: ServiceVariant = {
      id: this.editingVariant?.id || '',
      service_id: this.serviceId, // Puede ser "" para variantes pendientes
      variant_name: this.formData.variant_name!,
      pricing: this.formData.pricing,
      features: this.formData.features || { included: [], excluded: [], limits: {} },
      display_config: this.formData.display_config || { highlight: false, badge: null, color: null },
      is_active: this.formData.is_active !== undefined ? this.formData.is_active : true,
      sort_order: this.formData.sort_order || 0,
      created_at: this.editingVariant?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.onSave.emit(variant);
    this.closeForm();
  }

  deleteVariant(variantId: string) {
    if (confirm('¿Estás seguro de que quieres eliminar esta variante?')) {
      this.onDelete.emit(variantId);
    }
  }

  // ============= GESTIÓN DE PRECIOS MÚLTIPLES =============
  
  addPricingEntry() {
    if (!this.formData.pricing) {
      this.formData.pricing = [];
    }
    
    // Obtener periodicidades disponibles
    const usedPeriods = this.formData.pricing.map(p => p.billing_period);
    const availablePeriod = this.billingPeriods.find(
      bp => !usedPeriods.includes(bp.value as any)
    );
    
    if (!availablePeriod) {
      alert('Ya has añadido todas las periodicidades disponibles');
      return;
    }
    
    this.formData.pricing.push({
      billing_period: availablePeriod.value as any,
      base_price: 0,
      estimated_hours: 0,
      cost_price: 0,
      profit_margin: 30,
      discount_percentage: 0
    });
  }

  removePricingEntry(index: number) {
    if (this.formData.pricing && this.formData.pricing.length > 0) {
      this.formData.pricing.splice(index, 1);
    }
  }

  getAvailablePeriods(currentPeriod?: string): typeof this.billingPeriods {
    if (!this.formData.pricing) {
      return this.billingPeriods;
    }
    
    const usedPeriods = this.formData.pricing
      .map(p => p.billing_period)
      .filter(p => p !== currentPeriod);
    
    return this.billingPeriods.filter(
      bp => !usedPeriods.includes(bp.value as any)
    );
  }

  calculateDiscountedPrice(price: VariantPricing): number {
    if (!price.discount_percentage || price.discount_percentage === 0) {
      return price.base_price;
    }
    return Math.round(price.base_price * (1 - price.discount_percentage / 100) * 100) / 100;
  }

  calculateProfitMargin(price: VariantPricing): number {
    if (!price.cost_price || price.cost_price === 0) {
      return 0;
    }
    return Math.round(((price.base_price - price.cost_price) / price.cost_price) * 100 * 100) / 100;
  }

  // Helpers para mostrar pills en el listado de variantes
  getPricingPills(variant: ServiceVariant): string[] {
    if (!variant.pricing || variant.pricing.length === 0) {
      return [];
    }
    
    return variant.pricing.map(p => {
      const periodLabel = this.getPeriodLabel(p.billing_period);
      const price = this.calculateDiscountedPrice(p);
      return `${periodLabel}: ${price}€`;
    });
  }

  // ============= FIN GESTIÓN DE PRECIOS MÚLTIPLES =============

  calculateAnnualPrice(monthlyPrice: number): number {
    return Math.round((monthlyPrice * 12) * 0.84 * 100) / 100; // 16% discount
  }

  getPeriodLabel(period: string): string {
    return this.billingPeriods.find(p => p.value === period)?.label || period;
  }

  getVariantBadgeColor(variant: ServiceVariant): string {
    if (variant.display_config?.color) {
      return variant.display_config.color;
    }
    
    const level = variant.variant_name.toLowerCase();
    if (level.includes('esencial') || level.includes('básico') || level.includes('inicial')) {
      return '#10b981'; // green
    } else if (level.includes('avanzado') || level.includes('standard')) {
      return '#3b82f6'; // blue
    } else if (level.includes('superior') || level.includes('premium') || level.includes('empresarial')) {
      return '#8b5cf6'; // purple
    }
    return '#6b7280'; // gray
  }

  moveVariantUp(index: number) {
    if (index > 0) {
      const temp = this.variants[index];
      this.variants[index] = this.variants[index - 1];
      this.variants[index - 1] = temp;
      
      // Update sort orders
      this.variants.forEach((v, i) => v.sort_order = i);
      this.variantsChange.emit(this.variants);
    }
  }

  moveVariantDown(index: number) {
    if (index < this.variants.length - 1) {
      const temp = this.variants[index];
      this.variants[index] = this.variants[index + 1];
      this.variants[index + 1] = temp;
      
      // Update sort orders
      this.variants.forEach((v, i) => v.sort_order = i);
      this.variantsChange.emit(this.variants);
    }
  }

  // Feature management
  computeAllFeatures() {
    const features = new Set<string>();
    this.variants.forEach(v => {
      v.features?.included?.forEach(f => features.add(f));
      v.features?.excluded?.forEach(f => features.add(f));
    });
    // Also add features from current formData
    this.formData.features?.included?.forEach(f => features.add(f));
    this.formData.features?.excluded?.forEach(f => features.add(f));
    
    this.allFeatures = Array.from(features).sort();
  }

  isFeatureIncluded(feature: string): boolean {
    return this.formData.features?.included?.includes(feature) ?? false;
  }

  isFeatureExcluded(feature: string): boolean {
    return this.formData.features?.excluded?.includes(feature) ?? false;
  }

  toggleFeature(feature: string, state: 'included' | 'excluded' | 'none') {
    if (!this.formData.features) {
      this.formData.features = { included: [], excluded: [], limits: {} };
    }
    
    // Ensure arrays exist
    if (!this.formData.features.included) this.formData.features.included = [];
    if (!this.formData.features.excluded) this.formData.features.excluded = [];

    // Remove from both lists first
    this.formData.features.included = this.formData.features.included.filter(f => f !== feature);
    this.formData.features.excluded = this.formData.features.excluded.filter(f => f !== feature);

    if (state === 'included') {
      this.formData.features.included.push(feature);
    } else if (state === 'excluded') {
      this.formData.features.excluded.push(feature);
    }
  }

  addGlobalFeature() {
    if (this.newGlobalFeature && this.newGlobalFeature.trim()) {
      const feature = this.newGlobalFeature.trim();
      if (!this.allFeatures.includes(feature)) {
        this.allFeatures.push(feature);
        this.allFeatures.sort();
      }
      this.newGlobalFeature = '';
    }
  }

  addFeature(type: 'included' | 'excluded') {
    const feature = type === 'included' ? this.newIncludedFeature : this.newExcludedFeature;
    
    if (feature && feature.trim()) {
      if (!this.formData.features) {
        this.formData.features = { included: [], excluded: [], limits: {} };
      }
      if (!this.formData.features[type]) {
        this.formData.features[type] = [];
      }
      this.formData.features[type]!.push(feature.trim());
      
      // Clear the input
      if (type === 'included') {
        this.newIncludedFeature = '';
      } else {
        this.newExcludedFeature = '';
      }
    }
  }

  removeFeature(type: 'included' | 'excluded', index: number) {
    if (this.formData.features && this.formData.features[type]) {
      this.formData.features[type]!.splice(index, 1);
    }
  }
}
