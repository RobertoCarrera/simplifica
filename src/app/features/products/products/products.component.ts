import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductMetadataService } from '../../../services/product-metadata.service';
import { ProductsService } from '../../../services/products.service';
import { ProductCreateModalComponent } from '../product-create-modal/product-create-modal.component';
import { ProductHistoryModalComponent } from '../product-history-modal/product-history-modal.component';
import { BarcodeScannerComponent } from '../barcode-scanner/barcode-scanner.component';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ProductCreateModalComponent, ProductHistoryModalComponent, BarcodeScannerComponent],
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss']
})
export class ProductsComponent implements OnInit {
  // Tabs: 'inventory' or 'catalog'
  activeTab: 'inventory' | 'catalog' = 'inventory';

  // Inventory Data
  products: any[] = [];
  filteredProducts: any[] = [];
  searchTerm: string = '';

  // Catalog Data
  catalogResults: any[] = [];
  catalogSearchTerm: string = '';
  isCatalogLoading = false;

  editingProduct: any = null;
  isLoading = false;
  showNewProductForm = false;

  // History Modal State
  showHistoryModal = false;
  historyProduct: any = null;

  private productsService = inject(ProductsService);
  private productMetadataService = inject(ProductMetadataService);

  ngOnInit() {
    this.loadProducts();
  }

  // ... (rest of the file)

  async seedCatalog() {
    if (!confirm('Esto añadirá datos de prueba al Catálogo Global. ¿Continuar?')) return;
    try {
      this.isCatalogLoading = true;
      await this.productMetadataService.seedCatalog();
    } catch (error) {
      console.error('Seeding cleanup error:', error);
    } finally {
      this.isCatalogLoading = false;
    }
  }

  // --- Inventory Methods ---

  async loadProducts() {
    try {
      this.isLoading = true;
      this.productsService.getProducts().subscribe({
        next: (products) => {
          this.products = products;
          this.filteredProducts = [...products];
          this.filterProducts();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading products:', error);
          this.isLoading = false;
        }
      });
    } catch (error) {
      console.error('Error loading products:', error);
      this.isLoading = false;
    }
  }

  showLowStockOnly = false;

  filterProducts() {
    let filtered = this.products;

    // 1. Text Search
    if (this.searchTerm.trim()) {
      const searchText = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(product =>
        product.name?.toLowerCase().includes(searchText) ||
        product.description?.toLowerCase().includes(searchText) ||
        product.brand?.toLowerCase().includes(searchText) ||
        product.category?.toLowerCase().includes(searchText) ||
        product.model?.toLowerCase().includes(searchText)
      );
    }

    // 2. Low Stock Filter
    if (this.showLowStockOnly) {
      filtered = filtered.filter(product => {
        const minStock = product.min_stock_level || 5;
        // Show if stock is "Red" (< min) or "Yellow" (< min*2)
        // Adjust logic based on preference. Usually "Low Stock" means "Needs Action" so Red+Yellow.
        return (product.stock_quantity || 0) < (minStock * 2);
      });
    }

    this.filteredProducts = filtered;
  }

  toggleLowStockFilter() {
    this.showLowStockOnly = !this.showLowStockOnly;
    this.filterProducts();
  }

  // --- Catalog Methods ---

  setActiveTab(tab: 'inventory' | 'catalog') {
    this.activeTab = tab;
    if (tab === 'catalog' && this.catalogResults.length === 0) {
      this.loadCatalogProducts();
    }
  }

  async loadCatalogProducts() {
    this.isCatalogLoading = true;
    try {
      this.catalogResults = await this.productMetadataService.listCatalogProducts();
    } catch (error) {
      console.error('Error loading catalog products:', error);
    } finally {
      this.isCatalogLoading = false;
    }
  }

  async searchCatalog() {
    if (!this.catalogSearchTerm.trim()) {
      this.catalogResults = [];
      return;
    }

    this.isCatalogLoading = true;
    try {
      this.catalogResults = await this.productMetadataService.searchCatalog(this.catalogSearchTerm);
    } catch (error) {
      console.error('Error searching catalog:', error);
    } finally {
      this.isCatalogLoading = false;
    }
  }

  async importToInventory(catalogItem: any) {
    if (!confirm(`¿Quieres añadir "${catalogItem.name}" a tu inventario?`)) return;

    // Map catalog item to local product structure
    const newProduct = {
      name: catalogItem.name,
      description: catalogItem.specs ? JSON.stringify(catalogItem.specs) : catalogItem.name,
      brand_name: catalogItem.brand, // Service handles parsing or creation
      model: catalogItem.model,
      category_name: catalogItem.category,
      price: 0, // Default to 0, user should update
      stock_quantity: 0,
      catalog_product_id: catalogItem.id
    };

    // We open the form pre-filled instead of auto-crating?
    // User requested "quick add". But prices/stock are needed.
    // Let's open the modal in "Create" mode but pre-filled.

    this.editingProduct = null;
    this.showNewProductForm = true;

    // Slight hack: we need to pass this data to the modal.
    // The modal currently takes `productToEdit` (which implies ID exists).
    // I'll overload `productToEdit` or use a new logic in future.
    // For now, let's treat it as a "Template".

    setTimeout(() => {
      // We can expose a method on the child or rely on inputs.
      // Since `productToEdit` expects an ID for updates, let's just create it directly 
      // OR better: Add `prefillData` input to modal.
      // For this iteration, I'll direct save it as 0 stock/price if that's acceptable?
      // User said: "base de datos completa y potente ya lista para decirte qué producto es"
      // Let's just creation directly and let them edit later.

      this.isLoading = true;
      this.productsService.createProduct(newProduct).subscribe({
        next: (createdProduct) => {
          this.isLoading = false;
          this.loadProducts();
          this.activeTab = 'inventory';
          // Open edit modal for the newly created product
          this.editProduct(createdProduct);
        },
        error: (e) => {
          console.error(e);
          this.isLoading = false;
        }
      });
    }, 100);
  }

  // --- Modal & Actions ---

  openForm() {
    this.editingProduct = null;
    this.showNewProductForm = true;
  }

  editProduct(product: any) {
    this.editingProduct = product;
    this.showNewProductForm = true;
  }

  viewHistory(product: any) {
    this.historyProduct = product;
    this.showHistoryModal = true;
  }

  closeHistoryModal() {
    this.showHistoryModal = false;
    this.historyProduct = null;
  }

  closeForm() {
    this.showNewProductForm = false;
    this.editingProduct = null;
  }

  onProductSaved() {
    this.closeForm();
    this.loadProducts();
  }

  async deleteProduct(product: any) {
    if (confirm(`¿Estás seguro de que quieres eliminar "${product.name}"?`)) {
      try {
        this.productsService.deleteProduct(product.id).subscribe({
          next: () => {
            this.loadProducts();
          },
          error: (error) => {
            console.error('Error deleting product:', error);
          }
        });
      } catch (error) {
        console.error('Error deleting product:', error);
      }
    }
  }

  // --- Scanner Logic ---

  showScanner = false;

  openScanner() {
    this.showScanner = true;
  }

  closeScanner() {
    this.showScanner = false;
  }

  handleScan(code: string) {
    this.closeScanner();
    if (this.activeTab === 'inventory') {
      this.searchTerm = code;
      this.filterProducts();
    } else {
      this.catalogSearchTerm = code;
      this.searchCatalog();
    }
  }

  // --- Utility ---
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(price);
  }

}
