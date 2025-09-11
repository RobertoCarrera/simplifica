import { Component, inject, signal, computed, input, output, effect, OnDestroy, EffectRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Customer, CreateCustomer, UpdateCustomer } from '../../models/customer';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { LoadingComponent } from '../loading/loading.component';
import { AnimationService } from '../../services/animation.service';
import { SmoothTransitionDirective } from '../../directives/smooth-transition.directive';

@Component({
  selector: 'app-customer-form',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    LoadingComponent,
    SmoothTransitionDirective
  ],
  template: `
    <div class="customer-form-container">
      <!-- Header -->
      <div 
        appSmoothTransition="fadeIn"
        [transitionDelay]="100"
        class="form-header"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
            {{ isEditing() ? '✏️ Editar Cliente' : '➕ Nuevo Cliente' }}
          </h3>
          <button
            type="button"
            (click)="closeForm()"
            class="close-btn"
            [attr.aria-label]="'Cerrar formulario'"
          >
            ✖️
          </button>
        </div>
      </div>

      <!-- Loading Overlay -->
      @if (isLoading()) {
        <div class="loading-overlay">
          <app-loading
            type="spinner"
            size="lg"
            text="Procesando..."
            [overlay]="true"
          ></app-loading>
        </div>
      }

      <!-- Form -->
      <form 
        [formGroup]="customerForm" 
        (ngSubmit)="onSubmit()"
        class="customer-form"
        appSmoothTransition="slideIn"
        [transitionDelay]="200"
      >
        
        <!-- Avatar Section -->
        <div class="avatar-section" appSmoothTransition="zoomIn" [transitionDelay]="300">
          <div class="avatar-container">
            <div class="avatar-preview">
              @if (avatarPreview()) {
                <img [src]="avatarPreview()" alt="Avatar preview" class="avatar-img">
              } @else {
                <div class="avatar-placeholder">
                  <span class="avatar-initials">{{ getInitials() }}</span>
                </div>
              }
            </div>
            <div class="avatar-actions">
              <input
                #fileInput
                type="file"
                accept="image/*"
                (change)="onAvatarSelect($event)"
                class="hidden"
              >
              <button
                type="button"
                (click)="fileInput.click()"
                class="avatar-btn primary"
                appSmoothTransition="pulse"
                [clickEffect]="true"
              >
                📷 Subir Foto
              </button>
              @if (avatarPreview()) {
                <button
                  type="button"
                  (click)="removeAvatar()"
                  class="avatar-btn secondary"
                  appSmoothTransition="shake"
                  [clickEffect]="true"
                >
                  🗑️ Quitar
                </button>
              }
            </div>
          </div>
        </div>

        <!-- Basic Information -->
        <div class="form-section" appSmoothTransition="slideIn" [transitionDelay]="400">
          <h4 class="section-title">👤 Información Personal</h4>
          
          <div class="form-grid">
            <!-- Nombre -->
            <div class="form-group">
              <label for="nombre" class="form-label">Nombre *</label>
              <input
                id="nombre"
                type="text"
                formControlName="nombre"
                class="form-input"
                [class.error]="isFieldInvalid('nombre')"
                placeholder="Ingrese el nombre"
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
              @if (isFieldInvalid('nombre')) {
                <span class="error-message">El nombre es requerido</span>
              }
            </div>

            <!-- Apellidos -->
            <div class="form-group">
              <label for="apellidos" class="form-label">Apellidos *</label>
              <input
                id="apellidos"
                type="text"
                formControlName="apellidos"
                class="form-input"
                [class.error]="isFieldInvalid('apellidos')"
                placeholder="Ingrese los apellidos"
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
              @if (isFieldInvalid('apellidos')) {
                <span class="error-message">Los apellidos son requeridos</span>
              }
            </div>

            <!-- DNI -->
            <div class="form-group">
              <label for="dni" class="form-label">DNI *</label>
              <input
                id="dni"
                type="text"
                formControlName="dni"
                class="form-input"
                [class.error]="isFieldInvalid('dni')"
                placeholder="12345678A"
                maxlength="9"
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
              @if (isFieldInvalid('dni')) {
                <span class="error-message">
                  @if (customerForm.get('dni')?.hasError('required')) {
                    El DNI es requerido
                  } @else if (customerForm.get('dni')?.hasError('pattern')) {
                    Formato de DNI inválido
                  }
                </span>
              }
            </div>

            <!-- Fecha de Nacimiento -->
            <div class="form-group">
              <label for="fecha_nacimiento" class="form-label">Fecha de Nacimiento</label>
              <input
                id="fecha_nacimiento"
                type="date"
                formControlName="fecha_nacimiento"
                class="form-input"
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
            </div>
          </div>
        </div>

        <!-- Contact Information -->
        <div class="form-section" appSmoothTransition="slideIn" [transitionDelay]="500">
          <h4 class="section-title">📞 Información de Contacto</h4>
          
          <div class="form-grid">
            <!-- Email -->
            <div class="form-group">
              <label for="email" class="form-label">Email *</label>
              <input
                id="email"
                type="email"
                formControlName="email"
                class="form-input"
                [class.error]="isFieldInvalid('email')"
                placeholder="cliente@ejemplo.com"
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
              @if (isFieldInvalid('email')) {
                <span class="error-message">
                  @if (customerForm.get('email')?.hasError('required')) {
                    El email es requerido
                  } @else if (customerForm.get('email')?.hasError('email')) {
                    Formato de email inválido
                  }
                </span>
              }
            </div>

            <!-- Teléfono -->
            <div class="form-group">
              <label for="telefono" class="form-label">Teléfono *</label>
              <input
                id="telefono"
                type="tel"
                formControlName="telefono"
                class="form-input"
                [class.error]="isFieldInvalid('telefono')"
                placeholder="600 123 456"
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
              @if (isFieldInvalid('telefono')) {
                <span class="error-message">El teléfono es requerido</span>
              }
            </div>
          </div>
        </div>

        <!-- Professional Information -->
        <div class="form-section" appSmoothTransition="slideIn" [transitionDelay]="600">
          <h4 class="section-title">💼 Información Profesional</h4>
          
          <div class="form-grid">
            <!-- Profesión -->
            <div class="form-group">
              <label for="profesion" class="form-label">Profesión</label>
              <input
                id="profesion"
                type="text"
                formControlName="profesion"
                class="form-input"
                placeholder="Ej: Ingeniero, Doctor, etc."
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
            </div>

            <!-- Empresa -->
            <div class="form-group">
              <label for="empresa" class="form-label">Empresa</label>
              <input
                id="empresa"
                type="text"
                formControlName="empresa"
                class="form-input"
                placeholder="Nombre de la empresa"
                appSmoothTransition="fadeIn"
                [hoverEffect]="true"
              >
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-section" appSmoothTransition="slideIn" [transitionDelay]="700">
            <h4 class="section-title">� Dirección</h4>
          
          <div class="form-group">
            <label for="address" class="form-label">Dirección</label>
            <input
              id="address"
              type="text"
              formControlName="address"
              class="form-input"
              placeholder="Calle, número, piso"
              appSmoothTransition="fadeIn"
              [hoverEffect]="true"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="form-actions" appSmoothTransition="slideIn" [transitionDelay]="800">
          <button
            type="button"
            (click)="closeForm()"
            class="btn btn-secondary"
            appSmoothTransition="pulse"
            [clickEffect]="true"
          >
            ❌ Cancelar
          </button>
          
          <button
            type="submit"
            [disabled]="customerForm.invalid || isLoading()"
            class="btn btn-primary"
            [class.loading]="isLoading()"
            appSmoothTransition="bounce"
            [clickEffect]="true"
          >
            @if (isLoading()) {
              ⏳ Procesando...
            } @else {
              {{ isEditing() ? '💾 Actualizar' : '➕ Crear' }} Cliente
            }
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['./customer-form.component.scss']
})
export class CustomerFormComponent implements OnDestroy {
  // Inputs
  customer = input<Customer | null>(null);
  isOpen = input<boolean>(false);
  
  // Outputs  
  onClose = output<void>();
  onSave = output<Customer>();

  // Services
  private fb = inject(FormBuilder);
  private customersService = inject(SupabaseCustomersService);
  private animationService = inject(AnimationService);

  // State
  isLoading = signal(false);
  avatarFile = signal<File | null>(null);
  avatarPreview = signal<string | null>(null);
  
  // Computed
  isEditing = computed(() => !!this.customer());

  // Form
  customerForm: FormGroup;

  constructor() {
    this.customerForm = this.createForm();
    
    // Watch for customer changes
    this.setupCustomerWatcher();
    
    // Watch isOpen input and block scroll when modal opens
    effect(() => {
      if (this.isOpen()) {
        // Bloquear scroll de la página principal de forma más agresiva
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
        document.documentElement.style.overflow = 'hidden';
      } else {
        // Restaurar scroll de la página principal
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.documentElement.style.overflow = '';
      }
    });
  }

  ngOnDestroy(): void {
    // Restaurar scroll de la página principal
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
  }

  private createForm(): FormGroup {
    return this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      apellidos: ['', [Validators.required, Validators.minLength(2)]],
      dni: ['', [Validators.required, Validators.pattern(/^[0-9]{8}[A-Z]$/)]],
      email: ['', [Validators.required, Validators.email]],
      telefono: ['', [Validators.required, Validators.minLength(9)]],
      fecha_nacimiento: [''],
      profesion: [''],
      empresa: [''],
  address: ['']
    });
  }

  private setupCustomerWatcher(): void {
    // Efecto para poblar el formulario cuando cambia el cliente
    const customer = this.customer();
    if (customer) {
      this.customerForm.patchValue({
        nombre: customer.name,
        apellidos: customer.apellidos,
        dni: customer.dni,
        email: customer.email,
        telefono: customer.phone,
        fecha_nacimiento: customer.fecha_nacimiento || '',
        profesion: customer.profesion || '',
        empresa: customer.empresa || '',
  address: customer.address || ''
      });
      
      if (customer.avatar_url) {
        this.avatarPreview.set(customer.avatar_url);
      }
    }
  }

  getInitials(): string {
    const nombre = this.customerForm.get('nombre')?.value || '';
    const apellidos = this.customerForm.get('apellidos')?.value || '';
    return `${nombre.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.customerForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  onAvatarSelect(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.avatarFile.set(file);
      
      // Preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.avatarPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  removeAvatar(): void {
    this.avatarFile.set(null);
    this.avatarPreview.set(null);
  }

  async onSubmit(): Promise<void> {
    if (this.customerForm.invalid) {
      this.markAllFieldsAsTouched();
      return;
    }

    this.isLoading.set(true);
    
    try {
      const formData = this.customerForm.value;
      
      if (this.isEditing()) {
        // Actualizar cliente existente
        const customer = this.customer()!;
        const updateData: UpdateCustomer = {
          ...formData,
          updated_at: new Date().toISOString()
        };
        
        // Subir avatar si hay uno nuevo
        if (this.avatarFile()) {
          const avatarUrl = await this.uploadAvatar(customer.id);
          updateData.avatar_url = avatarUrl;
        }
        
        this.customersService.updateCustomer(customer.id, updateData).subscribe({
          next: (updatedCustomer) => {
            this.onSave.emit(updatedCustomer);
            this.closeForm();
          },
          error: (error) => {
            console.error('Error updating customer:', error);
          },
          complete: () => {
            this.isLoading.set(false);
          }
        });
      } else {
        // Crear nuevo cliente
        const createData: CreateCustomer = {
          ...formData,
          usuario_id: 'current-user-id' // TODO: Get from auth service
        };
        
        this.customersService.createCustomer(createData).subscribe({
          next: async (newCustomer) => {
            // Subir avatar después de crear el cliente
            if (this.avatarFile()) {
              const avatarUrl = await this.uploadAvatar(newCustomer.id);
              const updatedCustomer = await this.customersService.updateCustomer(
                newCustomer.id, 
                { avatar_url: avatarUrl }
              ).toPromise();
              this.onSave.emit(updatedCustomer!);
            } else {
              this.onSave.emit(newCustomer);
            }
            this.closeForm();
          },
          error: (error) => {
            console.error('Error creating customer:', error);
          },
          complete: () => {
            this.isLoading.set(false);
          }
        });
      }
    } catch (error) {
      console.error('Error in form submission:', error);
      this.isLoading.set(false);
    }
  }

  private async uploadAvatar(customerId: string): Promise<string> {
    const file = this.avatarFile();
    if (!file) throw new Error('No avatar file selected');
    
    const result = await this.customersService.uploadAvatar(customerId, file).toPromise();
    if (!result) throw new Error('Failed to upload avatar');
    return result;
  }

  private markAllFieldsAsTouched(): void {
    Object.keys(this.customerForm.controls).forEach(key => {
      this.customerForm.get(key)?.markAsTouched();
    });
  }

  closeForm(): void {
    this.customerForm.reset();
    this.avatarFile.set(null);
    this.avatarPreview.set(null);
    this.onClose.emit();
  }
}
