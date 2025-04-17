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
import { AddressesService } from '../../services/addresses.service';

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
  filteredCustomers: Customer[] = [];;
  filteredLocalities: Locality[] = [];
  filteredCPS: Locality[] = [];

  filteredCustomersByDNI: Customer[] = [];
  filteredCustomersByName: Customer[] = [];
  filteredCustomersByTelephone: Customer[] = [];

  filteredDomains: Domain[] = [];
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
  selectedCustomerLocality: Locality = {} as Locality;
  selectedCustomerLocalityName: string = '';
  selectedCustomerLocalityRegion: string = '';
  selectedCustomerLocalityProvince: string = '';
  selectedCustomerLocalityCP: string = '';
  selectedCustomerAddressRoadType: string = '';
  selectedCustomerAddressName: string = '';
  selectedCustomerAddressNumber: string = '';
  selectedCustomerCP: string = '';
  viaSearch: string = ''; // Texto de búsqueda
  selectedCustomerUsuario_id: string = '672275dacb317c137fb1dd1f';

  selectedCP: boolean = false;
  selectedLocality: boolean = false;
  selectedAddressRoadType: boolean = false;
  selectedAddressName: boolean = false;
  selectedAddressNumber: boolean = false;

  constructor(private customersService: CustomersService,
    private localitiesService: LocalitiesService,
    private domainsService: DomainsService,
    private addressService: AddressesService){}

  ngOnInit(): void {
    this.customersService.getCustomers('672275dacb317c137fb1dd1f').subscribe(customer => {
      this.customers = customer;
      this.filteredCustomers = [...this.customers];
    });
    this.localitiesService.getLocalities().subscribe(locality => {
      this.localities = locality;
      this.filteredLocalities = [...this.localities];
      this.filteredCPS = [...this.localities];
    });
    this.domainsService.getDomains().subscribe(domain => {
      this.domains = domain;
      this.filteredDomains = [...this.domains];
    });
  }

  isFormValid(): boolean {
    return !!(this.selectedCustomerDNI && this.selectedCustomerName && this.selectedCustomerTelephone);
  }

  getCustomerData(direccion_id: string): Customer {
    return{
      _id: '',
      created_at: new Date(),
      nombre: this.selectedCustomerName,
      direccion_id: direccion_id,
      telefono: this.selectedCustomerTelephone,
      email: `${this.selectedCustomerEmail}@${this.selectedCustomerDomain}`,
      favicon: null,
      apellidos: '', // puedes agregar otro ngModel si lo necesitas
      usuario_id: this.selectedCustomerUsuario_id,
      dni: this.selectedCustomerDNI,
    };
  }

  createDireccion(localidad_id: string) {
    const direccion = {
      _id: '',
      created_at: new Date(),
      tipo_via: this.selectedCustomerAddressRoadType,
      nombre: this.selectedCustomerAddressName,
      numero: this.selectedCustomerAddressNumber,
      localidad_id: localidad_id
    };
  
    this.addressService.createAddress(direccion).subscribe(newDireccion => {
      const direccion_id = newDireccion._id;
      this.createCliente(direccion_id);
    });
  }

  createCliente(direccion_id: string) {
    const cliente: Customer = {
      _id: '',
      created_at: new Date(),
      nombre: this.selectedCustomerName,
      apellidos: '', // podrías capturarlo en el formulario si quieres
      direccion_id: direccion_id,
      dni: this.selectedCustomerDNI,
      telefono: this.selectedCustomerTelephone,
      email: `${this.selectedCustomerEmail}@${this.selectedCustomerDomain}`,
      favicon: null,
      usuario_id: this.selectedCustomerUsuario_id
    };
  
    this.customersService.createCustomer(cliente).subscribe(res => {
      console.log("Cliente creado con éxito:", res);
      // Puedes emitir evento, cerrar modal, etc.
    });
  }

  clearForm(){
    this.selectedCustomerDNI = '';
    this.selectedCustomerTelephone = '';
    this.selectedCustomerSurname = '';
    this.selectedCustomerEmail = '';
    this.selectedCustomerDomain = 'gmail.com';
    this.selectedCustomerName = '';
    this.selectedCustomerLocality = {} as Locality;
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
    // Paso 1: Buscar si la localidad ya existe
    const { nombre, comarca, provincia, CP } = this.selectedCustomerLocality;
  
    const localidadExistente = this.localities.find(loc =>
      loc.nombre.toLowerCase() === nombre.toLowerCase() &&
      loc.comarca.toLowerCase() === this.selectedCustomerLocalityRegion.toLowerCase() &&
      loc.provincia.toLowerCase() === this.selectedCustomerLocalityProvince.toLowerCase() &&
      loc.CP.toString() === this.selectedCustomerLocalityCP.toString()
    );
  
    if (localidadExistente) {
      // Si ya existe, pasamos su ID directamente
      this.createDireccion(localidadExistente._id);
    } else {
      // Si no existe, la creamos
      const nuevaLocalidad: Locality = {
        _id: '',
        created_at: new Date(),
        nombre,
        comarca: this.selectedCustomerLocalityRegion,
        provincia: this.selectedCustomerLocalityProvince,
        CP: this.selectedCustomerLocalityCP
      };
  
      this.localitiesService.createLocality(nuevaLocalidad).subscribe(localidadCreada => {
        this.createDireccion(localidadCreada._id);
      });
    }
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
    this.selectedCustomerName= cliente.nombre +" "+ cliente.apellidos;
    this.customerFoundChanged = true;
    this.checkCustomerFound();
    this.filteredCustomersByDNI = []; // Limpia la lista tras la selección
    this.filteredCustomersByName = []; // Limpia la lista tras la selección
    this.filteredCustomersByTelephone = []; // Limpia la lista tras la selección
    this.selectedCustomer = cliente; // Guardamos el cliente seleccionado
    console.log('Cliente seleccionado en el hijo:', cliente);      
    this.customerSelectedEvent.emit(this.selectedCustomer); // Emitimos el cliente seleccionado al padre
  }

  onSearchCustomerDNI(event: any) {

    const dni = (event.target as HTMLInputElement).value;

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

    const name = (event.target as HTMLInputElement).value;
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

    const telephone = (event.target as HTMLInputElement).value;

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
      this.filteredLocalities = this.localities.filter(locality => 
        locality.nombre.toLowerCase().startsWith(query));
      this.localityHasResults = this.filteredLocalities.length > 0;
    } else {
      this.filteredLocalities = [];
      this.localityHasResults = false;
    }
  }

  onSearchCP(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    if (query.length > 0) {
      this.filteredCPS= this.localities.filter(locality => 
        locality.CP.toString().toLowerCase().startsWith(query));
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

   // Método para buscar CP y Localidad de forma combinada
   onSearchCPAndLocality(): void {
    // Lógica para filtrar CP y Localidad basados en los valores actuales
    const cp = this.selectedCustomerCP.trim().toLowerCase();
    const locality = this.selectedCustomerLocalityName.trim().toLowerCase();

    // Filtrar localidades y CP en función de los valores de los inputs
    this.filteredCPS = this.localities.filter(loc =>
      (!cp || loc.CP.toLowerCase().includes(cp)) &&
      (!locality || loc.nombre.toLowerCase().includes(locality))
    );

    this.filteredLocalities = this.localities.filter(loc =>
      (!locality || loc.nombre.toLowerCase().includes(locality)) &&
      (!cp || loc.CP.toLowerCase().includes(cp))
    );
  }

  // Método para manejar la selección de un CP
  selectCP(cp: any): void {
    this.selectedCustomerCP = cp.CP;
    this.selectedCustomerLocalityName = cp.locality; // Sincroniza la localidad
    this.filteredCPS = [];
    this.filteredLocalities = [];
  }

  // Método para manejar la selección de una Localidad
  selectLocality(locality: any): void {
    this.selectedCustomerLocalityName = locality.nombre;
    this.selectedCustomerCP = locality.CP; // Sincroniza el CP
    this.filteredCPS = [];
    this.filteredLocalities = [];
  }

  // Simula la búsqueda combinada (reemplaza con tu lógica real)
  searchByCPAndLocality(cp: string, locality: string, type: 'CP' | 'Locality'): any[] {
    // Aquí deberías implementar la lógica para filtrar los datos según CP y Localidad
    // Por ejemplo, podrías consultar un servicio o filtrar una lista local
    const mockData = [
      { CP: '28001', locality: 'Madrid' },
      { CP: '08001', locality: 'Barcelona' },
      { CP: '46001', locality: 'Valencia' },
    ];

    if (type === 'CP') {
      return mockData.filter(item => item.CP.includes(cp) && item.locality.includes(locality));
    } else {
      return mockData.filter(item => item.locality.includes(locality) && item.CP.includes(cp));
    }
  }

  // selectLocality(locality: Locality) {
  //   this.selectedCustomerLocality = locality;
  //   this.selectedCustomerCP = locality.CP;
  //   this.selectedCustomerLocalityName = locality.nombre;
  //   this.filteredLocalities = [];
  // }

  // selectCP(locality: Locality) {
  //   this.selectedCustomerCP = locality.CP
  //   // this.selectedCustomerLocality = locality.nombre;
  //   this.filteredCPS = [];
  // }

  // Función para eliminar tildes
  removeAccents(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  checkCustomerFound() {
    this.customerFound.emit(this.customerFoundChanged); // Emitimos el nuevo valor
  }
}