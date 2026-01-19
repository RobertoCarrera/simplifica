import { Component, EventEmitter, Input, OnInit, Output, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductsService } from '../../../services/products.service';

@Component({
  selector: 'app-product-history-modal',
  standalone: true,
  imports: [CommonModule],
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
}
