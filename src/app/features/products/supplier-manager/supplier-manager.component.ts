import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductsService } from '../../../services/products.service';

@Component({
  selector: 'app-supplier-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supplier-manager.component.html',
  styleUrl: './supplier-manager.component.scss'
})
export class SupplierManagerComponent implements OnInit {
  private productService = inject(ProductsService);

  suppliers: any[] = [];
  isLoading = false;

  // Form State
  showForm = false;
  isEditing = false;
  currentSupplier: any = this.getEmptySupplier();

  ngOnInit() {
    this.loadSuppliers();
  }

  getEmptySupplier() {
    return {
      name: '',
      email: '',
      phone: '',
      website: '',
      address: '',
      tax_id: ''
    };
  }

  async loadSuppliers() {
    this.isLoading = true;
    try {
      this.suppliers = await this.productService.getSuppliers();
    } catch (err) {
      console.error('Error loading suppliers', err);
    } finally {
      this.isLoading = false;
    }
  }

  openCreateForm() {
    this.isEditing = false;
    this.currentSupplier = this.getEmptySupplier();
    this.showForm = true;
  }

  editSupplier(supplier: any) {
    this.isEditing = true;
    this.currentSupplier = { ...supplier };
    this.showForm = true;
  }

  closeForm() {
    this.showForm = false;
    this.currentSupplier = this.getEmptySupplier();
  }

  async saveSupplier() {
    if (!this.currentSupplier.name) return;

    try {
      if (this.isEditing && this.currentSupplier.id) {
        await this.productService.updateSupplier(this.currentSupplier.id, this.currentSupplier);
      } else {
        await this.productService.createSupplier(this.currentSupplier);
      }

      this.closeForm();
      this.loadSuppliers();
    } catch (err) {
      console.error('Error saving supplier', err);
    }
  }

  async deleteSupplier(supplier: any) {
    if (!confirm(`¿Estás seguro de que deseas eliminar al proveedor "${supplier.name}"?`)) {
      return;
    }

    try {
      await this.productService.deleteSupplier(supplier.id);
      this.loadSuppliers();
    } catch (err) {
      console.error('Error deleting supplier', err);
    }
  }
}
