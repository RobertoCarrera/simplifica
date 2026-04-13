import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface DeviceFormData {
  brand: string;
  model: string;
  imei: string;
  color: string;
  device_type: string;
  reported_issue: string;
  condition_on_arrival: string;
}

export interface SelectedImage {
  file: File;
  preview: string;
}

@Component({
  selector: 'app-ticket-create-device-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div
        class="fixed inset-0 flex items-center justify-center bg-black/60"
        style="z-index: 100000;"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600"
          >
            <div>
              <h2 class="text-xl font-bold text-white flex items-center gap-2">
                <i class="fas fa-mobile-alt"></i>
                {{ isEditing ? 'Editar Dispositivo' : isClient ? 'Añadir mi dispositivo' : 'Nuevo Dispositivo' }}
              </h2>
              <p class="text-blue-100 text-sm mt-0.5">
                {{ isClient ? 'Registre su dispositivo' : 'Registre el dispositivo del cliente' }}
              </p>
            </div>
            <button
              (click)="cancel.emit()"
              class="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-2 transition-all"
            >
              <i class="fas fa-times text-lg"></i>
            </button>
          </div>
          <!-- Body -->
          <div class="p-6 overflow-y-auto flex-1 space-y-5">
            <!-- Row 1: Brand + Model -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Marca *</label>
                <input
                  type="text"
                  [(ngModel)]="formData.brand"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Ej: Apple, Samsung, Xiaomi"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Modelo *</label>
                <input
                  type="text"
                  [(ngModel)]="formData.model"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Ej: iPhone 14, Galaxy S23"
                />
              </div>
            </div>
            <!-- Row 2: IMEI + Color + Type -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              @if (!isClient) {
                <div class="space-y-1.5">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">IMEI</label>
                  <input
                    type="text"
                    [(ngModel)]="formData.imei"
                    class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Número IMEI"
                  />
                </div>
              }
              <div class="space-y-1.5">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
                <input
                  type="text"
                  [(ngModel)]="formData.color"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Color"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo *</label>
                <select
                  [(ngModel)]="formData.device_type"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="">Seleccionar tipo</option>
                  <option value="smartphone">Smartphone</option>
                  <option value="tablet">Tablet</option>
                  <option value="laptop">Portátil</option>
                  <option value="desktop">Ordenador</option>
                  <option value="console">Consola</option>
                  <option value="other">Otro</option>
                </select>
              </div>
            </div>
            <!-- Row 3: Reported Issue -->
            <div class="space-y-1.5">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Problema Reportado *</label>
              <textarea
                [(ngModel)]="formData.reported_issue"
                class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                rows="2"
                placeholder="Describe el problema reportado por el cliente"
              ></textarea>
            </div>
            <!-- Row 4: Condition on Arrival (admin only) -->
            @if (!isClient) {
              <div class="space-y-1.5">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Estado al llegar</label>
                <textarea
                  [(ngModel)]="formData.condition_on_arrival"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                  rows="2"
                  placeholder="Estado inicial, accesorios incluidos, etc."
                ></textarea>
              </div>
            }
            <!-- Row 5: Image Upload -->
            <div class="space-y-1.5">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Imágenes del dispositivo</label>
              <div
                class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer bg-gray-50 dark:bg-gray-700/50"
              >
                <input
                  type="file"
                  id="device_images_modal"
                  (change)="onImagesSelected($event)"
                  accept="image/*"
                  multiple
                  class="hidden"
                />
                <label for="device_images_modal" class="cursor-pointer flex flex-col items-center gap-2">
                  <i class="fas fa-cloud-upload-alt text-3xl text-gray-400 dark:text-gray-500"></i>
                  <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Agregar imágenes</span>
                  <span class="text-xs text-gray-400 dark:text-gray-500">Arrastra archivos aquí o haz click para seleccionar</span>
                </label>
              </div>
              @if (selectedImages.length > 0) {
                <div class="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
                  @for (img of selectedImages; track img.preview; let i = $index) {
                    <div class="relative group rounded-lg overflow-hidden aspect-square bg-gray-100 dark:bg-gray-700">
                      <img [src]="img.preview" class="w-full h-full object-cover" />
                      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          (click)="removeImage(i)"
                          class="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <i class="fas fa-trash text-sm"></i>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
          <!-- Footer -->
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button (click)="cancel.emit()" class="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-all">
              <i class="fas fa-times mr-2"></i>Cancelar
            </button>
            <button
              (click)="submit.emit(formData)"
              [disabled]="!formData.brand || !formData.model || !formData.device_type || !formData.reported_issue"
              class="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
            >
              <i class="fas fa-check mr-2"></i>{{ isEditing ? 'Guardar Cambios' : 'Crear Dispositivo' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketCreateDeviceModalComponent {
  @Input() show = false;
  @Input() isClient = false;
  @Input() isEditing = false;
  @Input() initialData: DeviceFormData = this.emptyForm();
  @Output() cancel = new EventEmitter<void>();
  @Output() submit = new EventEmitter<DeviceFormData>();
  @Output() imagesSelected = new EventEmitter<File[]>();

  formData: DeviceFormData = this.emptyForm();
  selectedImages: SelectedImage[] = [];

  private emptyForm(): DeviceFormData {
    return {
      brand: '',
      model: '',
      imei: '',
      color: '',
      device_type: '',
      reported_issue: '',
      condition_on_arrival: '',
    };
  }

  ngOnChanges() {
    if (this.show) {
      this.formData = { ...this.emptyForm(), ...this.initialData };
      this.selectedImages = [];
    }
  }

  onImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const files = Array.from(input.files);
      const newImages = files.map(file => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      this.selectedImages = [...this.selectedImages, ...newImages];
      this.imagesSelected.emit(files);
    }
  }

  removeImage(index: number) {
    this.selectedImages.splice(index, 1);
    this.selectedImages = [...this.selectedImages];
  }
}
