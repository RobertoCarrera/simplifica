import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DevicesService, Device } from '../services/devices.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-client-devices-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-devices-modal.component.html',
  styleUrls: ['./client-devices-modal.component.scss']
})
export class ClientDevicesModalComponent implements OnInit, OnDestroy {
  @Input() mode: 'view' | 'select' = 'view';
  @Input() isModal: boolean = true;
  @Input() companyId!: string;
  @Input() client: any; // { id, name, ... }
  @Output() close = new EventEmitter<void>();
  @Output() editDevice = new EventEmitter<Device>();
  @Output() selectDevices = new EventEmitter<Device[]>();
  @Output() createNewDevice = new EventEmitter<void>();

  devices: Device[] = [];
  filteredDevices: Device[] = [];
  loading = false;

  // Search & Filter
  searchTerm = '';
  statusFilter: string = 'all';

  // Device Detail View
  selectedDevice: Device | null = null;
  deviceHistory: any[] = [];
  loadingHistory = false;

  // Selection Mode
  selectedDevicesForAdd: Set<string> = new Set();

  // Internal Create/Edit Mode
  viewMode: 'list' | 'create' | 'edit' = 'list';
  isSaving = false;
  deviceFormData: Partial<Device> = {};

  private devicesService = inject(DevicesService);
  private toastService = inject(ToastService);
  private renderer = inject(Renderer2);
  private router = inject(Router);

  ngOnInit() {
    this.renderer.setStyle(document.body, 'overflow', 'hidden');
    this.loadDevices();
  }

  ngOnDestroy() {
    this.renderer.removeStyle(document.body, 'overflow');
  }

  async loadDevices() {
    if (!this.companyId) return;

    this.loading = true;
    try {
      // Fetch devices (optionally filtered by client_id at DB level)
      const clientId = this.client?.id;
      const allDevices = await this.devicesService.getDevices(this.companyId, false, clientId);

      this.devices = allDevices;
      this.filterDevices();
    } catch (error) {
      this.toastService.error('Error', 'Error al cargar dispositivos');
    } finally {
      this.loading = false;
    }
  }

  filterDevices() {
    let temp = [...this.devices];

    // Status Filter
    if (this.statusFilter !== 'all') {
      temp = temp.filter(d => d.status === this.statusFilter);
    }

    // Search
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      temp = temp.filter(d =>
        (d.brand || '').toLowerCase().includes(term) ||
        (d.model || '').toLowerCase().includes(term) ||
        (d.imei || '').toLowerCase().includes(term) ||
        (d.serial_number || '').toLowerCase().includes(term) ||
        (d.reported_issue || '').toLowerCase().includes(term) ||
        (d.client?.name || '').toLowerCase().includes(term) // Search by Client Name
      );
    }

    this.filteredDevices = temp;
  }

  async selectDevice(device: Device) {
    if (this.mode === 'select') {
      this.toggleSelection(device);
      return;
    }

    this.selectedDevice = device;
    this.loadingHistory = true;
    try {
      this.deviceHistory = await this.devicesService.getDeviceTickets(device.id);
    } catch (error) {
      this.toastService.error('Error', 'Error al cargar historial');
    } finally {
      this.loadingHistory = false;
    }
  }

  toggleSelection(device: Device) {
    if (this.selectedDevicesForAdd.has(device.id)) {
      this.selectedDevicesForAdd.delete(device.id);
    } else {
      this.selectedDevicesForAdd.add(device.id);
    }
  }

  submitSelection() {
    const selected = this.devices.filter(d => this.selectedDevicesForAdd.has(d.id));
    this.selectDevices.emit(selected);
  }

  onCreateNew() {
    // If in select mode, allow existing behavior or switch to internal create?
    // User requested "Nuevo Dispositivo" in the list.
    // Let's use internal create for both modes to keep it simple and consistent.
    this.viewMode = 'create';
    this.deviceFormData = {
      company_id: this.companyId,
      client_id: this.client?.id,
      status: 'received',
      device_type: 'smartphone', // default
      priority: 'normal'
    };
  }

  clearSelection() {
    this.selectedDevice = null;
    this.deviceHistory = [];
  }

  onEditDevice(device: Device) {
    this.viewMode = 'edit';
    this.deviceFormData = { ...device };
  }

  cancelEdit() {
    this.viewMode = 'list';
    this.deviceFormData = {};
  }

  async saveDevice() {
    if (!this.deviceFormData.brand || !this.deviceFormData.model) {
      this.toastService.warning('Faltan datos', 'Marca y Modelo son obligatorios');
      return;
    }

    this.isSaving = true;
    try {
      if (this.viewMode === 'create') {
        const newDevice = await this.devicesService.createDevice(this.deviceFormData);
        this.devices.unshift(newDevice); // Add to local list
        this.filterDevices();
        this.toastService.success('Dispositivo creado', 'El dispositivo se ha añadido correctamente.');

        // If in select mode, maybe auto-select it?
        if (this.mode === 'select') {
          this.toggleSelection(newDevice);
        } else {
          this.selectDevice(newDevice); // Select it to view details
        }
      } else if (this.viewMode === 'edit' && this.deviceFormData.id) {
        const updated = await this.devicesService.updateDevice(this.deviceFormData.id, this.deviceFormData);
        // Update local list
        const index = this.devices.findIndex(d => d.id === updated.id);
        if (index !== -1) this.devices[index] = updated;
        this.filterDevices();
        if (this.selectedDevice?.id === updated.id) {
          this.selectedDevice = updated; // Update detail view
        }
        this.toastService.success('Dispositivo actualizado', 'Los cambios se han guardado.');
      }
      this.viewMode = 'list';
    } catch (error) {
      console.error(error);
      this.toastService.error('Error', 'No se pudo guardar el dispositivo.');
    } finally {
      this.isSaving = false;
    }
  }

  goToTicket(ticket: any) {
    const ticketId = ticket.id || ticket.ticket_id;
    if (ticketId) {
      // Close modal first to avoid overlay issues
      this.close.emit();
      this.router.navigate(['/ticket', ticketId]);
    }
  }

  getDeviceStatusLabel(status: string): string {
    const map: any = {
      'received': 'Recibido',
      'in_progress': 'En Proceso',
      'completed': 'Completado',
      'delivered': 'Entregado',
      'cancelled': 'Cancelado'
    };
    return map[status] || status;
  }

  getDeviceStatusClass(status: string): string {
    const map: any = {
      'received': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      'in_progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      'completed': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
      'delivered': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      'cancelled': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  formatDate(date: string | undefined): string {
    if (!date) return '-';
    // Use user locale format
    return new Date(date).toLocaleDateString();
  }
}
