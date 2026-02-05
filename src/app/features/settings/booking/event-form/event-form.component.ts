import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SimpleSupabaseService } from '../../../../services/simple-supabase.service';

@Component({
  selector: 'app-event-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="fixed inset-0 z-[9999] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>

        <!-- This element is to trick the browser into centering the modal contents. -->
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <!-- Modal Panel -->
        <div class="inline-block align-bottom bg-white dark:bg-gray-900 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="bg-white dark:bg-gray-900 px-6 pt-6 pb-6">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h3 class="text-xl font-bold leading-6 text-gray-900 dark:text-white" id="modal-title">
                    Nuevo Evento
                    </h3>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Añade un nuevo evento a tu calendario de Google.
                    </p>
                </div>
                <!-- Close Button -->
                <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none">
                    <span class="sr-only">Cerrar</span>
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <form [formGroup]="form" class="space-y-5">
              <!-- Summary -->
              <div>
                <label for="summary" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Título del Evento</label>
                <input type="text" id="summary" formControlName="summary"
                  placeholder="Ej: Reunión con Cliente"
                  class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors">
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

          <div class="bg-gray-50 dark:bg-gray-800 px-6 py-4 sm:flex sm:flex-row-reverse border-t border-gray-200 dark:border-gray-700">
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
  `
})
export class EventFormComponent {
  @Input() set initialDate(date: Date | null) {
    if (date) {
      // Create local date strings for datetime-local input
      // format: YYYY-MM-DDThh:mm
      const start = new Date(date);
      start.setSeconds(0, 0); // Reset seconds

      const end = new Date(start);
      end.setHours(end.getHours() + 1);

      this.form.patchValue({
        start: this.formatDateForInput(start),
        end: this.formatDateForInput(end)
      });
    }
  }

  @Input() calendarId!: string;
  @Input() professionals: any[] = []; // Input for professionals list
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private supabase = inject(SimpleSupabaseService);

  loading = false;

  form = this.fb.group({
    summary: ['', Validators.required],
    description: [''],
    professional: [null], // Control for professional
    start: ['', Validators.required],
    end: ['', Validators.required]
  }, { validators: this.dateRangeValidator });


  formatDateForInput(date: Date): string {
    // Handling timezone offset manually to ensure correct local time display
    const tzOffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
    return localISOTime;
  }

  dateRangeValidator(group: any) {
    const start = group.get('start')?.value;
    const end = group.get('end')?.value;
    return start && end && start < end ? null : { dateRange: true };
  }

  async onSubmit() {
    if (this.form.invalid || !this.calendarId) return;

    this.loading = true;
    const formValue = this.form.value;

    try {
      let description = formValue.description || '';

      // Append professional info if selected
      if (formValue.professional) {
        const prof = formValue.professional as any;
        description += `\n\n[Profesional Asignado: ${prof.display_name}]`;
      }

      const eventData = {
        summary: formValue.summary,
        description: description,
        start: { dateTime: new Date(formValue.start!).toISOString() },
        end: { dateTime: new Date(formValue.end!).toISOString() },
      };

      const { data, error } = await this.supabase.getClient().functions.invoke('google-auth', {
        body: {
          action: 'create-event',
          calendarId: this.calendarId,
          event: eventData
        }
      });

      if (error) throw error;

      this.created.emit();
      this.close.emit();

    } catch (err) {
      console.error('Error creating event:', err);
      alert('Error al crear el evento. Revisa la consola.');
    } finally {
      this.loading = false;
    }
  }
}
