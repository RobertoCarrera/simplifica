import { Component, HostListener, OnInit } from '@angular/core';
import { Service } from '../../models/service';
import { ServicesService } from '../../services/services.service';
import { BtnNewComponent } from '../btn-new/btn-new.component';
import { Category } from '../../models/category';
import { Customer } from '../../models/customer';
import { Domain } from '../../models/domain';
import { Locality } from '../../models/locality';
import { Address } from '../../models/address';
import { DomainsService } from '../../services/domains.service';
import { LocalitiesService } from '../../services/localities.service';
import { CustomersService } from '../../services/customers.service';
import { CategoriesService } from '../../services/categories.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard-workshop',
  imports: [BtnNewComponent, FormsModule, CommonModule],
  templateUrl: './dashboard-workshop.component.html',
  styleUrl: './dashboard-workshop.component.scss'
})
export class DashboardWorkshopComponent implements OnInit{

  services: Service[] = [];
  categories: Category[] = [];
  customers: Customer[] = [];
  domains: Domain[] = [];
  localities: Locality[] = [];

  searchService: string = '';
  creatingService: boolean = false;
  customerHasResults: boolean = false;
  categoryHasResults: boolean = false;
  domainHasResults: boolean = false;
  cpHasResults: boolean = false;
  localityHasResults: boolean = false;

  filteredCategories = [...this.categories];
  filteredCustomers = [...this.customers];
  filteredDomains = [...this.domains];
  filteredLocalities = [...this.localities];
  filteredCPS = [...this.localities];

  selectedCategory = '';
  selectedCustomer = '';
  selectedDNI = '';
  selectedDomain: boolean = false;
  searchDNI: string = '';
  categoryDuplicated = false;
  formStep: number = 1;
  servicePerson: boolean = false;
  serviceEmpresa: boolean = false;

  selectedCustomerDNI: string = '';
  selectedCustomerTelefono: string = '';
  selectedCustomerApellidos: string = '';
  selectedCustomerEmail: string = '';
  selectedCustomerDomain: string = 'gmail.com';
  selectedCustomerNombre: string = '';
  selectedCustomerLocality: string = '';
  selectedCustomerAddress: string = '';
  selectedCustomerCP: string = '';
  
  selectedCIF = false;
  selectedNombre = false;
  selectedApellidos = false;
  selectedEmail = false;
  selectedTelefono = false;
  selectedCP = false;
  selectedLocality = false;
  selectedAddress = false;
  selectedTipoService = false;

  selectedVencimiento = false;
  selected2Category = false;
  selectedCPU = false;
  selectedRAM = false;
  selectedMarca = false;
  selectedModelo = false;
  selectedHDD = false;
  selectedSSD = false;
  selectedPulgadas = false;
  selectedGrafica = false;
  selectedPeso = false;
  selectedSO = false;

  newCategory = {
    _id: '',
    created_at: new Date,
    nombre: '',
  };

  newCustomer: Customer = {
    _id: '',
    id: '',
    created_at: new Date(),
    name: '',
    nombre: '',
    apellidos: '',
    dni: '',
    direccion_id: '',
    phone: '',
    telefono: '',
    email: '',
    favicon: null,
    usuario_id: '',
    client_type: 'individual'
  };

  constructor(private servicesService: ServicesService,
    private categoriesService: CategoriesService,
    private customersService: CustomersService,
    private domainsService: DomainsService,
    private localitiesService: LocalitiesService){}

  ngOnInit(): void {
    this.servicesService.getServices().subscribe(service => {
      this.services = service;
    });
    this.categoriesService.getCategories().subscribe(category => {
      this.categories = category;
    });
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

  selectText(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  // filterDNI(): Customer[]{
  //   if(!this.searchDNI.trim()){
  //     return this.customers;
  //   }

  //   const searchTerm = this.searchDNI.toLowerCase().trim();

  //   const filtered = this.customers.filter(customer => {
  //     return (
  //       customer.dni.toLowerCase().startsWith(searchTerm) ||
  //       customer.telefono.startsWith(searchTerm) ||
  //       customer.apellidos.toLowerCase().startsWith(searchTerm) ||
  //       customer.email.toLowerCase().includes(searchTerm)||
  //       customer.nombre.toLowerCase().startsWith(searchTerm)
  //     );
  //   });
  //   return filtered;
  // }

  selectCustomer(customer: Customer) {
    this.selectedCustomerDNI = customer.dni; // Muestra el nombre de la marca seleccionada en el input
  this.selectedCustomerTelefono = customer.telefono ?? '';
    this.selectedCustomerApellidos= customer.apellidos;
    this.selectedCustomerEmail= customer.email;
  this.selectedCustomerNombre= customer.nombre ?? '';
    this.selectedCustomerEmail= customer.email;
    this.selectedCustomerCP = customer.direccion?.localidad?.CP || '';
    this.selectedCustomerLocality = customer.direccion?.localidad?.nombre || '';
    this.selectedCustomerAddress= customer.direccion?.tipo_via+' '+customer.direccion?.nombre+' '+customer.direccion?.numero;
    this.filteredCustomers = []; // Limpia la lista tras la selección
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

  cancelarPasoFormulario(){
    if(this.formStep === 2){
      this.reiniciarPasoFormulario();
      this.isCreandoService();
      this.elegirService('cancelar');
    }else{
      this.anteriorPasoFormulario();
    }
  }

  siguientePasoFormulario(){
    if(this.formStep < 4){
      this.formStep++;
    }else{
      if(this.formStep === 4){
        this.onSubmit();
      }
    }
  }

  elegirService(tipoService: string){
    switch(tipoService){
      case 'empresa':
        this.serviceEmpresa = true;
        this.siguientePasoFormulario();
        break;
      case 'persona':
        this.servicePerson = true;
        this.siguientePasoFormulario();
        break;
      case 'cancelar':
        this.serviceEmpresa = false;
        this.servicePerson = false;
        this.selectedCategory = '';
        this.selectedCustomer = '';
        this.selectedDNI = '';
        this.selectedDomain = false;
        this.searchDNI = '';
        this.categoryDuplicated = false;
        this.formStep = 1;
        this.servicePerson = false;
        this.serviceEmpresa = false;
      
        this.selectedCustomerDNI = '';
        this.selectedCustomerTelefono = '';
        this.selectedCustomerApellidos = '';
        this.selectedCustomerEmail = '';
        this.selectedCustomerDomain = 'gmail.com';
        this.selectedCustomerNombre = '';
        this.selectedCustomerLocality = '';
        this.selectedCustomerAddress = '';
        this.selectedCustomerCP = '';
        
        this.selectedCIF = false;
        this.selectedNombre = false;
        this.selectedApellidos = false;
        this.selectedEmail = false;
        this.selectedTelefono = false;
        this.selectedCP = false;
        this.selectedLocality = false;
        this.selectedAddress = false;
      
        this. selectedVencimiento = false;
        this.selected2Category = false;
        this.selectedCPU = false;
        this.selectedRAM = false;
        this.selectedMarca = false;
        this.selectedModelo = false;
        this.selectedHDD = false;
        this.selectedSSD = false;
        this.selectedPulgadas = false;
        this.selectedGrafica = false;
        this.selectedPeso = false;
        this. selectedSO = false;
        break;
      default:
        alert("Error en la elección");
        break;
    }
  }
  
  anteriorPasoFormulario(){
    this.formStep--;
  }

  reiniciarPasoFormulario(){
    this.formStep = 1;
  }

  onSubmit() {
    if (this.isCategoryDuplicated(this.newCategory.nombre)){
      console.log('Category duplicado.');
    } else {
      this.createOrUpdateCategory();
      if (this.newCategory.nombre && this.selectedCategory) {
        // Aquí puedes proceder a añadir el material, marca y tienda
        console.log('Formulario válido, se puede proceder a guardar el material.');
        this.resetForm(); // Llamar al reset cuando cierras el modal
      } else {
        // Aquí puedes manejar la lógica cuando el formulario no es válido
        console.log('Formulario incompleto, asegúrate de llenar todos los campos obligatorios.');
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  manejarAtajo(event: KeyboardEvent) {
    if (event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault(); // Evita que se abra una nueva ventana
      this.isCreandoService();
    }
  }
  
  resetForm() {
    this.newCategory = {
      _id: '',
      created_at: new Date,
      nombre: '',
    };
    this.selectedCategory = '';
    this.filteredCategories = [];
  }

  // filterServices(): Service[]{
  //   if(!this.searchService.trim()){
  //     return this.services;
  //   }

  //   const searchTerm = this.removeAccents(this.searchService.toLowerCase().trim());

  //   return this.services.filter(service => {

  //     const opcionesMes: Intl.DateTimeFormatOptions = { month: "long" };// Para obtener el nombre del mes en español
  //     const normalize = (text: string) => this.removeAccents(text.toLowerCase());

  //     // Convertir la fecha a formatos buscables
  //     const fechaVencimiento = new Date(service.fecha_vencimiento);
  //     // Extraer datos de fecha de vencimiento
  //     const diaVencimiento = fechaVencimiento.getDate().toString();
  //     const mesNumVencimiento = (fechaVencimiento.getMonth() + 1).toString().padStart(2, '0');
  //     const mesNombreVencimiento = fechaVencimiento.toLocaleDateString('es-ES', opcionesMes);
  //     const añoVencimiento = fechaVencimiento.getFullYear().toString();
  
  //     // Convertir la fecha a formatos buscables
  //     const fechaCreacion = new Date(service.created_at);
  //     // Extraer datos de fecha de creación
  //     const diaCreacion = fechaCreacion.getDate().toString();
  //     const mesNumCreacion = (fechaCreacion.getMonth() + 1).toString().padStart(2, '0');
  //     const mesNombreCreacion = fechaCreacion.toLocaleDateString('es-ES', opcionesMes);
  //     const añoCreacion = fechaCreacion.getFullYear().toString();
  
  //     // Formatos buscables de fecha de vencimiento
  //     const fechaVencimientoFormateada1 = `${diaVencimiento}/${mesNumVencimiento}/${añoVencimiento}`;
  //     const fechaVencimientoFormateada2 = `${mesNombreVencimiento} ${diaVencimiento}, ${añoVencimiento}`;
  //     const fechaVencimientoFormateada3 = `${diaVencimiento} ${mesNombreVencimiento} ${añoVencimiento}`;
  
  //     // Formatos buscables de fecha de creación
  //     const fechaCreacionFormateada1 = `${diaCreacion}/${mesNumCreacion}/${añoCreacion}`;
  //     const fechaCreacionFormateada2 = `${mesNombreCreacion} ${diaCreacion}, ${añoCreacion}`;
  //     const fechaCreacionFormateada3 = `${diaCreacion} ${mesNombreCreacion} ${añoCreacion}`;

  //     return  (
  //       normalize(service.created_at.toString()).startsWith(searchTerm) ||
  //       normalize(service.contador.toString()).startsWith(searchTerm) ||
  //       normalize(service.cliente.dni.toLowerCase()).startsWith(searchTerm) ||
  //       normalize(service.cliente.nombre.toLowerCase()).startsWith(searchTerm) ||
  //       normalize(service.cliente.apellidos.toLowerCase()).includes(searchTerm) ||
  //       normalize(service.fecha_vencimiento.toString()).startsWith(searchTerm) ||
  //       normalize(service.estado.toString()).includes(searchTerm) || 
  //       (service.servicios?.some(servicio => normalize(servicio.nombre).includes(searchTerm)) ?? false) ||
  //       // Filtrar por fecha de vencimiento
  //       normalize(fechaVencimientoFormateada1).includes(searchTerm) ||
  //       normalize(fechaVencimientoFormateada2).toLowerCase().includes(searchTerm) ||
  //       normalize(fechaVencimientoFormateada3).toLowerCase().includes(searchTerm) ||
  //       // Filtrar por fecha de creación
  //       normalize(fechaCreacionFormateada1).includes(searchTerm) ||
  //       normalize(fechaCreacionFormateada2).toLowerCase().includes(searchTerm) ||
  //       normalize(fechaCreacionFormateada3).toLowerCase().includes(searchTerm)
  //     );
  //   });
  // }

  createOrUpdateCategory() {
    if (this.newCategory.nombre) {
      this.addCategory(this.newCategory);
    }
  }

  addCategory(category: Category) {
    // Lógica para hacer POST de marca
  }

  selectCategory(category: any) {
    this.newCategory.nombre = category._id;
    this.selectedCategory = category.nombre; // Muestra el nombre de la marca seleccionada en el input
    this.filteredCategories = []; // Limpia la lista tras la selección
  }

  isCreandoService(){

    if(this.creatingService == true)
      this.creatingService = false;
    else{
      this.creatingService = true;
    }
  }

  onSearchCategory(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredCategories = this.categories.filter(category => category.nombre.toLowerCase().includes(query));
      this.categoryHasResults = this.filteredCategories.length > 0;
    } else {
      this.filteredCategories = [];
      this.categoryHasResults = false;
    }
  }

  isCategoryDuplicated(nombre: string): boolean {
    if (!nombre) {
      return false; // Si el nombre actual es vacío, no hacer chequeo
    }
    return this.categories.some(category => category.nombre.toLowerCase() === nombre.toLowerCase());
    this.categoryDuplicated = true;
  }

  // Función para eliminar tildes
  removeAccents(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  handleNoResultsCategory() {
    // Aquí puedes añadir la lógica para crear una nueva category
    console.log('No hay resultados, crear nueva category: ');
  }

  handleNoResultsCustomer() {
  }
}