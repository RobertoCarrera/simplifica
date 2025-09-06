import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductsService } from '../../services/products.service';

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
    stock_quantity: 0
  };
  isLoading = false;
  showNewProductForm = false;

  private productsService = inject(ProductsService);

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
    } catch (error) {
      console.error('Error saving product:', error);
    }
  }

  resetForm() {
    this.newProduct = {
      name: '',
      description: '',
      price: 0,
      stock_quantity: 0
    };
    this.showNewProductForm = false;
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
}
