import { Component, Input, OnInit } from '@angular/core';
import { Domain } from '../../models/domain';
import { Locality } from '../../models/locality';
import { Customer } from '../../models/customer';
import { DomainsService } from '../../services/domains.service';
import { LocalitiesService } from '../../services/localities.service';
import { CustomersService } from '../../services/customers.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-form-new-company',
  imports: [CommonModule, FormsModule],
  templateUrl: './form-new-company.component.html',
  styleUrl: './form-new-company.component.scss'
})
export class FormNewCompanyComponent  implements OnInit{

  @Input() formStep: number = 0;  
  @Input() creatingPerson: boolean = false;
  @Input() creatingCompany: boolean = false;

  customers: Customer[] = [];
  domains: Domain[] = [];
  localities: Locality[] = [];
  
  filteredCustomers = [...this.customers];
  filteredDomains = [...this.domains];
  filteredLocalities = [...this.localities];
  filteredCPS = [...this.localities];

  customerHasResults: boolean = false;
  localityHasResults: boolean = false;
  domainHasResults: boolean = false;
  cpHasResults: boolean = false;

  selectedCustomer = '';
  selectedDNI = '';
  selectedDomain: boolean = false;
  
  selectedCustomerDNI: string = '';
  selectedCustomerTelephone: string = '';
  selectedCustomerSurname: string = '';
  selectedCustomerEmail: string = '';
  selectedCustomerDomain: string = 'gmail.com';
  selectedCustomerName: string = '';
  selectedCustomerLocality: string = '';
  selectedCustomerAddress: string = '';
  selectedCustomerCP: string = '';

  selectedCIF = false;
  selectedName = false;
  selectedSurname = false;
  selectedEmail = false;
  selectedTelephone = false;
  selectedCP = false;
  selectedLocality = false;
  selectedAddress = false;

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
    this.selectedCustomerAddress = '';
    this.selectedCustomerCP = '';
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
    this.selectedCustomerAddress= cliente.direccion.tipo_via+' '+cliente.direccion.nombre+' '+cliente.direccion.numero;
    this.filteredCustomers = []; // Limpia la lista tras la selección
  }

  onSearchCustomer(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredCustomers = this.customers.filter(customer => customer.dni.toLowerCase().includes(query));
      this.customerHasResults = this.filteredCustomers.length > 0;
    } else {
      this.filteredCustomers = [];
      this.customerHasResults = false;
    }
  }

  onSearchDomain(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredDomains = this.domains.filter(domain => domain.nombre.toLowerCase().startsWith(query));
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
    this.selectedCustomerDNI = domain.nombre;
    this.filteredCustomers = [];
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