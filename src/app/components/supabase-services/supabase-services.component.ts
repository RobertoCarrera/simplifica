import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseServicesService, Service } from '../../services/supabase-services.service';

@Component({
  selector: 'app-supabase-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supabase-services.component.html',
  styleUrl: './supabase-services.component.scss'
})
export class SupabaseServicesComponent implements OnInit {
  
  // Company selector for development
  selectedCompanyId: string = '1'; // Default to SatPCGo
  
  // Core data
  services: Service[] = [];
  filteredServices: Service[] = [];
  loading = false;
  error: string | null = null;
  
  // Statistics
  stats = {
    total: 0,
    active: 0,
    averagePrice: 0,
    averageHours: 0
  };
  
  // Filters and search
  searchTerm = '';
  filterCategory = '';
  filterStatus = '';
  categories: string[] = [];
  
  // Form management
  showForm = false;
  editingService: Service | null = null;
  formData: Partial<Service> = {};
  
  // Form validation
  formErrors: Record<string, string> = {};
  
  private servicesService = inject(SupabaseServicesService);

  ngOnInit() {
    this.loadServices();
  }

  onCompanyChange() {
    console.log(`Cambiando a empresa ID: ${this.selectedCompanyId}`);
    this.loadServices();
  }

  async loadServices() {
    this.loading = true;
    this.error = null;
    
    try {
      console.log(`Cargando servicios para empresa ID: ${this.selectedCompanyId}`);
      this.services = await this.servicesService.getServices(parseInt(this.selectedCompanyId));
      this.updateFilteredServices();
      this.updateStats();
      this.extractCategories();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error loading services:', error);
    } finally {
      this.loading = false;
    }
  }

  updateFilteredServices() {
    this.filteredServices = this.services.filter(service => {
      const matchesSearch = service.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                           service.description?.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesCategory = !this.filterCategory || service.category === this.filterCategory;
      const matchesStatus = !this.filterStatus || 
                           (this.filterStatus === 'active' && service.is_active) ||
                           (this.filterStatus === 'inactive' && !service.is_active);
      
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  updateStats() {
    this.stats.total = this.services.length;
    this.stats.active = this.services.filter(s => s.is_active).length;
    this.stats.averagePrice = this.services.length > 0 
      ? this.services.reduce((sum, s) => sum + s.base_price, 0) / this.services.length 
      : 0;
    this.stats.averageHours = this.services.length > 0 
      ? this.services.reduce((sum, s) => sum + s.estimated_hours, 0) / this.services.length 
      : 0;
  }

  extractCategories() {
    const uniqueCategories = [...new Set(this.services.map(s => s.category).filter(Boolean))] as string[];
    this.categories = uniqueCategories.sort();
  }

  onSearch() {
    this.updateFilteredServices();
  }

  onFilterChange() {
    this.updateFilteredServices();
  }

  clearFilters() {
    this.searchTerm = '';
    this.filterCategory = '';
    this.filterStatus = '';
    this.updateFilteredServices();
  }

  openForm(service?: Service) {
    this.showForm = true;
    this.editingService = service || null;
    this.formData = service ? { ...service } : {
      name: '',
      description: '',
      base_price: 0,
      estimated_hours: 0,
      category: '',
      is_active: true
    };
    this.formErrors = {};
  }

  closeForm() {
    this.showForm = false;
    this.editingService = null;
    this.formData = {};
    this.formErrors = {};
  }

  validateForm(): boolean {
    this.formErrors = {};
    
    if (!this.formData.name?.trim()) {
      this.formErrors['name'] = 'El nombre es obligatorio';
    }
    
    if (!this.formData.base_price || this.formData.base_price < 0) {
      this.formErrors['base_price'] = 'El precio debe ser mayor a 0';
    }
    
    if (!this.formData.estimated_hours || this.formData.estimated_hours < 0) {
      this.formErrors['estimated_hours'] = 'Las horas estimadas deben ser mayor a 0';
    }
    
    if (!this.formData.category?.trim()) {
      this.formErrors['category'] = 'La categoría es obligatoria';
    }
    
    return Object.keys(this.formErrors).length === 0;
  }

  async saveService() {
    if (!this.validateForm()) return;
    
    this.loading = true;
    try {
      // Add company_id to form data
      const dataWithCompany = {
        ...this.formData,
        company_id: this.selectedCompanyId
      };

      if (this.editingService) {
        await this.servicesService.updateService(this.editingService.id, dataWithCompany);
      } else {
        await this.servicesService.createService(dataWithCompany);
      }
      
      this.closeForm();
      await this.loadServices();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error saving service:', error);
    } finally {
      this.loading = false;
    }
  }

  async deleteService(service: Service) {
    if (!confirm(`¿Estás seguro de que quieres eliminar el servicio "${service.name}"?`)) {
      return;
    }
    
    this.loading = true;
    try {
      await this.servicesService.deleteService(service.id);
      await this.loadServices();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error deleting service:', error);
    } finally {
      this.loading = false;
    }
  }

  async duplicateService(service: Service) {
    try {
      await this.servicesService.duplicateService(service.id);
      await this.loadServices();
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error duplicating service:', error);
    }
  }

  async toggleServiceStatus(service: Service) {
    this.loading = true;
    try {
      await this.servicesService.toggleServiceStatus(service.id);
      await this.loadServices();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error toggling service status:', error);
    } finally {
      this.loading = false;
    }
  }

  formatCurrency(amount: number): string {
    return this.servicesService.formatCurrency(amount);
  }

  formatHours(hours: number): string {
    return this.servicesService.formatHours(hours);
  }

  getServiceStatus(service: Service): string {
    return service.is_active ? 'Activo' : 'Inactivo';
  }

  getServiceStatusClass(service: Service): string {
    return service.is_active ? 'status-active' : 'status-inactive';
  }

  getCategoryColor(category: string): string {
    const colors = {
      'Diagnóstico': '#3b82f6',
      'Software': '#059669',
      'Mantenimiento': '#d97706',
      'Datos': '#dc2626',
      'Seguridad': '#7c3aed',
      'Hardware': '#f59e0b',
      'Redes': '#10b981'
    };
    return colors[category as keyof typeof colors] || '#6b7280';
  }
}
