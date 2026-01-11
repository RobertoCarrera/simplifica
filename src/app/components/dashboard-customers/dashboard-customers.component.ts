import { ChangeDetectionStrategy, Component, HostListener, OnInit } from '@angular/core';
import { CustomersService } from '../../services/customers.service';
import { Customer } from '../../models/customer';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalCustomerComponent } from '../modal-customer/modal-customer.component';
import { BtnNewComponent } from "../btn-new/btn-new.component";

@Component({
  selector: 'app-dashboard-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnNewComponent, ModalCustomerComponent],
  templateUrl: './dashboard-customers.component.html',
  styleUrl: './dashboard-customers.component.scss'
})
export class DashboardCustomersComponent implements OnInit{

  customers: Customer[] = [];
  // Optimization: Store filtered results to avoid recalculating on every change detection cycle
  filteredCustomers: Customer[] = [];
  _searchCustomer: string = '';

  get searchCustomer(): string {
    return this._searchCustomer;
  }

  // Optimization: Update filtered list only when search term changes
  set searchCustomer(value: string) {
    this._searchCustomer = value;
    this.updateFilteredCustomers();
  }

  isShrink = false;
  modalCustomer = false;
  selectedCustomer: Customer | null = null;
  isModalVisible: boolean = false;
  customerInEdition: Customer | null = null;
  changeEditionCustomer: boolean = false;
  currentPage: number = 1;
  totalPages: number = 0;
  creatingCustomer: boolean = false;

  constructor(private customerService: CustomersService){}
  
  ngOnInit(): void {
      this.customerService.getCustomers('672275dacb317c137fb1dd1f').subscribe(customers => {
        this.customers = customers;
        this.updateFilteredCustomers();
      });
  };

  updateFilteredCustomers(): void {
    if(!this.searchCustomer.trim()){
      this.filteredCustomers = this.customers;
      return;
    }

    const searchTerm = this.searchCustomer.toLowerCase().trim();
    const normalize = (text: string) => this.removeAccents(text.toLowerCase());

    this.filteredCustomers = this.customers.filter(customer => {
      return (
        normalize(customer.nombre.toLowerCase()).startsWith(searchTerm) ||
        normalize(customer.apellidos.toLowerCase()).includes(searchTerm) ||
        customer.dni.toLowerCase().startsWith(searchTerm) ||
        normalize(customer.direccion.tipo_via.toLowerCase()).startsWith(searchTerm) ||
        normalize(customer.direccion.nombre.toLowerCase()).includes(searchTerm) ||
        normalize(customer.direccion.localidad.nombre.toLowerCase()).startsWith(searchTerm) ||
        customer.direccion.localidad.CP.toString().toLowerCase().startsWith(searchTerm) ||
        customer.telefono.startsWith(searchTerm) ||
        customer.email.toLowerCase().startsWith(searchTerm)
      );
    });
  }

  // Función para eliminar tildes
  removeAccents(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  isCreatingCustomer(){

    if(this.creatingCustomer == true)
      this.creatingCustomer = false;
    else{
      this.creatingCustomer = true;
    }
  }

  @HostListener('window:keydown', ['$event'])
  manejarAtajo(event: KeyboardEvent) {
    if (event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault(); // Evita que se abra una nueva ventana
      this.isCreatingCustomer();
    }
  }

  openCustomerModal(ticket: Customer): void{
    this.selectedCustomer = ticket;
  }

  closeCustomerModal(): void{
    this.selectedCustomer = null;
  }

  // Optimization: Use trackBy to prevent unnecessary DOM re-renders when list reference changes but items are same
  trackByCustomer(index: number, customer: Customer): string {
    return customer._id;
  }
}
