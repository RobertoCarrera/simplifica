import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceVariant } from '../../services/supabase-services.service';

@Component({
  selector: 'app-service-variants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './service-variants.component.html',
  styleUrl: './service-variants.component.scss'
})
export class ServiceVariantsComponent implements OnInit {
  @Input() serviceId: string = '';
  @Input() serviceName: string = '';
  @Input() variants: ServiceVariant[] = [];
  @Output() variantsChange = new EventEmitter<ServiceVariant[]>();
  @Output() onSave = new EventEmitter<ServiceVariant>();
  @Output() onDelete = new EventEmitter<string>();

  showForm = false;
  editingVariant: ServiceVariant | null = null;
  formData: Partial<ServiceVariant> = this.getEmptyFormData();

  billingPeriods = [
    { value: 'one-time', label: 'Pago único' },
    { value: 'monthly', label: 'Mensual' },
    { value: 'annually', label: 'Anual' },
    { value: 'custom', label: 'Personalizado' }
  ];

  ngOnInit() {
    this.sortVariants();
  }

  sortVariants() {
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
      billing_period: 'one-time',
      base_price: 0,
      estimated_hours: 0,
      cost_price: 0,
      profit_margin: 30,
      discount_percentage: 0,
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
    if (variant) {
      this.editingVariant = variant;
      this.formData = { ...variant };
    } else {
      this.editingVariant = null;
      this.formData = this.getEmptyFormData();
    }
    this.showForm = true;
  }

  closeForm() {
    this.showForm = false;
    this.editingVariant = null;
    this.formData = this.getEmptyFormData();
  }

  saveVariant() {
    if (!this.formData.variant_name || !this.formData.billing_period) {
      alert('Por favor completa los campos requeridos');
      return;
    }

    const variant: ServiceVariant = {
      id: this.editingVariant?.id || '',
      service_id: this.serviceId,
      variant_name: this.formData.variant_name!,
      billing_period: this.formData.billing_period as any,
      base_price: this.formData.base_price || 0,
      estimated_hours: this.formData.estimated_hours,
      cost_price: this.formData.cost_price,
      profit_margin: this.formData.profit_margin,
      discount_percentage: this.formData.discount_percentage,
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
  addFeature(type: 'included' | 'excluded') {
    const feature = prompt(`Añadir característica ${type === 'included' ? 'incluida' : 'excluida'}:`);
    if (feature && feature.trim()) {
      if (!this.formData.features) {
        this.formData.features = { included: [], excluded: [], limits: {} };
      }
      if (!this.formData.features[type]) {
        this.formData.features[type] = [];
      }
      this.formData.features[type]!.push(feature.trim());
    }
  }

  removeFeature(type: 'included' | 'excluded', index: number) {
    if (this.formData.features && this.formData.features[type]) {
      this.formData.features[type]!.splice(index, 1);
    }
  }
}
