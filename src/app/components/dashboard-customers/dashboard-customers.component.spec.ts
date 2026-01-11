import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardCustomersComponent } from './dashboard-customers.component';
import { CustomersService } from '../../services/customers.service';
import { of } from 'rxjs';
import { Customer } from '../../models/customer';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('DashboardCustomersComponent', () => {
  let component: DashboardCustomersComponent;
  let fixture: ComponentFixture<DashboardCustomersComponent>;
  let mockCustomersService: any;

  const mockCustomers: Customer[] = [
    {
      _id: '1',
      created_at: new Date(),
      nombre: 'John',
      apellidos: 'Doe',
      dni: '12345678A',
      direccion: {
        tipo_via: 'Calle',
        nombre: 'Main',
        numero: 1,
        localidad: { nombre: 'Madrid', CP: 28001 },
      } as any, // casting as any for simplicity if Address is complex
      telefono: '555123456',
      email: 'john@example.com',
      fecha_alta: new Date(),
      favicon: null,
      usuario_id: 'u1'
    },
    {
      _id: '2',
      created_at: new Date(),
      nombre: 'Jane',
      apellidos: 'Smith',
      dni: '87654321B',
      direccion: {
        tipo_via: 'Avenida',
        nombre: 'Broadway',
        numero: 2,
        localidad: { nombre: 'Barcelona', CP: 8001 },
      } as any,
      telefono: '555654321',
      email: 'jane@example.com',
      fecha_alta: new Date(),
      favicon: null,
      usuario_id: 'u1'
    }
  ];

  beforeEach(async () => {
    mockCustomersService = {
      getCustomers: jasmine.createSpy('getCustomers').and.returnValue(of(mockCustomers))
    };

    await TestBed.configureTestingModule({
      imports: [DashboardCustomersComponent, FormsModule, HttpClientTestingModule],
      providers: [
        { provide: CustomersService, useValue: mockCustomersService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardCustomersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load customers on init', () => {
    expect(component.customers.length).toBe(2);
    expect(mockCustomersService.getCustomers).toHaveBeenCalled();
  });

  it('should filter customers by name', () => {
    component.searchCustomer = 'john';
    const result = component.filteredCustomers;
    expect(result.length).toBe(1);
    expect(result[0].nombre).toBe('John');
  });

  it('should filter customers by email', () => {
    component.searchCustomer = 'jane@';
    const result = component.filteredCustomers;
    expect(result.length).toBe(1);
    expect(result[0].email).toBe('jane@example.com');
  });

  it('should return all customers if search is empty', () => {
      component.searchCustomer = '';
      const result = component.filteredCustomers;
      expect(result.length).toBe(2);
  });
});
