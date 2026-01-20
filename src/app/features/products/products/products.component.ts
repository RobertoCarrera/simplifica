import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductMetadataService } from '../../../services/product-metadata.service';
import { ProductsService } from '../../../services/products.service';
import { ProductCreateModalComponent } from '../product-create-modal/product-create-modal.component';
import { ProductHistoryModalComponent } from '../product-history-modal/product-history-modal.component';
import { BarcodeScannerComponent } from '../barcode-scanner/barcode-scanner.component';
import { CatalogSupplierModalComponent } from '../catalog-supplier-modal/catalog-supplier-modal.component';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ProductCreateModalComponent, ProductHistoryModalComponent, BarcodeScannerComponent, CatalogSupplierModalComponent],
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

  // Supplier Modal State
  showSupplierModal = false;
  supplierModalItem: any = null;

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

  // --- Import Confirmation Modal ---
  showImportModal = false;
  pendingImportItem: any = null;

  importToInventory(catalogItem: any) {
    this.pendingImportItem = catalogItem;
    this.showImportModal = true;
  }

  cancelImport() {
    this.showImportModal = false;
    this.pendingImportItem = null;
  }

  confirmImport() {
    if (!this.pendingImportItem) return;
    const catalogItem = this.pendingImportItem;
    this.showImportModal = false;

    // Map catalog item to local product structure
    const newProduct = {
      name: catalogItem.name,
      description: catalogItem.description || catalogItem.name,
      brand_name: catalogItem.brand,
      model: catalogItem.model,
      category_name: (() => {
        const map: any = {
          'Headphones': 'Auriculares', 'Earbuds': 'Auriculares',
          'Smartphones': 'Teléfonos', 'Mobile Phones': 'Teléfonos',
          'Laptops': 'Portátiles',
          'Tablets': 'Tablets', 'Pads': 'Tablets',
          'Consoles': 'Consolas',
          'Accessories': 'Accesorios',
          'Audio': 'Sonido',
          'Computers': 'Informática',
          'Electronics': 'Electrónica'
        };
        return map[catalogItem.category] || catalogItem.category;
      })(),
      price: 0,
      stock_quantity: 0,
      catalog_product_id: catalogItem.id,
      ean: catalogItem.ean,
      image_url: catalogItem.image_url
    };

    this.isLoading = true;
    this.productsService.createProduct(newProduct).subscribe({
      next: (createdProduct) => {
        this.isLoading = false;
        this.loadProducts();
        this.activeTab = 'inventory';

        // Enrich the created product with the names we know, 
        // because the API response might only contain IDs (relations not expanded)
        const enrichedProduct = {
          ...createdProduct,
          brand: newProduct.brand_name,
          category: newProduct.category_name,
          model: newProduct.model // createProduct response should have model, but to be safe
        };

        // Open edit modal for the newly created product
        this.editProduct(enrichedProduct);
      },
      error: (e) => {
        console.error(e);
        this.isLoading = false;
        this.pendingImportItem = null;
      }
    });
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

  openSupplierModal(item: any, event: Event) {
    event.stopPropagation();
    this.supplierModalItem = item;
    this.showSupplierModal = true;
  }

  closeSupplierModal() {
    this.showSupplierModal = false;
    this.supplierModalItem = null;
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
