import { Component, EventEmitter, Input, OnInit, Output, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductsService } from '../../../services/products.service';

@Component({
  selector: 'app-product-history-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-history-modal.component.html',
  styleUrl: './product-history-modal.component.scss'
})
export class ProductHistoryModalComponent implements OnChanges {
  @Input() productId: string | null = null;
  @Input() productName: string = '';
  @Output() close = new EventEmitter<void>();

  private productService = inject(ProductsService);
  movements: any[] = [];
  isLoading = false;

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['productId'] && this.productId) {
      this.loadHistory();
    }
  }

  async loadHistory() {
    if (!this.productId) return;
    this.isLoading = true;
    try {
      this.movements = await this.productService.getStockMovements(this.productId);
    } catch (error) {
      console.error('Error loading history', error);
    } finally {
      this.isLoading = false;
    }
  }

  closeModal() {
    this.close.emit();
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  getMovementLabel(type: string): string {
    const labels: any = {
      purchase: 'Compra',
      sale: 'Venta',
      adjustment: 'Ajuste',
      return: 'Devolución',
      initial: 'Inicial'
    };
    return labels[type] || type;
  }

  // --- Adjustment Form ---
  showAdjustmentForm = false;
  newMovement = {
    type: 'adjustment',
    quantity: 1,
    notes: ''
  };

  toggleAdjustmentForm() {
    this.showAdjustmentForm = !this.showAdjustmentForm;
    this.newMovement = { type: 'adjustment', quantity: 1, notes: '' }; // Reset
  }

  async saveAdjustment() {
    if (!this.productId) return;

    // Validate
    if (this.newMovement.quantity === 0) {
      alert('La cantidad no puede ser 0');
      return;
    }

    // Determine actual quantity change based on type if needed, or just trust the signed input
    // Usually adjustments are absolute or relative?
    // Let's assume user inputs Positive for addition, Negative for subtraction for simplicity,
    // OR we interpret based on type.
    // For "Adjustment", let's trust the sign. 
    // For "Purchase" always positive. "Sale" always negative?
    // Let's keep it simple: Quantity is the CHANGE.

    // Auto-correct sign based on type for UX convenience?
    let finalQty = this.newMovement.quantity;
    if (this.newMovement.type === 'sale' || this.newMovement.type === 'return') { // Return to vendor? Or Customer return?
      // 'return' usually means customer return -> + Stock
      // 'sale' -> - Stock
      // 'purchase' -> + Stock
      // 'adjustment' -> +/- Stock

      if (this.newMovement.type === 'sale' && finalQty > 0) finalQty = -finalQty;
    }

    try {
      this.isLoading = true;
      await this.productService.updateStock(
        this.productId,
        finalQty,
        this.newMovement.type as any,
        this.newMovement.notes
      );

      this.showAdjustmentForm = false;
      this.loadHistory(); // Reload to see new movement
    } catch (error) {
      console.error('Error saving adjustment', error);
      alert('Error al guardar el ajuste de stock.');
    } finally {
      this.isLoading = false;
    }
  }
}
