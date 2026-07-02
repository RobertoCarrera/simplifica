import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormArray } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ServiceTranslatePipe } from '../../../../../shared/pipes/service-translate.pipe';

/**
 * Editor standalone de line items del quote.
 * Renderiza la tabla de items con sus selectores de servicio/variante/producto,
 * descripción, cantidad, precio, descuento e IVA.
 *
 * El padre (QuoteFormComponent) mantiene TODA la lógica de cálculo y estado.
 * Este componente solo renderiza y emite eventos.
 */
@Component({
  selector: 'app-quote-items-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, ServiceTranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-items-editor.component.html',
  styleUrl: './quote-items-editor.component.scss',
})
export class QuoteItemsEditorComponent {
  @Input() items!: FormArray;

  // Events para el padre
  @Output() addItemRequested = new EventEmitter<void>();
  @Output() removeItemRequested = new EventEmitter<number>();
  @Output() serviceSelected = new EventEmitter<{ service: any; index: number }>();
  @Output() variantSelected = new EventEmitter<{ variant: any; index: number }>();
  @Output() productSelected = new EventEmitter<{ product: any; index: number }>();
  @Output() taxSelected = new EventEmitter<{ value: number; index: number }>();
  @Output() variantPeriodSelected = new EventEmitter<{ variant: any; period: string; index: number }>();

  // Events para toggles de dropdowns (estado local en el padre)
  @Output() toggleServiceDropdownRequested = new EventEmitter<number>();
  @Output() toggleVariantDropdownRequested = new EventEmitter<number>();
  @Output() toggleProductDropdownRequested = new EventEmitter<number>();
  @Output() toggleTaxDropdownRequested = new EventEmitter<number>();

  // Outputs para que el padre pase datos al hijo sin acoplamiento
  // (los métodos del padre se invocan vía @Input functions o se pasan por el padre)
  @Input() getServiceName: (i: number) => string = () => '';
  @Input() getVariantName: (i: number) => string = () => '';
  @Input() getProductName: (i: number) => string = () => '';
  @Input() getTaxLabel: (i: number) => string = () => '';
  @Input() getTaxRate: (i: number) => number = () => 21;
  @Input() getServiceVariants: (i: number) => any[] = () => [];
  @Input() isModulesProductsEnabled: () => boolean = () => false;
  @Input() services: any[] = [];
  @Input() products: any[] = [];
  @Input() taxOptions: any[] = [];
  @Input() serviceDropdownOpen: () => boolean = () => false;
  @Input() variantDropdownOpen: () => boolean = () => false;
  @Input() productDropdownOpen: () => boolean = () => false;
  @Input() taxDropdownOpen: () => boolean = () => false;
  @Input() selectedItemIndex: () => number = () => -1;

  onAddItem(): void { this.addItemRequested.emit(); }
  onRemoveItem(i: number): void { this.removeItemRequested.emit(i); }
  onServiceSelected(service: any, i: number): void { this.serviceSelected.emit({ service, index: i }); }
  onVariantSelected(variant: any, i: number): void { this.variantSelected.emit({ variant, index: i }); }
  onProductSelected(product: any, i: number): void { this.productSelected.emit({ product, index: i }); }
  onTaxSelected(value: number, i: number): void { this.taxSelected.emit({ value, index: i }); }
  onVariantPeriodSelected(variant: any, period: string, i: number): void { this.variantPeriodSelected.emit({ variant, period, index: i }); }
  onToggleServiceDropdown(i: number): void { this.toggleServiceDropdownRequested.emit(i); }
  onToggleVariantDropdown(i: number): void { this.toggleVariantDropdownRequested.emit(i); }
  onToggleProductDropdown(i: number): void { this.toggleProductDropdownRequested.emit(i); }
  onToggleTaxDropdown(i: number): void { this.toggleTaxDropdownRequested.emit(i); }
}
