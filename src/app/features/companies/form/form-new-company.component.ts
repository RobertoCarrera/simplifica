import { Component, Input, OnInit } from '@angular/core';
import { Domain } from '../../../models/domain';
import { Locality } from '../../../models/locality';
import { Company } from '../../../models/company';
import { DomainsService } from '../../../services/domains.service';
import { LocalitiesService } from '../../../services/localities.service';
import { CompaniesService } from '../../../services/companies.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-form-new-company',
  imports: [CommonModule, FormsModule],
  templateUrl: './form-new-company.component.html',
  styleUrl: './form-new-company.component.scss'
})
export class FormNewCompanyComponent implements OnInit {

  @Input() formStep: number = 0;

  companies: Company[] = [];
  domains: Domain[] = [];
  localities: Locality[] = [];

  filteredCompanies = [...this.companies];
  filteredDomains = [...this.domains];
  filteredLocalities = [...this.localities];
  filteredCPS = [...this.localities];

  companyHasResults: boolean = false;
  localityHasResults: boolean = false;
  domainHasResults: boolean = false;
  cpHasResults: boolean = false;

  selectedCompany = '';
  selectedDNI = '';
  selectedDomain: boolean = false;

  selectedCompanyCIF: string = '';
  selectedCompanyTelephone: string = '';
  selectedCompanySurname: string = '';
  selectedCompanyEmail: string = '';
  selectedCompanyDomain: string = 'gmail.com';
  selectedCompanyName: string = '';
  selectedCompanyLocality: string = '';
  selectedCompanyAddress: string = '';
  selectedCompanyCP: string = '';

  selectedCIF = false;
  selectedName = false;
  selectedSurname = false;
  selectedEmail = false;
  selectedTelephone = false;
  selectedCP = false;
  selectedLocality = false;
  selectedAddress = false;

  constructor(private companiesService: CompaniesService,
    private localitiesService: LocalitiesService,
    private domainsService: DomainsService) { }

  ngOnInit(): void {
    this.companiesService.getCompanies().subscribe(company => {
      this.companies = company;
    });
    this.localitiesService.getLocalities().subscribe(locality => {
      this.localities = locality;
    });
    this.domainsService.getDomains().subscribe(domain => {
      this.domains = domain;
    });
  }

  clearForm() {

    this.selectedCompanyCIF = '';
    this.selectedCompanyTelephone = '';
    this.selectedCompanySurname = '';
    this.selectedCompanyEmail = '';
    this.selectedCompanyDomain = 'gmail.com';
    this.selectedCompanyName = '';
    this.selectedCompanyLocality = '';
    this.selectedCompanyAddress = '';
    this.selectedCompanyCP = '';
  }

  onSubmit() {
  }

  handleNoResultsCompany() {
  }

  selectText(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  selectCompany(company: Company) {
    this.selectedCompanyCIF = company.cif; // Muestra el nombre de la marca seleccionada en el input
    this.selectedCompanyTelephone = company.telefono;
    this.selectedCompanyEmail = company.email;
    this.selectedCompanyName = company.nombre;
    this.selectedCompanyEmail = company.email;
    // this.selectedCompanyCP= company.direccion.localidad.CP;
    // this.selectedCompanyLocality= company.direccion.localidad.nombre;
    // this.selectedCompanyAddress= company.direccion.tipo_via+' '+company.direccion.nombre+' '+company.direccion.numero;
    this.filteredCompanies = []; // Limpia la lista tras la selección
  }

  onSearchCompany(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredCompanies = this.companies.filter(company => company.cif.toLowerCase().includes(query));
      this.companyHasResults = this.filteredCompanies.length > 0;
    } else {
      this.filteredCompanies = [];
      this.companyHasResults = false;
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
      this.filteredCPS = this.localities.filter(locality => locality.CP.toString().toLowerCase().startsWith(query));
      this.cpHasResults = this.filteredCPS.length > 0;
    } else {
      this.filteredCPS = [];
      this.cpHasResults = false;
    }
  }

  selectDomain(domain: Domain) {
    this.selectedCompanyCIF = domain.nombre;
    this.filteredCompanies = [];
  }

  selectLocality(locality: Locality) {
    this.selectedCompanyLocality = locality.nombre;
    this.selectedCompanyCP = locality.CP;
    this.filteredLocalities = [];
  }

  selectCP(locality: Locality) {
    this.selectedCompanyCP = locality.CP
    this.selectedCompanyLocality = locality.nombre;
    this.filteredCPS = [];
  }
}