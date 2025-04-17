import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Locality } from '../../models/locality';
import { Customer } from '../../models/customer';
import { Domain } from '../../models/domain';
import { CustomersService } from '../../services/customers.service';
import { LocalitiesService } from '../../services/localities.service';
import { DomainsService } from '../../services/domains.service';
import { Address } from '../../models/address';

@Component({
  selector: 'app-form-new-customer',
  imports: [CommonModule, FormsModule],
  templateUrl: './form-new-customer.component.html',
  styleUrl: './form-new-customer.component.scss'
})
export class FormNewCustomerComponent  implements OnInit{

  @Input() formStep: number = 0;
  @Output() customerFound = new EventEmitter<boolean>();
  @Output() customerSelectedEvent = new EventEmitter<Customer>();

  customers: Customer[] = [];
  domains: Domain[] = [];
  localities: Locality[] = [];
  addresses: Address[] = [];
  vias: string[] = ['Calle', 'Avenida', 'Plaza', 'Paseo', 'Camino', 'Carretera', 'Autovía', 'Autopista', 'Travesía', 'Barrio', 'Ronda', 'Pasaje', 'Paseo Marítimo'];  
  selectedCustomer: Customer | null = null;

  filteredCustomers = [...this.customers];
  filteredCustomersByDNI: Customer[] = [];
  filteredCustomersByName: Customer[] = [];
  filteredCustomersByTelephone: Customer[] = [];

  filteredDomains = [...this.domains];
  filteredLocalities = [...this.localities];
  filteredCPS = [...this.localities];
  filteredVias: string[] = [...this.vias];

  localityHasResults: boolean = false;
  domainHasResults: boolean = false;
  cpHasResults: boolean = false;
  searchValidDNI: boolean = true;
  searchValidName: boolean = true;
  searchValidTelephone: boolean = true;
  customerFoundChanged: boolean = false;
  
  selectedCustomerDNI: string = '';
  selectedCustomerTelephone: string = '';
  selectedCustomerSurname: string = '';
  selectedCustomerEmail: string = '';
  selectedCustomerDomain: string = 'gmail.com';
  selectedCustomerName: string = '';
  selectedCustomerLocality: string = '';
  selectedCustomerAddressRoadType: string = '';
  selectedCustomerAddressName: string = '';
  selectedCustomerAddressNumber: string = '';
  selectedCustomerCP: string = '';
  viaSearch: string = ''; // Texto de búsqueda

  selectedCP: boolean = false;
  selectedLocality: boolean = false;
  selectedAddressRoadType: boolean = false;
  selectedAddressName: boolean = false;
  selectedAddressNumber: boolean = false;

  constructor(private customersService: CustomersService,
    private localitiesService: LocalitiesService,
    private domainsService: DomainsService){}

  ngOnInit(): void {
    this.customersService.getCustomers('672275dacb317c137fb1dd1f').subscribe(customer => {
      this.customers = customer;
    });
    this.localitiesService.getLocalities().subscribe(locality => {
      this.localities = locality;
    });
    this.domainsService.getDomains().subscribe(domain => {
      this.domains = domain;
    });
  }

  clearForm(){
    this.selectedCustomerDNI = '';
    this.selectedCustomerTelephone = '';
    this.selectedCustomerSurname = '';
    this.selectedCustomerEmail = '';
    this.selectedCustomerDomain = 'gmail.com';
    this.selectedCustomerName = '';
    this.selectedCustomerLocality = '';
    this.selectedCustomerAddressRoadType = '';
    this.selectedCustomerAddressName = '';
    this.selectedCustomerAddressNumber = '';
    this.selectedCustomerCP = '';
  
    this.filteredCustomers = [];
    this.filteredCustomersByDNI = [];
    this.filteredCustomersByName = [];
    this.filteredCustomersByTelephone = [];
    this.filteredDomains = [];
    this.filteredLocalities = [];
    this.filteredCPS = [];

    this.customerFoundChanged = false;
    this.checkCustomerFound();
    this.selectedCustomer = null; // Limpiamos el cliente seleccionado
  }

  onSubmit() {
  }

  handleNoResultsCustomer() {
  }

  selectText(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  selectCustomer(cliente: Customer) {

    if(this.searchValidDNI || this.searchValidName || this.searchValidTelephone) {
      this.selectedCustomerDNI = cliente.dni; // Muestra el nombre de la marca seleccionada en el input
      this.selectedCustomerTelephone = cliente.telefono;
      this.selectedCustomerName= cliente.nombre +" "+ cliente.apellidos;
      this.customerFoundChanged = true;
      this.checkCustomerFound();
      this.filteredCustomersByDNI = []; // Limpia la lista tras la selección
      this.filteredCustomersByName = []; // Limpia la lista tras la selección
      this.filteredCustomersByTelephone = []; // Limpia la lista tras la selección
      this.selectedCustomer = cliente; // Guardamos el cliente seleccionado
      this.selectedCustomer = cliente; // Guardamos el cliente seleccionado
      console.log('Cliente seleccionado en el hijo:', cliente);      
      this.customerSelectedEvent.emit(this.selectedCustomer); // Emitimos el cliente seleccionado al padre
    }else{
      this.selectedCustomerDNI = cliente.dni; // Muestra el nombre de la marca seleccionada en el input
      this.selectedCustomerTelephone = cliente.telefono;
      this.selectedCustomerEmail= cliente.email;
      this.selectedCustomerName= cliente.nombre +" "+ cliente.apellidos;
      this.selectedCustomerEmail= cliente.email;
      this.selectedCustomerCP= cliente.direccion.localidad.CP;
      this.selectedCustomerLocality= cliente.direccion.localidad.nombre;
      this.selectedCustomerAddressRoadType = cliente.direccion.tipo_via;
      this.selectedCustomerAddressName = cliente.direccion.nombre;
      this.selectedCustomerAddressNumber = cliente.direccion.numero;
      this.filteredCustomersByDNI = []; // Limpia la lista tras la selección
      this.filteredCustomersByName = []; // Limpia la lista tras la selección
      this.filteredCustomersByTelephone = []; // Limpia la lista tras la selección
    }
  }

  onSearchCustomerDNI(event: any) {

    const dni = event.target.value.trim();

    this.searchValidName = false;
    this.searchValidDNI = false;
    this.searchValidTelephone = false;

    if (!dni) {
      this.filteredCustomersByDNI = [];
      this.searchValidName = true;
      this.searchValidDNI = true;
      this.searchValidTelephone = true;
      this.customerFoundChanged = false;
      this.checkCustomerFound();
      return;
    }

    this.filteredCustomersByDNI = this.customers.filter(customer =>
      customer.dni.startsWith(dni)
    );
    
    this.searchValidDNI = this.filteredCustomersByDNI.length > 0;
  }
  
  onSearchCustomerName(event: any): void {

    const name = event.target.value.trim();
    const normalize = (text: string) => this.removeAccents(text.toLowerCase());

    this.searchValidName = false;
    this.searchValidDNI = false;
    this.searchValidTelephone = false;

    if (!name) {
      this.filteredCustomersByName = [];
      this.searchValidName = true;
      this.searchValidDNI = true;
      this.searchValidTelephone = true;
      this.customerFoundChanged = false;
      this.checkCustomerFound();
      return;
    }

    this.filteredCustomersByName = this.customers.filter(customer => 
        normalize(customer.nombre).startsWith(name) || 
        normalize(customer.apellidos).includes(name));

    this.searchValidName = this.filteredCustomersByName.length > 0;
  }
  
  onSearchCustomerTelephone(event: any) {

    const telephone = event.target.value.trim();

    this.searchValidName = false;
    this.searchValidDNI = false;
    this.searchValidTelephone = false;

    if (!telephone) {
      this.filteredCustomersByTelephone = [];
      this.searchValidName = true;
      this.searchValidDNI = true;
      this.searchValidTelephone = true;
      this.customerFoundChanged = false;
      this.checkCustomerFound();
      return;
    }

    this.filteredCustomersByTelephone = this.customers.filter(customer =>
      customer.telefono.startsWith(telephone)
    );
    
    this.searchValidTelephone = this.filteredCustomersByTelephone.length > 0;
  }

  filterVias() {
    const search = this.viaSearch.toLowerCase();
    this.filteredVias = this.vias.filter(via => via.toLowerCase().includes(search));
  } 

  onSearchDomain(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredDomains = this.domains.filter(domain => 
        domain.nombre.toLowerCase().startsWith(query));
      this.domainHasResults = this.filteredDomains.length > 0;
    } else {
      this.filteredDomains = [];
      this.domainHasResults = false;
    }
  }

  onSearchLocality(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredLocalities = this.localities.filter(locality => locality.nombre.toLowerCase().startsWith(query));
      this.localityHasResults = this.filteredLocalities.length > 0;
    } else {
      this.filteredLocalities = [];
      this.localityHasResults = false;
    }
  }

  onSearchCP(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredCPS= this.localities.filter(locality => locality.CP.toString().toLowerCase().startsWith(query));
      this.cpHasResults = this.filteredCPS.length > 0;
    } else {
      this.filteredCPS = [];
      this.cpHasResults = false;
    }
  }

  selectDomain(domain: Domain) {
    this.selectedCustomerDomain = domain.nombre;
    this.filteredDomains = [];
  }

  selectLocality(locality: Locality) {
    this.selectedCustomerLocality = locality.nombre;
    this.selectedCustomerCP = locality.CP;
    this.filteredLocalities = [];
  }

  selectCP(locality: Locality) {
    this.selectedCustomerCP = locality.CP
    this.selectedCustomerLocality = locality.nombre;
    this.filteredCPS = [];
  }

  // Función para eliminar tildes
  removeAccents(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  checkCustomerFound() {
    this.customerFound.emit(this.customerFoundChanged); // Emitimos el nuevo valor
  }
}