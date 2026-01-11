import { ChangeDetectionStrategy, Component, HostListener, OnInit, signal, computed, WritableSignal } from '@angular/core';
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
  styleUrl: './dashboard-customers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardCustomersComponent implements OnInit{

  customers: WritableSignal<Customer[]> = signal([]);
  searchQuery: WritableSignal<string> = signal('');

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
        this.customers.set(customers);
      });
  };

  filteredCustomers = computed(() => {
    const customers = this.customers();
    const query = this.searchQuery().trim().toLowerCase();

    if (!query) {
      return customers;
    }

    const normalize = (text: string) => this.removeAccents(text.toLowerCase());

    return customers.filter(customer => {
      // Safety check for properties that might be undefined/null
      const nombre = customer.nombre || '';
      const apellidos = customer.apellidos || '';
      const dni = customer.dni || '';
      const direccion = customer.direccion || {};
      const tipo_via = direccion.tipo_via || '';
      const dirNombre = direccion.nombre || '';
      const localidad = direccion.localidad || {};
      const locNombre = localidad.nombre || '';
      const locCP = localidad.CP ? localidad.CP.toString() : '';
      const telefono = customer.telefono || '';
      const email = customer.email || '';

      return (
        normalize(nombre).startsWith(query) ||
        normalize(apellidos).includes(query) ||
        dni.toLowerCase().startsWith(query) ||
        normalize(tipo_via.toLowerCase()).startsWith(query) ||
        normalize(dirNombre.toLowerCase()).includes(query) ||
        normalize(locNombre.toLowerCase()).startsWith(query) ||
        locCP.toLowerCase().startsWith(query) ||
        telefono.startsWith(query) ||
        email.toLowerCase().startsWith(query)
      );
    });
  });

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

  trackByCustomer(index: number, customer: Customer): string {
    return customer._id;
  }
}
