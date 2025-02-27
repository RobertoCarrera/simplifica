import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CustomersService } from '../../services/customers.service';
import { Customer } from '../../models/customer';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BtnNewComponent } from "../btn-new/btn-new.component";
// import { ModalProfileComponent } from '../modal-profile/modal-profile.component';
// import { NuevoCustomerModalComponent } from '../nuevo-customer-modal/nuevo-customer-modal.component';

@Component({
  selector: 'app-dashboard-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnNewComponent],
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
  creatingCustomer: boolean = false;

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

  isCreatingCustomer(){

    if(this.creatingCustomer == true)
      this.creatingCustomer = false;
    else{
      this.creatingCustomer = true;
    }
  }

  seeCustomer(customer: Customer): void {
    this.selectedCustomer = customer;
    this.showModal();
  }

  showModal() {
    this.isModalVisible = true;
  }
  
  closeModal() {
    this.isModalVisible = false;
  }
}