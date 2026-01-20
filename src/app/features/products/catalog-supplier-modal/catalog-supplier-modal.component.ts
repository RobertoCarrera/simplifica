
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductsService } from '../../../services/products.service';

@Component({
    selector: 'app-catalog-supplier-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <!-- Background overlay -->
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-slate-900/80 transition-opacity" aria-hidden="true" (click)="closeModal()"></div>

        <!-- Modal panel -->
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div class="inline-block align-bottom bg-white dark:bg-slate-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full border border-gray-200 dark:border-slate-700">
          
          <!-- Header -->
          <div class="bg-gray-50 dark:bg-slate-900 px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center text-gray-900 dark:text-slate-100">
            <h3 class="text-lg leading-6 font-medium" id="modal-title">
              Proveedores para: <span class="font-bold">{{ catalogItem?.name }}</span>
            </h3>
            <button (click)="closeModal()" class="text-gray-400 hover:text-gray-500 focus:outline-none">
              <span class="sr-only">Cerrar</span>
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-4 pt-5 pb-4 sm:p-6">
            
            <!-- Add New Supplier Product Link -->
            <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 mb-6 border border-indigo-100 dark:border-indigo-800">
              <h4 class="text-sm font-semibold text-indigo-800 dark:text-indigo-300 mb-3 flex items-center gap-2">
                <i class="fas fa-plus-circle"></i> Vincular Nuevo Proveedor
              </h4>
              <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
                
                <!-- Supplier Select -->
                <div class="md:col-span-4">
                  <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label>
                  <select [(ngModel)]="newLink.supplier_id" class="block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2">
                    <option [ngValue]="null" disabled>Seleccionar...</option>
                    <option *ngFor="let s of suppliers" [value]="s.id">{{ s.name }}</option>
                  </select>
                </div>

                <!-- SKU -->
                <div class="md:col-span-3">
                  <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Ref/SKU Proveedor</label>
                  <input type="text" [(ngModel)]="newLink.supplier_sku" placeholder="Ej. REF-123" class="block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2">
                </div>

                <!-- Price -->
                <div class="md:col-span-3">
                  <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Precio Coste (€)</label>
                  <input type="number" [(ngModel)]="newLink.price" placeholder="0.00" min="0" step="0.01" class="block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2">
                </div>

                <!-- Add Button -->
                <div class="md:col-span-2 flex items-end">
                  <button (click)="addLink()" [disabled]="!newLink.supplier_id || !newLink.price" 
                    class="w-full bg-indigo-600 border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Añadir
                  </button>
                </div>
                
                <!-- URL (Optional second row) -->
                <div class="md:col-span-12">
                   <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enlace al producto (URL)</label>
                   <input type="text" [(ngModel)]="newLink.url" placeholder="https://proveedor.com/producto/..." class="block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-1.5">
                </div>

              </div>
            </div>

            <!-- Existing Links List -->
            <div class="relative">
              <div *ngIf="loadingLinks" class="absolute inset-0 bg-white/50 dark:bg-slate-800/50 flex items-center justify-center z-10">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
              </div>

              <h4 class="text-sm font-medium text-gray-900 dark:text-slate-100 mb-3">Proveedores Asignados</h4>
              
              <div *ngIf="links.length === 0" class="text-center py-8 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-gray-300 dark:border-slate-600">
                <p class="text-sm text-gray-500 dark:text-slate-400">No hay proveedores vinculados a este producto aún.</p>
              </div>

              <div *ngIf="links.length > 0" class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table class="min-w-full divide-y divide-gray-300 dark:divide-slate-700">
                  <thead class="bg-gray-50 dark:bg-slate-900">
                    <tr>
                      <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Proveedor</th>
                      <th scope="col" class="px-3 py-3.5 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">SKU / Ref</th>
                      <th scope="col" class="px-3 py-3.5 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Precio</th>
                      <th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span class="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                    <tr *ngFor="let link of links">
                      <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-slate-100">
                        {{ link.suppliers?.name }}
                        <a *ngIf="link.url" [href]="link.url" target="_blank" class="ml-2 text-indigo-400 hover:text-indigo-600" title="Ver en web del proveedor">
                          <i class="fas fa-external-link-alt text-xs"></i>
                        </a>
                      </td>
                      <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-slate-400 font-mono">{{ link.supplier_sku || '-' }}</td>
                      <td class="whitespace-nowrap px-3 py-4 text-sm font-bold text-gray-900 dark:text-slate-100">
                        {{ link.price | currency:'EUR' }}
                      </td>
                      <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button (click)="deleteLink(link.id)" class="text-red-600 hover:text-red-900 dark:hover:text-red-400 transition-colors">
                          <i class="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
          
          <!-- Footer -->
          <div class="bg-gray-50 dark:bg-slate-800/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200 dark:border-slate-700">
            <button type="button" (click)="closeModal()" class="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class CatalogSupplierModalComponent implements OnInit {
    @Input() catalogItem: any;
    @Output() close = new EventEmitter<void>();

    private productsService = inject(ProductsService);

    suppliers: any[] = [];
    links: any[] = [];
    loadingLinks = false;

    newLink = {
        supplier_id: null,
        supplier_sku: '',
        price: null,
        url: ''
    };

    ngOnInit() {
        this.loadSuppliers();
        if (this.catalogItem) {
            this.loadLinks();
        }
    }

    async loadSuppliers() {
        try {
            this.suppliers = await this.productsService.getSuppliers();
        } catch (err) {
            console.error('Error loading suppliers', err);
        }
    }

    async loadLinks() {
        if (!this.catalogItem?.id) return;
        this.loadingLinks = true;
        try {
            this.links = await this.productsService.getSupplierProducts(this.catalogItem.id);
        } catch (err) {
            console.error('Error loading links', err);
        } finally {
            this.loadingLinks = false;
        }
    }

    async addLink() {
        if (!this.catalogItem?.id || !this.newLink.supplier_id || !this.newLink.price) return;

        try {
            await this.productsService.addSupplierProduct({
                catalog_product_id: this.catalogItem.id,
                supplier_id: this.newLink.supplier_id,
                supplier_sku: this.newLink.supplier_sku,
                price: this.newLink.price,
                url: this.newLink.url
            });

            // Reset form and reload
            this.newLink = { supplier_id: null, supplier_sku: '', price: null, url: '' };
            this.loadLinks();
        } catch (err) {
            console.error('Error adding link', err);
            alert('Error al guardar el proveedor.');
        }
    }

    async deleteLink(id: string) {
        if (!confirm('¿Eliminar este proveedor de la lista?')) return;

        // We need a delete method in service, which we might not have exposed specifically for this table yet?
        // Let's check ProductsService. It seems I didn't verify a deleteSupplierProduct method.
        // I'll assume for now I need to add it or use a raw call if desperate, but better add to service.

        // HACK: For now, I will add the method to the service in the next step. 
        // I'll leave the call here commented or placeholder.

        try {
            await this.productsService.deleteSupplierProduct(id);
            this.loadLinks();
        } catch (err) {
            console.error(err);
        }
    }

    closeModal() {
        this.close.emit();
    }
}
