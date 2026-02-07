import { Component, EventEmitter, Input, Output, inject, effect, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { SimpleSupabaseService } from '../../../../services/simple-supabase.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-event-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe],
  template: `
    <div class="fixed inset-0 z-[9999] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" (click)="close.emit()"></div>

        <!-- This element is to trick the browser into centering the modal contents. -->
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <!-- Modal Panel -->
        <div class="inline-block align-bottom bg-white dark:bg-gray-900 rounded-2xl text-left overflow-visible shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="bg-white dark:bg-gray-900 px-6 pt-6 pb-6 relative z-10">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h3 class="text-xl font-bold leading-6 text-gray-900 dark:text-white" id="modal-title">
                    Nuevo Evento
                    </h3>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Añade un nuevo evento a tu calendario.
                    </p>
                </div>
                <!-- Close Button -->
                <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none">
                    <span class="sr-only">Cerrar</span>
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <form [formGroup]="form" class="space-y-5">
              
              <!-- Service Selection -->
              <div>
                <label for="service" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Servicio</label>
                <select id="service" formControlName="service"
                   class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors">
                   <option [ngValue]="null">-- Selecciona un servicio --</option>
                   <option *ngFor="let svc of bookableServices" [ngValue]="svc">{{ svc.name }} ({{ svc.base_price | currency:'EUR' }})</option>
                </select>
              </div>

              <!-- Client Selection (Custom Searchable Dropdown) -->
              <div class="relative">
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
                
                <!-- Search Input -->
                <input type="text"
                  [formControl]="clientSearchControl"
                  (focus)="showClientList.set(true)"
                  placeholder="Buscar cliente..."
                  class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors">

                <!-- Selected Client Badge (if any) -->
                 <div *ngIf="form.get('client')?.value as selectedClient" class="mt-2 flex items-center justify-between p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <div class="flex items-center">
                        <div class="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold mr-3">
                            {{ $any(selectedClient).name?.charAt(0) || 'C' }}
                        </div>
                        <div>
                            <div class="text-sm font-medium text-gray-900 dark:text-white">{{ $any(selectedClient).displayName }}</div>
                        </div>
                    </div>
                    <button type="button" (click)="clearClient()" class="text-gray-400 hover:text-red-500">
                        <i class="fas fa-times"></i>
                    </button>
                 </div>

                <!-- Dropdown List -->
                <div *ngIf="showClientList()" 
                     class="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-xl py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-gray-200 dark:border-gray-700">
                     
                     <div *ngIf="filteredClients().length === 0" class="cursor-default select-none relative py-2 pl-3 pr-9 text-gray-70:dark:text-gray-400 italic">
                        No se encontraron clientes.
                     </div>

                     <div *ngFor="let client of filteredClients()" 
                          (click)="selectClient(client)"
                          class="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div class="flex flex-col">
                            <span class="font-medium">{{ client.name }} {{ client.apellidos }}</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400">{{ client.email }}</span>
                        </div>
                     </div>
                </div>

                <!-- Click outside listener (Overlay) -->
                <div *ngIf="showClientList()" (click)="showClientList.set(false)" class="fixed inset-0 z-40 bg-transparent cursor-default"></div>
              </div>

              <!-- Professional (Optional) -->
              <div *ngIf="professionals && professionals.length > 0">
                <label for="professional" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Asignar Profesional (Opcional)</label>
                <select id="professional" formControlName="professional"
                   class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors">
                   <option [ngValue]="null">-- Sin asignar --</option>
                   <option *ngFor="let prof of professionals" [ngValue]="prof">{{ prof.display_name }}</option>
                </select>
              </div>

              <!-- Description -->
              <div>
                <label for="description" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea id="description" formControlName="description" rows="3"
                  placeholder="Detalles adicionales..."
                  class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"></textarea>
              </div>


              <!-- Dates -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label for="start" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Inicio</label>
                  <input type="datetime-local" id="start" formControlName="start"
                    class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors">
                </div>

                <div>
                  <label for="end" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Fin</label>
                  <input type="datetime-local" id="end" formControlName="end"
                    class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors">
                </div>
              </div>
              
              <div *ngIf="form.errors?.['dateRange'] && (form.touched || form.dirty)" 
                  class="rounded-lg bg-red-50 dark:bg-red-900/30 p-3 flex items-start">
                <i class="fas fa-exclamation-circle text-red-500 mt-0.5 mr-2"></i>
                <div class="text-sm text-red-700 dark:text-red-300">
                    La fecha de fin debe ser posterior a la de inicio.
                </div>
              </div>
            </form>
          </div>

          <div class="bg-gray-50 dark:bg-gray-800 px-6 py-4 sm:flex sm:flex-row-reverse border-t border-gray-200 dark:border-gray-700 relative z-20">
            <button type="button" 
              [disabled]="form.invalid || loading"
              (click)="onSubmit()"
              class="w-full inline-flex justify-center items-center rounded-xl border border-transparent shadow-sm px-6 py-2.5 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <i class="fas fa-spinner fa-spin mr-2" *ngIf="loading"></i>
              {{ loading ? 'Guardando...' : 'Crear Evento' }}
            </button>
            <button type="button" 
              (click)="close.emit()"
              class="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 dark:border-gray-600 shadow-sm px-6 py-2.5 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-all">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class EventFormComponent {
  @Input() initialDate: Date | null = null;
  @Input() calendarId: string | undefined;
  @Input() professionals: any[] = [];
  @Input() bookableServices: any[] = [];
  @Input() clients: any[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  loading = false;

  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);
  private supabase = inject(SimpleSupabaseService);

  // Client Search Control
  clientSearchControl = new FormControl('');
  showClientList = signal(false);

  // Filter clients based on search
  filteredClients = computed(() => {
    const term = this.clientSearchControl.value?.toLowerCase() || '';
    if (!term) return this.clients.slice(0, 50); // Limit to 50 if no search
    return this.clients.filter(c =>
      (c.displayName && c.displayName.toLowerCase().includes(term)) ||
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.name && c.name.toLowerCase().includes(term))
    );
  });

  form = this.fb.group({
    service: [null, Validators.required],
    client: [null, Validators.required],
    summary: [''],
    description: [''],
    start: ['', Validators.required],
    end: ['', Validators.required],
    professional: [null]
  }, { validators: this.dateRangeValidator });

  constructor() {
    this.form.valueChanges.subscribe(val => {
      if (val.service || val.client) {
        const serviceName = (val.service as any)?.name || 'Servicio';
        const clientName = (val.client as any)?.displayName || (val.client as any)?.name || 'Cliente';

        if (val.service && val.client) {
          this.form.patchValue({ summary: `${serviceName} - ${clientName}` }, { emitEvent: false });
        }
      }
    });

    // Initialize dates if provided
    effect(() => {
      if (this.initialDate && !this.form.get('start')?.value) {
        this.form.patchValue({
          start: this.formatDateForInput(this.initialDate),
          end: this.formatDateForInput(new Date(this.initialDate.getTime() + 60 * 60 * 1000))
        });
      }
    });
  }

  selectClient(client: any) {
    this.form.get('client')?.setValue(client);
    this.showClientList.set(false);
    this.clientSearchControl.setValue(''); // Clear search or keep name? Clear is better if we show badge.
  }

  clearClient() {
    this.form.get('client')?.setValue(null);
  }

  formatDateForInput(date: Date): string {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  dateRangeValidator(group: any) {
    const start = group.get('start')?.value;
    const end = group.get('end')?.value;
    if (start && end && new Date(end) <= new Date(start)) {
      return { dateRange: true };
    }
    return null;
  }

  async onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    const formValue = this.form.value;

    try {
      let description = formValue.description || '';

      if (formValue.service) {
        description += `\n\n[Servicio: ${(formValue.service as any).name}]`;
      }
      if (formValue.client) {
        description += `\n[Cliente: ${(formValue.client as any).displayName}]`;
      }
      if (formValue.professional) {
        const prof = formValue.professional as any;
        description += `\n[Profesional Asignado: ${prof.display_name}]`;
      }

      const startDate = new Date(formValue.start!);
      const endDate = new Date(formValue.end!);

      const eventData = {
        summary: formValue.summary,
        description: description,
        start: { dateTime: startDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
        extendedProperties: {
          shared: {
            serviceId: (formValue.service as any)?.id ? String((formValue.service as any).id) : null,
            clientId: (formValue.client as any)?.id ? String((formValue.client as any).id) : null,
            professionalId: (formValue.professional as any)?.id ? String((formValue.professional as any).id) : null
          }
        },
        attendees: (formValue.client as any)?.email ? [{ email: (formValue.client as any).email }] : []
      };

      const { data, error } = await this.supabase.getClient().functions.invoke('google-auth', {
        body: {
          action: 'create-event',
          calendarId: this.calendarId,
          event: eventData
        }
      });

      if (error) {
        console.error('Supabase Function Error:', error);
        throw error;
      }

      if (data && data.error) {
        console.error('Google API Error from Backend:', data.error);

        // Handle Permission Error
        if (data.error.code === 403 || data.error.message?.includes('requiredAccessLevel')) {
          this.toastService.error('Error de Permisos', 'No tienes permisos de escritura en el calendario seleccionado. Verifica tu integración.');
          this.loading = false;
          return;
        }

        throw new Error(data.error.message || 'Error desconocido al crear evento');
      }

      this.toastService.success('Evento Creado', 'La cita se ha agendado correctamente en Google Calendar.');
      this.created.emit();
      this.close.emit();
    } catch (error: any) {
      console.error('Error creating event:', error);
      this.toastService.error('Error al crear evento', error.message || 'Error desconocido.');
    } finally {
      this.loading = false;
    }
  }
}
