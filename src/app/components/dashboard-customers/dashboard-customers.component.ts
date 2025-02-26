import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CustomersService } from '../../services/customers.service';
import { Customer } from '../../models/customer';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// import { ModalProfileComponent } from '../modal-profile/modal-profile.component';
// import { NuevoCustomerModalComponent } from '../nuevo-customer-modal/nuevo-customer-modal.component';

@Component({
  selector: 'app-dashboard-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-customers.component.html',
  styleUrl: './dashboard-customers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardCustomersComponent implements OnInit{

  customers: Customer[] = [];
  searchCustomer: string = '';
  isShrink = false;
  modalCustomer = false;
  selectedCustomer: Customer = {} as Customer;
  isModalVisible: boolean = false;
  customerInEdition: Customer | null = null;
  changeEditionCustomer: boolean = false;
  currentPage: number = 1;
  totalPages: number = 0;

  constructor(private customerService: CustomersService){}
  
  ngOnInit(): void {
      this.customerService.getCustomers().subscribe(customers => {
        this.customers = customers;
      });
  };

  filterCustomers(): Customer[]{
    if(!this.searchCustomer.trim()){
      return this.customers;
    }

    const searchTerm = this.searchCustomer.toLowerCase().trim();

    const filtered = this.customers.filter(customer => {
      return (
        customer.nombre.toLowerCase().includes(searchTerm) ||
        customer.apellidos.toLowerCase().includes(searchTerm) ||
        customer.direccion.nombre.toLowerCase().includes(searchTerm) ||
        customer.telefono.includes(searchTerm) ||
        customer.email.toLowerCase().includes(searchTerm)
      );
    });
    return filtered;
  }

  seeCustomer(customer: Customer): void {
    this.selectedCustomer = customer;
    this.showModal();
  }

  editingCustomer(customer: Customer){
    this.customerInEdition = customer;
    this.changeEditionCustomer = true;
  }

  isEditingCustomer(customer: Customer): boolean{
    return this.customerInEdition === customer;
  }

  sendEdition(customer: Customer, nombre: HTMLElement, apellidos: HTMLElement, direccion: HTMLElement, telefono: HTMLElement, email: HTMLElement) {
    
    const customerUpdated: Customer = {
      ...customer,
      nombre: nombre.innerText,
      apellidos: apellidos.innerText,
      telefono: telefono.innerText,
      email: email.innerText
    };

    if (this.customerInEdition) {
      this.customerService.updateCustomer(customer._id, customerUpdated).subscribe(
        response => {
          console.log('Cliente actualizado', response);
          this.cancelEdition();
          this.customerService.getCustomers().subscribe(customers => {
            this.customers = customers;
          });
        },
        error => {
          console.error('Error actualizando customer', error);
        }
      );
    }
  }

  cancelEdition(){
    this.customerInEdition = null;
    this.changeEditionCustomer = false;
  }

  removeCustomer(customer: Customer){

    if(confirm(`¿Estás seguro de que deseas eliminar a ${customer.nombre+' '+customer.apellidos}?`)){
      this.customerService.deleteCustomer(customer._id).subscribe(() => {
        this.customers = this.customers.filter(c => c._id !== customer._id);
        alert('Customer eliminado exitosamente');
      }, error => {
        alert('Error al eliminar a '+customer.nombre+' '+customer.apellidos);
      });
    }
  }

  showModal() {
    this.isModalVisible = true;
  }
  
  closeModal() {
    this.isModalVisible = false;
  }
}