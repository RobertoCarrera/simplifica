import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProductsService } from '../../../services/products.service';
import { ProductBrand, ProductCategory, ProductMetadataService } from '../../../services/product-metadata.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmModalComponent, ConfirmModalOptions } from '../../../shared/ui/confirm-modal/confirm-modal.component';
import { Product } from '../../../models/product';
import { Router } from '@angular/router';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsComponent implements OnInit, OnDestroy {
  products = signal<Product[]>([]);
  isLoading = signal<boolean>(true);
  showForm = signal<boolean>(false);
  editingProduct = signal<Product | null>(null);
  searchTerm = signal<string>('');
  filteredProducts = signal<Product[]>([]);

  newProduct: any = this.emptyDraft();

  availableBrands = signal<ProductBrand[]>([]);
  filteredBrands = signal<ProductBrand[]>([]);
  brandSearchText = signal<string>('');
  showBrandInput = signal<boolean>(false);

  availableCategories = signal<ProductCategory[]>([]);
  filteredCategories = signal<ProductCategory[]>([]);
  categorySearchText = signal<string>('');
  showCategoryInput = signal<boolean>(false);

  private productsService = inject(ProductsService);
  private productMetadataService = inject(ProductMetadataService);
  private toastService = inject(ToastService);
  private auth = inject(AuthService);
  private router = inject(Router);

  @ViewChild(ConfirmModalComponent) confirmModal!: ConfirmModalComponent;

  ngOnInit(): void { this.loadProducts(); }

  ngOnDestroy(): void { this.unlockBody(); }

  loadProducts(): void {
    this.isLoading.set(true);
    this.productsService.getProducts().subscribe({
      next: (products) => {
        this.products.set(products ?? []);
        this.filterProducts();
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading products:', error);
        this.toastService.error('Error', 'No se pudieron cargar los productos');
        this.isLoading.set(false);
      },
    });
  }

  filterProducts(): void {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) { this.filteredProducts.set([...this.products()]); return; }
    this.filteredProducts.set(this.products().filter((product) =>
      product.name?.toLowerCase().includes(term) ||
      product.description?.toLowerCase().includes(term) ||
      product.brand?.toLowerCase().includes(term) ||
      product.category?.toLowerCase().includes(term) ||
      product.model?.toLowerCase().includes(term)));
  }

  goToImport(): void { this.router.navigate(['/productos/importar']); }
  goToApi(): void { this.router.navigate(['/productos/conectar-api']); }

  resetForm(): void {
    this.newProduct = this.emptyDraft();
    this.editingProduct.set(null);
    this.showForm.set(false);
    this.brandSearchText.set('');
    this.categorySearchText.set('');
    this.showBrandInput.set(false);
    this.showCategoryInput.set(false);
    this.unlockBody();
  }

  openForm(): void {
    this.editingProduct.set(null);
    this.newProduct = this.emptyDraft();
    this.brandSearchText.set('');
    this.categorySearchText.set('');
    this.showForm.set(true);
    this.loadBrands();
    this.loadCategories();
    this.lockBody();
  }

  editProduct(product: Product): void {
    this.editingProduct.set(product);
    this.newProduct = {
      name: product.name,
      description: product.description || '',
      price: product.price,
      stock_quantity: product.stock_quantity,
      brand: product.brand || '',
      category: product.category || '',
      model: product.model || '',
    };
    this.brandSearchText.set(product.brand || '');
    this.categorySearchText.set(product.category || '');
    this.showForm.set(true);
    this.loadBrands();
    this.loadCategories();
    this.lockBody();
  }

  async saveProduct(): Promise<void> {
    if (!this.newProduct.name?.trim()) {
      this.toastService.error('Error', 'El nombre del producto es obligatorio');
      return;
    }
    const draft = {
      ...this.newProduct,
      name: this.newProduct.name.trim(),
      price: Number(this.newProduct.price) || 0,
      stock_quantity: Number(this.newProduct.stock_quantity) || 0,
      brand_id: this.newProduct.brand_id || null,
      category_id: this.newProduct.category_id || null,
      brand: this.newProduct.brand?.trim() || null,
      category: this.newProduct.category?.trim() || null,
      model: this.newProduct.model?.trim() || null,
      description: this.newProduct.description?.trim() || null,
    };
    const editing = this.editingProduct();
    const request$ = editing ? this.productsService.updateProduct(editing.id, draft) : this.productsService.createProduct(draft);
    request$.subscribe({
      next: () => {
        this.toastService.success('Guardado', editing ? 'Producto actualizado' : 'Producto creado');
        this.resetForm();
        this.loadProducts();
      },
      error: (error: any) => {
        console.error('Error saving product:', error);
        const backendMessage = error?.message || error?.error?.message || error?.details || error?.hint;
        this.toastService.error('Error al guardar', backendMessage || 'No se pudo guardar el producto');
      },
    });
  }

  async deleteProduct(product: Product): Promise<void> {
    const confirmed = await this.confirmModal.open({
      title: '¿Eliminar producto?',
      message: `Se eliminará "${product.name}" del catálogo. Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      icon: 'fa-trash-alt',
      iconColor: 'red',
    } as ConfirmModalOptions);
    if (!confirmed) return;
    this.productsService.deleteProduct(product.id).subscribe({
      next: () => {
        this.toastService.success('Eliminado', 'Producto eliminado correctamente');
        this.loadProducts();
      },
      error: (error) => {
        console.error('Error deleting product:', error);
        this.toastService.error('Error', 'No se pudo eliminar el producto');
      },
    });
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price ?? 0);
  }

  async loadBrands(): Promise<void> {
    try {
      const brands = await firstValueFrom(this.productMetadataService.getBrands());
      const deduped = this.dedupeById(brands ?? []);
      this.availableBrands.set(deduped);
      this.filteredBrands.set(deduped);
    } catch (error) {
      console.error('Error cargando marcas:', error);
      this.availableBrands.set([]);
      this.filteredBrands.set([]);
    }
  }

  onBrandSearchChange(): void {
    const term = this.brandSearchText().toLowerCase().trim();
    if (!term) { this.filteredBrands.set([...this.availableBrands()]); return; }
    this.filteredBrands.set(this.availableBrands().filter((b) => b.name.toLowerCase().includes(term)));
  }

  selectBrand(brand: ProductBrand): void {
    this.newProduct.brand = brand.name;
    this.newProduct.brand_id = brand.id;
    this.brandSearchText.set(brand.name);
    this.showBrandInput.set(false);
  }

  hasExactBrandMatch(): boolean {
    const term = this.brandSearchText().toLowerCase().trim();
    if (!term) return false;
    return this.availableBrands().some((b) => b.name.toLowerCase() === term);
  }

  getExactBrandMatch(): ProductBrand | undefined {
    const term = this.brandSearchText().toLowerCase().trim();
    return this.availableBrands().find((b) => b.name.toLowerCase() === term);
  }

  selectExistingBrandMatch(): void {
    const match = this.getExactBrandMatch();
    if (match) this.selectBrand(match);
  }

  async createNewBrand(): Promise<void> {
    const text = this.brandSearchText().trim();
    if (!text) return;
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.toastService.error('Error', 'No se pudo detectar tu empresa activa.');
      return;
    }
    try {
      const newBrand = await this.productMetadataService.createBrand(text, companyId);
      this.availableBrands.update((list) => [...list, newBrand]);
      this.selectBrand(newBrand);
    } catch (error: any) {
      console.error('Error creando marca:', error);
      const message = error?.message?.includes('already exists') || error?.code === '23505'
        ? `La marca "${text}" ya existe.`
        : 'No se pudo crear la marca. Puede que ya exista.';
      this.toastService.error('Error', message);
    }
  }

  async loadCategories(): Promise<void> {
    try {
      const categories = await firstValueFrom(this.productMetadataService.getCategories());
      const deduped = this.dedupeById(categories ?? []);
      this.availableCategories.set(deduped);
      this.filteredCategories.set(deduped);
    } catch (error) {
      console.error('Error cargando categorías:', error);
      this.availableCategories.set([]);
      this.filteredCategories.set([]);
    }
  }

  onCategorySearchChange(): void {
    const term = this.categorySearchText().toLowerCase().trim();
    if (!term) { this.filteredCategories.set([...this.availableCategories()]); return; }
    this.filteredCategories.set(this.availableCategories().filter((c) => c.name.toLowerCase().includes(term)));
  }

  selectCategory(category: ProductCategory): void {
    this.newProduct.category = category.name;
    this.newProduct.category_id = category.id;
    this.categorySearchText.set(category.name);
    this.showCategoryInput.set(false);
  }

  hasExactCategoryMatch(): boolean {
    const term = this.categorySearchText().toLowerCase().trim();
    if (!term) return false;
    return this.availableCategories().some((c) => c.name.toLowerCase() === term);
  }

  getExactCategoryMatch(): ProductCategory | undefined {
    const term = this.categorySearchText().toLowerCase().trim();
    return this.availableCategories().find((c) => c.name.toLowerCase() === term);
  }

  selectExistingCategoryMatch(): void {
    const match = this.getExactCategoryMatch();
    if (match) this.selectCategory(match);
  }

  async createNewCategory(): Promise<void> {
    const text = this.categorySearchText().trim();
    if (!text) return;
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.toastService.error('Error', 'No se pudo detectar tu empresa activa.');
      return;
    }
    try {
      const newCategory = await this.productMetadataService.createCategory(text, companyId);
      this.availableCategories.update((list) => [...list, newCategory]);
      this.selectCategory(newCategory);
    } catch (error: any) {
      console.error('Error creando categoría:', error);
      const message = error?.message?.includes('already exists') || error?.code === '23505'
        ? `La categoría "${text}" ya existe.`
        : 'No se pudo crear la categoría. Puede que ya exista.';
      this.toastService.error('Error', message);
    }
  }

  private dedupeById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of items) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
    return result;
  }

  private emptyDraft() {
    return { name: '', description: '', price: 0, stock_quantity: 0, brand: '', category: '', model: '' };
  }

  private lockBody(): void {
    try {
      document.body.classList.add('modal-open');
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.documentElement.style.overflow = 'hidden';
    } catch {}
  }

  private unlockBody(): void {
    try {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
    } catch {}
  }
}