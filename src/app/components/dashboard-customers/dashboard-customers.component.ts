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

  clients: Customer[] = [];
  searchCustomer: string = '';
  isShrink = false;
  modalCustomer = false;
  clientSeleccionado: Customer = {} as Customer;
  isModalVisible: boolean = false;
  customerEnEdicion: Customer | null = null;
  cambioEdicionCustomer: boolean = false;
  currentPage: number = 1;
  totalPages: number = 0;

  constructor(private clientService: CustomersService){}
  
  ngOnInit(): void {
      this.clientService.getCustomers().subscribe(clients => {
        this.clients = clients;
      });
  };

  filterCustomers(): Customer[]{
    if(!this.searchCustomer.trim()){
      return this.clients;
    }

    const searchTerm = this.searchCustomer.toLowerCase().trim();

    const filtered = this.clients.filter(client => {
      return (
        client.nombre.toLowerCase().includes(searchTerm) ||
        client.apellidos.toLowerCase().includes(searchTerm) ||
        client.direccion.nombre.toLowerCase().includes(searchTerm) ||
        client.telefono.includes(searchTerm) ||
        client.email.toLowerCase().includes(searchTerm)
      );
    });
    return filtered;
  }

  verCustomer(customer: Customer): void {
    this.clientSeleccionado = customer;
    this.showModal();
  }

  editandoCustomer(customer: Customer){
    this.customerEnEdicion = customer;
    this.cambioEdicionCustomer = true;
  }

  isEditandoCustomer(customer: Customer): boolean{
    return this.customerEnEdicion === customer;
  }

  enviarEdicion(client: Customer, nombre: HTMLElement, apellidos: HTMLElement, direccion: HTMLElement, telefono: HTMLElement, email: HTMLElement) {
    
    const customerActualizado: Customer = {
      ...client,
      nombre: nombre.innerText,
      apellidos: apellidos.innerText,
      telefono: telefono.innerText,
      email: email.innerText
    };

    if (this.customerEnEdicion) {
      this.clientService.updateCustomer(client._id, customerActualizado).subscribe(
        response => {
          console.log('Customer actualizado', response);
          this.cancelarEdicion();
          this.clientService.getCustomers().subscribe(clients => {
            this.clients = clients;
          });
        },
        error => {
          console.error('Error actualizando customer', error);
        }
      );
    }
  }

  cancelarEdicion(){
    this.customerEnEdicion = null;
    this.cambioEdicionCustomer = false;
  }

  eliminarCustomer(client: Customer){

    if(confirm(`¿Estás seguro de que deseas eliminar a ${client.nombre+' '+client.apellidos}?`)){
      this.clientService.deleteCustomer(client._id).subscribe(() => {
        this.clients = this.clients.filter(c => c._id !== client._id);
        alert('Customer eliminado exitosamente');
      }, error => {
        alert('Error al eliminar a '+client.nombre+' '+client.apellidos);
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