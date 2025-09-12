import { Component, OnInit } from '@angular/core';
import { CustomersService } from '../../services/customers.service';
import { Customer } from '../../models/customer';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalCustomerComponent } from '../modal-customer/modal-customer.component';
import { BtnNewComponent } from "../btn-new/btn-new.component";
import { SimpleSupabaseService, SimpleClient } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-dashboard-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnNewComponent, ModalCustomerComponent],
  templateUrl: './dashboard-customers.component.html',
  styleUrl: './dashboard-customers.component.scss'
})
export class DashboardCustomersComponent implements OnInit {

  // Datos originales (legacy)
  customers: Customer[] = [];
  
  // Nuevos datos multi-tenant
  clients: SimpleClient[] = [];
  
  searchCustomer: string = '';
  isShrink = false;
  modalCustomer = false;
  selectedCustomer: Customer | null = null;
  isModalVisible: boolean = false;
  customerInEdition: Customer | null = null;
  changeEditionCustomer: boolean = false;
  currentPage: number = 1;
  totalPages: number = 0;
  creatingCustomer: boolean = false;

  // Estado del sistema multi-tenant
  currentCompany: string | null = null;
  loading = false;
  error: string | null = null;
  activeTab: 'legacy' | 'multitenant' = 'legacy';

  constructor(
    private customerService: CustomersService,
    private supabase: SimpleSupabaseService
  ) {}

  ngOnInit(): void {
    // Cargar datos legacy
    this.customerService.getCustomers().subscribe(customers => {
      this.customers = customers;
    });

    // Cargar datos multi-tenant
    this.loadMultiTenantData();
  }

  // === NUEVOS MÉTODOS MULTI-TENANT ===

  async loadMultiTenantData(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const result = await this.supabase.getClients();
      
      if (result.success && result.data) {
        this.clients = result.data;
        console.log('Clientes cargados:', this.clients);
      } else {
        this.error = 'Error cargando clientes: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error cargando clientes: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  async createNewClient(): Promise<void> {
    const clientName = prompt('Nombre del cliente:');
    const clientEmail = prompt('Email del cliente (opcional):');
    
    if (!clientName) return;

    this.loading = true;
    try {
      const result = await this.supabase.createClient(clientName, clientEmail || undefined);
      
      if (result.success && result.data) {
        this.clients.push(result.data);
        console.log('Cliente creado:', result.data);
      } else {
        this.error = 'Error creando cliente: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error creando cliente: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  async deleteClient(clientId: string): Promise<void> {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) return;

    this.loading = true;
    try {
      const result = await this.supabase.deleteClient(clientId);
      
      if (result.success) {
        this.clients = this.clients.filter(c => c.id !== clientId);
        console.log('Cliente eliminado');
      } else {
        this.error = 'Error eliminando cliente: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error eliminando cliente: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  async searchClients(): Promise<void> {
    if (!this.searchCustomer.trim()) {
      this.loadMultiTenantData();
      return;
    }

    this.loading = true;
    try {
      const result = await this.supabase.searchClients(this.searchCustomer);
      
      if (result.success && result.data) {
        this.clients = result.data;
      } else {
        this.error = 'Error buscando clientes: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error buscando clientes: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  // === MÉTODOS DE UTILIDAD ===

  getClientsWithEmail(): number {
    return this.clients.filter(c => c.email && c.email.trim()).length;
  }

  getClientsWithPhone(): number {
    return this.clients.filter(c => c.phone && c.phone.trim()).length;
  }

  // === MÉTODOS LEGACY (mantenidos para compatibilidad) ===

  selectCustomer(customer: Customer): void {
    this.selectedCustomer = customer;
    this.modalCustomer = true;
  }

  closeModal(): void {
    this.modalCustomer = false;
    this.selectedCustomer = null;
  }

  openModal(customer?: Customer): void {
    this.customerInEdition = customer || null;
    this.isModalVisible = true;
  }

  closeModalCustomer(): void {
    this.isModalVisible = false;
    this.customerInEdition = null;
    this.changeEditionCustomer = false;
  }

  onCustomerCreated(customer: Customer): void {
    this.customers.push(customer);
    this.closeModalCustomer();
  }

  onCustomerUpdated(customer: Customer): void {
    const index = this.customers.findIndex(c => c.id === customer.id);
    if (index !== -1) {
      this.customers[index] = customer;
    }
    this.closeModalCustomer();
  }

  editCustomer(customer: Customer): void {
    this.customerInEdition = customer;
    this.changeEditionCustomer = true;
    this.isModalVisible = true;
  }

  deleteLegacyCustomer(customerId: number): void {
    if (confirm('¿Estás seguro de eliminar este cliente?')) {
      this.customerService.deleteCustomer(customerId).subscribe({
        next: () => {
          this.customers = this.customers.filter(c => c.id !== String(customerId));
        },
        error: (error) => {
          console.error('Error eliminando cliente:', error);
        }
      });
    }
  }

  searchCustomers(): void {
    if (this.searchCustomer.trim()) {
      this.customerService.searchCustomers(this.searchCustomer).subscribe(customers => {
        this.customers = customers;
      });
    } else {
      this.customerService.getCustomers().subscribe(customers => {
        this.customers = customers;
      });
    }
  }

  onResize(): void {
    this.isShrink = window.innerWidth < 768;
  }
}
