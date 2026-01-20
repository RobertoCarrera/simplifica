import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, Plus, Trash2, Edit, Save, X, MessageSquare, Mail, Smartphone, Bell } from 'lucide-angular';
import { SupabaseNotificationsConfigService, NotificationTemplate } from '../../../services/supabase-notifications-config.service';
import { SupabasePermissionsService } from '../../../services/supabase-permissions.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-notifications-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  providers: [{ provide: LUCIDE_ICONS, useValue: new LucideIconProvider({ Plus, Trash2, Edit, Save, X, MessageSquare, Mail, Smartphone, Bell }) }],
  template: `
    <div class="h-full flex flex-col bg-white dark:bg-gray-800">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
        <div>
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">Configuración de Notificaciones</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">Gestiona las plantillas de mensajes automáticos</p>
        </div>
        <button (click)="openModal()" class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm">
          <lucide-icon name="plus" class="w-4 h-4"></lucide-icon>
          <span>Nueva Plantilla</span>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        @if (isLoading()) {
          <div class="flex justify-center p-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        } @else if (templates().length === 0) {
          <div class="text-center p-12 text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <lucide-icon name="message-square" class="w-12 h-12 mx-auto mb-4 opacity-20"></lucide-icon>
            <p class="text-lg font-medium">No hay plantillas configuradas</p>
            <p class="text-sm mb-4">Crea tu primera plantilla para automatizar mensajes</p>
            <button (click)="openModal()" class="text-blue-600 hover:underline">Crear plantilla</button>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (template of templates(); track template.id) {
              <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition-shadow group relative">
                <!-- Active Toggle -->
                <div class="absolute top-4 right-4">
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" [checked]="template.active" (change)="toggleActive(template)" class="sr-only peer">
                    <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div class="flex items-start gap-3 mb-3 pr-10">
                  <div class="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    <lucide-icon [name]="getIconForType(template.type)" class="w-5 h-5"></lucide-icon>
                  </div>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white">{{ template.name }}</h3>
                    <span class="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                      {{ formatTrigger(template.trigger_event) }}
                    </span>
                  </div>
                </div>

                <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mb-4 min-h-[3em]">
                  {{ template.body }}
                </p>

                <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button (click)="editTemplate(template)" class="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                    <lucide-icon name="edit" class="w-4 h-4"></lucide-icon>
                  </button>
                  <button (click)="deleteTemplate(template.id)" class="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <lucide-icon name="trash-2" class="w-4 h-4"></lucide-icon>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>

    <!-- Modal Form -->
    @if (showModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" (click)="closeModal()">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              {{ editingId() ? 'Editar Plantilla' : 'Nueva Plantilla' }}
            </h3>
            <button (click)="closeModal()" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <lucide-icon name="x" class="w-5 h-5"></lucide-icon>
            </button>
          </div>

          <div class="p-6 space-y-4">
            <!-- Name -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre (Interno)</label>
              <input type="text" [(ngModel)]="formData.name" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: Recordatorio WhatsApp 24h">
            </div>

            <!-- Type & Trigger -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Canal</label>
                <select [(ngModel)]="formData.type" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Disparador</label>
                <select [(ngModel)]="formData.trigger_event" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="booking_created">Reserva Creada</option>
                  <option value="booking_cancelled">Reserva Cancelada</option>
                  <option value="reminder_24h">Recordatorio (24h antes)</option>
                  <option value="reminder_1h">Recordatorio (1h antes)</option>
                  <option value="followup_review">Solicitud Reseña (Post-cita)</option>
                </select>
              </div>
            </div>

            <!-- Subject (Email only) -->
            @if (formData.type === 'email') {
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asunto</label>
                <input type="text" [(ngModel)]="formData.subject" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: Recordatorio de tu cita">
              </div>
            }

            <!-- Body -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contenido del mensaje
                <span class="text-xs font-normal text-gray-500 ml-2">Variables: {{ '{' + '{' }}cliente{{ '}' + '}' }}, {{ '{' + '{' }}fecha{{ '}' + '}' }}, {{ '{' + '{' }}hora{{ '}' + '}' }}</span>
              </label>
              <textarea [(ngModel)]="formData.body" rows="4" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Hola {{ '{' + '{' }}cliente{{ '}' + '}' }}, te recordamos tu cita..."></textarea>
            </div>
          </div>

          <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50">
            <button (click)="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              Cancelar
            </button>
            <button (click)="saveTemplate()" [disabled]="!isValid()" class="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {{ editingId() ? 'Guardar Cambios' : 'Crear Plantilla' }}
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class NotificationsSettingsComponent implements OnInit {
  private configService = inject(SupabaseNotificationsConfigService);
  private permissionsService = inject(SupabasePermissionsService);
  private toastService = inject(ToastService);

  templates = signal<NotificationTemplate[]>([]);
  isLoading = signal(true);
  showModal = signal(false);
  editingId = signal<string | null>(null);

  // Form Data
  formData: Partial<NotificationTemplate> = {
    name: '',
    type: 'whatsapp',
    trigger_event: 'reminder_24h',
    subject: '',
    body: '',
    active: true
  };

  ngOnInit() {
    this.loadTemplates();
  }

  async loadTemplates() {
    try {
      this.isLoading.set(true);
      const companyId = this.permissionsService.companyId;
      if (!companyId) return;

      const data = await this.configService.getTemplates(companyId);
      this.templates.set(data);
    } finally {
      this.isLoading.set(false);
    }
  }

  openModal() {
    this.resetForm();
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  resetForm() {
    this.formData = {
      name: '',
      type: 'whatsapp',
      trigger_event: 'reminder_24h',
      subject: '',
      body: '',
      active: true
    };
  }

  editTemplate(template: NotificationTemplate) {
    this.editingId.set(template.id);
    this.formData = { ...template };
    this.showModal.set(true);
  }

  async saveTemplate() {
    try {
      const companyId = this.permissionsService.companyId;
      if (!companyId) return;

      if (this.editingId()) {
        await this.configService.updateTemplate(this.editingId()!, this.formData);
        this.toastService.success('Guardado', 'Plantilla actualizada');
      } else {
        await this.configService.createTemplate({ ...this.formData, company_id: companyId });
        this.toastService.success('Creado', 'Plantilla creada');
      }
      this.closeModal();
      this.loadTemplates();
    } catch (err) {
      this.toastService.error('Error', 'No se pudo guardar la plantilla');
    }
  }

  async toggleActive(template: NotificationTemplate) {
    try {
      await this.configService.updateTemplate(template.id, { active: !template.active });
      // Update local state optimistically or reload
      this.templates.update(list => list.map(t => t.id === template.id ? { ...t, active: !t.active } : t));
    } catch (err) {
      this.toastService.error('Error', 'No se pudo cambiar el estado');
      // Revert check (simplest is to reload)
      this.loadTemplates();
    }
  }

  async deleteTemplate(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta plantilla?')) return;

    try {
      await this.configService.deleteTemplate(id);
      this.toastService.success('Eliminado', 'Plantilla eliminada');
      this.loadTemplates();
    } catch (err) {
      this.toastService.error('Error', 'No se pudo eliminar');
    }
  }

  isValid(): boolean {
    if (!this.formData.name || !this.formData.body) return false;
    if (this.formData.type === 'email' && !this.formData.subject) return false;
    return true;
  }

  getIconForType(type: string): string {
    switch (type) {
      case 'email': return 'mail';
      case 'whatsapp': return 'message-square';
      case 'sms': return 'smartphone';
      default: return 'bell';
    }
  }

  formatTrigger(trigger: string): string {
    switch (trigger) {
      case 'booking_created': return 'Reserva Creada';
      case 'booking_cancelled': return 'Reserva Cancelada';
      case 'reminder_24h': return 'Recordatorio 24h';
      case 'reminder_1h': return 'Recordatorio 1h';
      case 'followup_review': return 'Solicitud Reseña';
      default: return trigger;
    }
  }
}
