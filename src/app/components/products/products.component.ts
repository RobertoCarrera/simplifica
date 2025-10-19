import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductsService } from '../../services/products.service';
import { ProductMetadataService } from '../../services/product-metadata.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss']
})
export class ProductsComponent implements OnInit {
  products: any[] = [];
  newProduct: any = {
    name: '',
    description: '',
    price: 0,
    stock_quantity: 0,
    brand: '',
    category: '',
    model: ''
  };
  editingProduct: any = null;
  isLoading = false;
  showNewProductForm = false;

  // Autocomplete for brands and categories
  availableBrands: any[] = [];
  filteredBrands: any[] = [];
  brandSearchText: string = '';
  showBrandInput = false;
  
  availableCategories: any[] = [];
  filteredCategories: any[] = [];
  categorySearchText: string = '';
  showCategoryInput = false;

  private productsService = inject(ProductsService);
  private productMetadataService = inject(ProductMetadataService);

  ngOnInit() {
    this.loadProducts();
  }

  async loadProducts() {
    try {
      this.isLoading = true;
      this.productsService.getProducts().subscribe({
        next: (products) => {
          this.products = products;
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

  async saveProduct() {
    try {
      if (this.newProduct.name.trim()) {
        if (this.editingProduct) {
          // Actualizar producto existente
          this.productsService.updateProduct(this.editingProduct.id, this.newProduct).subscribe({
            next: () => {
              this.resetForm();
              this.loadProducts();
            },
            error: (error) => {
              console.error('Error updating product:', error);
            }
          });
        } else {
          // Crear nuevo producto
          this.productsService.createProduct(this.newProduct).subscribe({
            next: () => {
              this.resetForm();
              this.loadProducts();
            },
            error: (error) => {
              console.error('Error saving product:', error);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error saving product:', error);
    }
  }

  editProduct(product: any) {
    this.editingProduct = product;
    this.newProduct = {
      name: product.name,
      description: product.description || '',
      price: product.price,
      stock_quantity: product.stock_quantity,
      brand: product.brand || '',
      category: product.category || '',
      model: product.model || ''
    };
    this.brandSearchText = product.brand || '';
    this.categorySearchText = product.category || '';
    this.showNewProductForm = true;
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

  resetForm() {
    this.newProduct = {
      name: '',
      description: '',
      price: 0,
      stock_quantity: 0,
      brand: '',
      category: '',
      model: ''
    };
    this.editingProduct = null;
    this.showNewProductForm = false;
    this.brandSearchText = '';
    this.categorySearchText = '';
    this.showBrandInput = false;
    this.showCategoryInput = false;
  }

  toggleForm() {
    this.showNewProductForm = !this.showNewProductForm;
    if (this.showNewProductForm) {
      this.loadBrands();
      this.loadCategories();
    } else {
      this.resetForm();
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(price);
  }

  // Brand autocomplete methods
  async loadBrands() {
    try {
      this.availableBrands = await firstValueFrom(this.productMetadataService.getBrands());
      this.filteredBrands = [...this.availableBrands];
    } catch (error) {
      console.error('Error cargando marcas:', error);
      this.availableBrands = [];
      this.filteredBrands = [];
    }
  }

  onBrandSearchChange() {
    if (!this.brandSearchText.trim()) {
      this.filteredBrands = [...this.availableBrands];
      return;
    }
    const searchText = this.brandSearchText.toLowerCase().trim();
    this.filteredBrands = this.availableBrands.filter(brand =>
      brand.name.toLowerCase().includes(searchText)
    );
  }

  selectBrand(brand: any) {
    this.newProduct.brand = brand.name;
    this.newProduct.brand_id = brand.id;
    this.brandSearchText = brand.name;
    this.showBrandInput = false;
  }

  hasExactBrandMatch(): boolean {
    if (!this.brandSearchText.trim()) return false;
    const searchText = this.brandSearchText.toLowerCase().trim();
    return this.availableBrands.some(b => b.name.toLowerCase() === searchText);
  }

  getExactBrandMatch(): any {
    const searchText = this.brandSearchText.toLowerCase().trim();
    return this.availableBrands.find(b => b.name.toLowerCase() === searchText);
  }

  selectExistingBrandMatch() {
    const match = this.getExactBrandMatch();
    if (match) {
      this.selectBrand(match);
    }
  }

  async createNewBrand() {
    try {
      if (!this.brandSearchText.trim()) return;
      
      // Get current company_id from localStorage or wherever it's stored
      const companyId = localStorage.getItem('selectedCompanyId') || '';
      
      const newBrand = await this.productMetadataService.createBrand(
        this.brandSearchText.trim(), 
        companyId
      );
      
      this.availableBrands.push(newBrand);
      this.selectBrand(newBrand);
    } catch (error) {
      console.error('Error creando marca:', error);
      alert('Error al crear la marca. Puede que ya exista.');
    }
  }

  // Category autocomplete methods
  async loadCategories() {
    try {
      this.availableCategories = await firstValueFrom(this.productMetadataService.getCategories());
      this.filteredCategories = [...this.availableCategories];
    } catch (error) {
      console.error('Error cargando categorías:', error);
      this.availableCategories = [];
      this.filteredCategories = [];
    }
  }

  onCategorySearchChange() {
    if (!this.categorySearchText.trim()) {
      this.filteredCategories = [...this.availableCategories];
      return;
    }
    const searchText = this.categorySearchText.toLowerCase().trim();
    this.filteredCategories = this.availableCategories.filter(category =>
      category.name.toLowerCase().includes(searchText)
    );
  }

  selectCategory(category: any) {
    this.newProduct.category = category.name;
    this.newProduct.category_id = category.id;
    this.categorySearchText = category.name;
    this.showCategoryInput = false;
  }

  hasExactCategoryMatch(): boolean {
    if (!this.categorySearchText.trim()) return false;
    const searchText = this.categorySearchText.toLowerCase().trim();
    return this.availableCategories.some(c => c.name.toLowerCase() === searchText);
  }

  getExactCategoryMatch(): any {
    const searchText = this.categorySearchText.toLowerCase().trim();
    return this.availableCategories.find(c => c.name.toLowerCase() === searchText);
  }

  selectExistingCategoryMatch() {
    const match = this.getExactCategoryMatch();
    if (match) {
      this.selectCategory(match);
    }
  }

  async createNewCategory() {
    try {
      if (!this.categorySearchText.trim()) return;
      
      // Get current company_id from localStorage or wherever it's stored
      const companyId = localStorage.getItem('selectedCompanyId') || '';
      
      const newCategory = await this.productMetadataService.createCategory(
        this.categorySearchText.trim(), 
        companyId
      );
      
      this.availableCategories.push(newCategory);
      this.selectCategory(newCategory);
    } catch (error) {
      console.error('Error creando categoría:', error);
      alert('Error al crear la categoría. Puede que ya exista.');
    }
  }
}
