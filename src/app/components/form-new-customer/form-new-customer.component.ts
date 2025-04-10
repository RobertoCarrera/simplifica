import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
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

  customers: Customer[] = [];
  domains: Domain[] = [];
  localities: Locality[] = [];
  addresses: Address[] = [];
  vias: string[] = ['Calle', 'Avenida', 'Plaza', 'Paseo', 'Camino', 'Carretera', 'Autovía', 'Autopista', 'Travesía', 'Barrio', 'Ronda', 'Pasaje', 'Paseo Marítimo'];  

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
  searchValid: boolean = true;
  
  selectedCustomerDNI: string = '';
  selectedCustomerTelephone: string = '';
  selectedCustomerSurname: string = '';
  selectedCustomerEmail: string = '';
  selectedCustomerDomain: string = 'gmail.com';
  selectedCustomerName: string = '';
  selectedCustomerLocality: string = '';
  selectedCustomerAddressRoadType: string = '';
  selectedCustomerAddressName: string = '';
  selectedCustomerAddressNumber: number = 1;
  selectedCustomerCP: string = '';
  viaSearch: string = ''; // Texto de búsqueda

  selectedCustomer: boolean = false;
  selectedDNI: boolean = false;
  selectedCIF: boolean = false;
  selectedName: boolean = false;
  selectedSurname: boolean = false;
  selectedEmail: boolean = false;
  selectedTelephone: boolean = false;
  selectedCP: boolean = false;
  selectedLocality: boolean = false;
  selectedAddressRoadType: boolean = false;
  selectedAddressName: boolean = false;
  selectedAddressNumber: boolean = false;

  constructor(private customersService: CustomersService,
    private localitiesService: LocalitiesService,
    private domainsService: DomainsService){}

  ngOnInit(): void {
    this.customersService.getCustomers().subscribe(customer => {
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
    this.selectedCustomerAddressNumber = 1;
    this.selectedCustomerCP = '';
  
    this.filteredCustomers = [];
    this.filteredCustomersByDNI = [];
    this.filteredCustomersByName = [];
    this.filteredCustomersByTelephone = [];
    this.filteredDomains = [];
    this.filteredLocalities = [];
    this.filteredCPS = [];
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
    this.selectedCustomerDNI = cliente.dni; // Muestra el nombre de la marca seleccionada en el input
    this.selectedCustomerTelephone = cliente.telefono;
    this.selectedCustomerSurname= cliente.apellidos;
    this.selectedCustomerEmail= cliente.email;
    this.selectedCustomerName= cliente.nombre;
    this.selectedCustomerEmail= cliente.email;
    this.selectedCustomerCP= cliente.direccion.localidad.CP;
    this.selectedCustomerLocality= cliente.direccion.localidad.nombre;
    this.selectedCustomerAddressRoadType = cliente.direccion.tipo_via;
    this.selectedCustomerAddressName = cliente.direccion.nombre;
    this.selectedCustomerAddressNumber = cliente.direccion.numero;
    this.filteredCustomers = []; // Limpia la lista tras la selección
    this.filteredCustomersByDNI = []; // Limpia la lista tras la selección
    this.filteredCustomersByName = []; // Limpia la lista tras la selección
    this.filteredCustomersByTelephone = []; // Limpia la lista tras la selección
  }

  onSearchCustomerDNI(event: any) {
    const dni = event.target.value;
    if (!dni) {
      this.searchValid = false; // Detener búsquedas si el DNI está vacío
      return;
    }
  
    // Simula la búsqueda de clientes por DNI
    this.filteredCustomersByDNI = this.customers.filter(customer => 
      customer.dni.startsWith(dni));
  
    if (this.filteredCustomersByDNI.length === 0) {
      this.searchValid = false; // Detener búsquedas si no hay resultados
    } else {
      this.searchValid = true; // Continuar búsquedas si hay resultados
    }
  }
  
  onSearchCustomerName(event: any) {
    if (!this.searchValid) return; // Detener si las búsquedas ya no son válidas
  
    const name = event.target.value;
    if (!name) {
      this.searchValid = false; // Detener búsquedas si el nombre está vacío
      return;
    }
  
    // Simula la búsqueda de clientes por nombre
    this.filteredCustomersByName = this.customers.filter(customer => 
      customer.nombre.includes(name) || 
      customer.apellidos.includes(name));
  
    if (this.filteredCustomersByName.length === 0) {
      this.searchValid = false; // Detener búsquedas si no hay resultados
    }
  }

  filterVias() {
    const search = this.viaSearch.toLowerCase();
    this.filteredVias = this.vias.filter(via => via.toLowerCase().includes(search));
  } 
  
  onSearchCustomerTelephone(event: any) {
    if (!this.searchValid) return; // Detener si las búsquedas ya no son válidas
  
    const telephone = event.target.value;
    if (!telephone) {
      this.searchValid = false; // Detener búsquedas si los apellidos están vacíos
      return;
    }
  
    // Simula la búsqueda de clientes por apellidos
    this.filteredCustomersByTelephone = this.customers.filter(customer => 
      customer.telefono.startsWith(telephone));
  
    if (this.filteredCustomersByTelephone.length === 0) {
      this.searchValid = false; // Detener búsquedas si no hay resultados
    }
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
}