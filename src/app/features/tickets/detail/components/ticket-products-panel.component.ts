import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';

@Component({
  selector: 'app-ticket-products-panel',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  template: `
    <div class="tab-content-animate">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
          Productos Asignados
        </h3>
        @if (!isClient) {
          <button
            (click)="modifyProductsClick.emit()"
            class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <i class="fas fa-box mr-2"></i>
            Modificar Productos
          </button>
        }
      </div>
      @if (ticketProducts.length === 0) {
        <div class="text-center py-12 text-gray-500 dark:text-gray-400">
          <i class="fas fa-box text-5xl mb-4 opacity-50"></i>
          <p class="text-lg">No hay productos asignados a este ticket</p>
          @if (!isClient) {
            <button
              (click)="modifyProductsClick.emit()"
              class="mt-4 inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <i class="fas fa-plus mr-2"></i>
              Añadir Productos
            </button>
          }
        </div>
      }
      @if (ticketProducts.length > 0) {
        <div class="space-y-4">
          @for (productItem of ticketProducts; track productItem) {
            <div
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-200"
            >
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <h4 class="font-medium text-gray-900 dark:text-gray-100">
                    {{ productItem.product?.name || 'Producto no especificado' }}
                  </h4>
                  @if (productItem.product?.description) {
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {{ productItem.product.description }}
                    </p>
                  }
                  <div
                    class="mt-2 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400"
                  >
                    <span
                      ><i class="fas fa-boxes w-4"></i> Cantidad:
                      {{ productItem.quantity }}</span
                    >
                    @if (productItem.product?.brand) {
                      <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                      >
                        <i class="fas fa-copyright w-3"></i>
                        {{ productItem.product.brand }}
                      </span>
                    }
                    @if (productItem.product?.category) {
                      <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      >
                        <i class="fas fa-tag w-3"></i>
                        {{ productItem.product.category }}
                      </span>
                    }
                  </div>
                </div>
                <div class="text-right">
                  <p class="font-medium text-gray-900 dark:text-gray-100">
                    {{ getProductUnitPrice(productItem) | currency:'EUR':'symbol':'1.2-2' }}
                  </p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Total: {{ getProductLineTotal(productItem) | currency:'EUR':'symbol':'1.2-2' }}
                  </p>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class TicketProductsPanelComponent {
  @Input() ticketProducts: any[] = [];
  @Input() isClient: boolean = false;

  @Output() modifyProductsClick = new EventEmitter<void>();

  getProductUnitPrice(item: any): number {
    const fromRelation = typeof item?.price_per_unit === 'number' ? item.price_per_unit : null;
    const fromProduct = typeof item?.product?.base_price === 'number' ? item.product.base_price : 0;
    return (fromRelation ?? fromProduct) || 0;
  }

  getProductLineTotal(item: any): number {
    const unitPrice = this.getProductUnitPrice(item);
    const qty = Number(item?.quantity) || 0;
    return unitPrice * qty;
  }
}
