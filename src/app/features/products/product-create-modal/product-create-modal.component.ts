import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProductsService } from '../../../services/products.service';
import { ProductMetadataService } from '../../../services/product-metadata.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { BarcodeScannerComponent } from '../barcode-scanner/barcode-scanner.component';

@Component({
    selector: 'app-product-create-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, BarcodeScannerComponent],
    templateUrl: './product-create-modal.component.html',
    styleUrls: ['./product-create-modal.component.scss']
})
export class ProductCreateModalComponent implements OnInit, OnDestroy {
    @Input() productToEdit: any = null;
    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<any>();

    newProduct: any = {
        name: '',
        description: '',
        price: 0,
        stock_quantity: 0,
        brand: '',
        category: '',
        model: '',
        barcode: '',
        location: '',
        min_stock_level: 5
    };

    // Scanner
    showScanner = false;

    // ... (rest of props)



    // ... (rest of methods)

    // Scanner Methods
    openScanner() {
        this.showScanner = true;
    }

    closeScanner() {
        this.showScanner = false;
    }

    handleScan(code: string) {
        this.newProduct.barcode = code;
        this.closeScanner();
        this.toastService.success('Escaneado', `Código detectado: ${code}`);
    }

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
    private authService = inject(AuthService);
    private toastService = inject(ToastService);

    private popStateListener: any = null;

    ngOnInit() {
        if (this.productToEdit) {
            this.initEditMode(this.productToEdit);
        }
        this.loadBrands();
        this.loadCategories();
        this.lockBody();

        // Prevent back navigation from closing the app, instead close modal
        // Note: This logic might interfere if used inside another modal, but for now we replicate original behavior
        history.pushState({ modal: 'product-form' }, '');

        if (!this.popStateListener) {
            this.popStateListener = (event: PopStateEvent) => {
                this.closeModal();
            };
            window.addEventListener('popstate', this.popStateListener);
        }
    }

    ngOnDestroy() {
        this.unlockBody();
        if (this.popStateListener) {
            window.removeEventListener('popstate', this.popStateListener);
        }
        // Clean up history state if we pushed it and are destroying component manually (not by back button)
        // Actually, if we are destroying, it's either because of Back button (state already popped)
        // or because we closed it manually.
    }

    initEditMode(product: any) {
        this.newProduct = {
            name: product.name,
            description: product.description || '',
            price: product.price,
            stock_quantity: product.stock_quantity,
            brand: product.brand || '',
            brand_id: product.brand_id,
            category: product.category || '',
            category_id: product.category_id,
            catalog_product_id: product.catalog_product_id || null,
            model: product.model || ''
        };
        this.brandSearchText = product.brand || '';
        this.categorySearchText = product.category || '';
        this.modelSearchText = product.model || '';

        if (product.brand_id) {
            this.loadModels(product.brand_id);
        }
    }

    private lockBody() {
        try {
            document.body.classList.add('modal-open');
            document.body.style.overflow = 'hidden';
            // Basic body lock, refined in styles.scss
        } catch { }
    }

    private unlockBody() {
        try {
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
        } catch { }
    }

    closeModal() {
        this.unlockBody();
        this.close.emit();
        // If we have history state, we should probably go back if we are the ones who pushed it
        // But handling history state in a re-usable component is tricky.
        // If the user clicked "Cancel", we should ideally go back() to pop the state we pushed.
        if (history.state && history.state.modal === 'product-form') {
            history.back();
        }
    }

    closeIfClickOutside(event: MouseEvent) {
        // Relying on the overlay being the click target
        // We will verify this with the template structure
        this.closeModal();
    }

    async saveProduct() {
        if (!this.newProduct.name || !this.newProduct.brand || !this.newProduct.category || !this.newProduct.model || !this.newProduct.price) {
            this.toastService.error('Error', 'Por favor completa todos los campos obligatorios: Nombre, Marca, Categoría, Modelo y Precio.');
            return;
        }

        try {
            // Signal usage: direct access, fallback to empty string
            const companyId = this.authService.companyId() || '';

            // 1. Ensure Brand Exists (and get ID)
            let brandId = this.newProduct.brand_id; // Start with existing selected ID if any

            if (this.newProduct.brand && companyId) {
                try {
                    const brand = await this.productMetadataService.createBrand(this.newProduct.brand, companyId);
                    brandId = brand.id;
                    this.newProduct.brand_id = brand.id; // Important: Update the payload ID
                } catch (e) {
                    console.error('Error syncing brand:', e);
                }
            }

            // 2. Ensure Category Exists - Capture ID to newProduct
            if (this.newProduct.category && companyId) {
                try {
                    const category = await this.productMetadataService.createCategory(this.newProduct.category, companyId);
                    this.newProduct.category_id = category.id; // Important: Update the payload ID
                } catch (e) {
                    console.error('Error syncing category:', e);
                }
            }

            // 3. Ensure Model Exists (if we have a brand)
            if (this.newProduct.model && brandId && companyId) {
                try {
                    await this.productMetadataService.createModel(this.newProduct.model, brandId, companyId);
                } catch (e) {
                    console.error('Error syncing model:', e);
                }
            }

            if (this.productToEdit) {
                // Update
                const updated = await firstValueFrom(this.productsService.updateProduct(this.productToEdit.id, this.newProduct));
                this.saved.emit(updated);
                this.toastService.success('Éxito', 'Producto actualizado correctamente');
            } else {
                // Create
                const created = await firstValueFrom(this.productsService.createProduct(this.newProduct));
                this.saved.emit(created);
                this.toastService.success('Éxito', 'Producto creado correctamente');
            }
            this.closeModal();
        } catch (error) {
            console.error('Error saving product:', error);
            this.toastService.error('Error', 'Error al guardar el producto');
        }
    }

    // --- Brand Logic ---

    async loadBrands() {
        try {
            this.availableBrands = await firstValueFrom(this.productMetadataService.getBrands());
            this.filteredBrands = [...this.availableBrands];
        } catch (error) {
            console.error('Error loading brands:', error);
            this.availableBrands = [];
            this.filteredBrands = [];
        }
    }

    onBrandSearchChange() {
        if (!this.brandSearchText.trim()) {
            this.filteredBrands = [...this.availableBrands];
            this.newProduct.brand_id = null;
            this.availableModels = [];
            this.filteredModels = [];
            return;
        }
        this.newProduct.brand_id = null;
        this.availableModels = [];
        this.filteredModels = [];
        const searchText = this.brandSearchText.toLowerCase().trim();
        this.filteredBrands = this.availableBrands.filter(brand =>
            brand.name.toLowerCase().includes(searchText)
        );
    }

    onBrandEnter(event?: Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (!this.brandSearchText.trim()) return;

        const match = this.getExactBrandMatch();
        if (match) {
            this.selectBrand(match);
        } else {
            this.createNewBrand();
        }
    }

    selectBrand(brand: any) {
        this.newProduct.brand = brand.name;
        this.newProduct.brand_id = brand.id;
        this.brandSearchText = brand.name;
        this.showBrandInput = false;

        // Reset and load models
        this.newProduct.model = '';
        this.modelSearchText = '';
        this.loadModels(brand.id);
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
            const companyId = this.authService.currentCompanyId() || '';
            const newBrand = await this.productMetadataService.createBrand(
                this.brandSearchText.trim(),
                companyId
            );
            this.availableBrands.push(newBrand);
            this.selectBrand(newBrand);
            this.toastService.success('Marca creada', `La marca "${newBrand.name}" se ha creado correctamente.`);
        } catch (error) {
            console.error('Error creating brand:', error);
            this.toastService.error('Error', 'No se pudo crear la marca');
        }
    }

    // --- Category Logic ---

    async loadCategories() {
        try {
            this.availableCategories = await firstValueFrom(this.productMetadataService.getCategories());
            this.filteredCategories = [...this.availableCategories];
        } catch (error) {
            console.error('Error loading categories:', error);
            this.availableCategories = [];
            this.filteredCategories = [];
        }
    }

    onCategorySearchChange() {
        if (!this.categorySearchText.trim()) {
            this.filteredCategories = [...this.availableCategories];
            this.newProduct.category_id = null;
            return;
        }
        this.newProduct.category_id = null;
        const searchText = this.categorySearchText.toLowerCase().trim();
        this.filteredCategories = this.availableCategories.filter(cat =>
            cat.name.toLowerCase().includes(searchText)
        );
    }

    onCategoryEnter(event?: Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (!this.categorySearchText.trim()) return;

        const match = this.getExactCategoryMatch();
        if (match) {
            this.selectCategory(match);
        } else {
            this.createNewCategory();
        }
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

    // --- Model Logic ---

    availableModels: any[] = [];
    filteredModels: any[] = [];
    modelSearchText: string = '';
    showModelInput = false;

    async loadModels(brandId: string) {
        if (!brandId) {
            this.availableModels = [];
            this.filteredModels = [];
            return;
        }
        try {
            this.availableModels = await firstValueFrom(this.productMetadataService.getModels(brandId));
            this.filteredModels = [...this.availableModels];
        } catch (error) {
            console.error('Error loading models:', error);
            this.availableModels = [];
            this.filteredModels = [];
        }
    }

    onModelSearchChange() {
        if (!this.modelSearchText.trim()) {
            this.filteredModels = [...this.availableModels];
            return; // Don't clear model text yet, let user type
        }
        this.newProduct.model = this.modelSearchText; // Update model text as user types
        const searchText = this.modelSearchText.toLowerCase().trim();
        this.filteredModels = this.availableModels.filter(m =>
            m.name.toLowerCase().includes(searchText)
        );
    }

    onModelEnter(event?: Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (!this.modelSearchText.trim()) return;

        const match = this.getExactModelMatch();
        if (match) {
            this.selectModel(match);
        } else {
            this.createNewModel();
        }
    }

    selectModel(model: any) {
        this.newProduct.model = model.name;
        this.modelSearchText = model.name;
        this.showModelInput = false;
    }

    hasExactModelMatch(): boolean {
        if (!this.modelSearchText.trim()) return false;
        const searchText = this.modelSearchText.toLowerCase().trim();
        return this.availableModels.some(m => m.name.toLowerCase() === searchText);
    }

    getExactModelMatch(): any {
        const searchText = this.modelSearchText.toLowerCase().trim();
        return this.availableModels.find(m => m.name.toLowerCase() === searchText);
    }

    selectExistingModelMatch() {
        const match = this.getExactModelMatch();
        if (match) {
            this.selectModel(match);
        }
    }

    async createNewModel() {
        // If we have a brand ID, we can create the model immediately in the DB
        if (this.newProduct.brand_id) {
            try {
                if (!this.modelSearchText.trim()) return;
                const companyId = this.authService.currentCompanyId() || '';
                const newModel = await this.productMetadataService.createModel(
                    this.modelSearchText.trim(),
                    this.newProduct.brand_id,
                    companyId
                );
                this.availableModels.push(newModel);
                this.selectModel(newModel);
                this.toastService.success('Modelo creado', `El modelo "${newModel.name}" se ha creado.`);
            } catch (error) {
                console.error('Error creating model:', error);
                // Fallback: just use text
                this.newProduct.model = this.modelSearchText.trim();
                this.showModelInput = false;
            }
        } else {
            // No brand ID (e.g. new brand), just set the text and let saveProduct handle it
            this.newProduct.model = this.modelSearchText.trim();
            this.showModelInput = false;
        }
    }

    async createNewCategory() {
        try {
            if (!this.categorySearchText.trim()) return;
            const companyId = this.authService.currentCompanyId() || '';
            const newCategory = await this.productMetadataService.createCategory(
                this.categorySearchText.trim(),
                companyId
            );
            this.availableCategories.push(newCategory);
            this.selectCategory(newCategory);
            this.toastService.success('Categoría creada', `La categoría "${newCategory.name}" se ha creado correctamente.`);
        } catch (error) {
            console.error('Error creating category:', error);
            alert('Error al crear la categoría. Puede que ya exista.');
        }
    }
}
