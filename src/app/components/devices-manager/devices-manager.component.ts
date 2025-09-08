import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DevicesService, Device, DeviceStats } from '../../services/devices.service';
import { SimpleSupabaseService, SimpleClient } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-devices-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Header con estadísticas -->
    <div class="devices-header">
      <div class="header-title">
        <h2>
          <i class="fas fa-mobile-alt"></i>
          Gestión de Dispositivos
        </h2>
        <p>Sistema completo de seguimiento y reparación</p>
      </div>
      
      <!-- Estadísticas rápidas -->
      <div class="stats-grid">
        <div class="stat-card received">
          <div class="stat-icon">
            <i class="fas fa-inbox"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ deviceStats.received_count }}</div>
            <div class="stat-label">Recibidos</div>
          </div>
        </div>
        
        <div class="stat-card in-progress">
          <div class="stat-icon">
            <i class="fas fa-tools"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ deviceStats.in_progress_count }}</div>
            <div class="stat-label">En Reparación</div>
          </div>
        </div>
        
        <div class="stat-card completed">
          <div class="stat-icon">
            <i class="fas fa-check-circle"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ deviceStats.completed_count }}</div>
            <div class="stat-label">Completados</div>
          </div>
        </div>
        
        <div class="stat-card delivered">
          <div class="stat-icon">
            <i class="fas fa-truck"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ deviceStats.delivered_count }}</div>
            <div class="stat-label">Entregados</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Controles y filtros -->
    <div class="controls-section">
      <div class="search-and-filters">
        <div class="search-container">
          <input 
            type="text" 
            [(ngModel)]="searchTerm" 
            (input)="filterDevices()"
            placeholder="Buscar por marca, modelo, serie o problema..."
            class="search-input">
          <i class="fas fa-search search-icon"></i>
        </div>
        
        <div class="filters">
          <select [(ngModel)]="selectedStatus" (change)="filterDevices()" class="filter-select">
            <option value="">Todos los estados</option>
            <option value="received">Recibidos</option>
            <option value="in_progress">En Reparación</option>
            <option value="completed">Completados</option>
            <option value="delivered">Entregados</option>
            <option value="cancelled">Cancelados</option>
          </select>
          
          <select [(ngModel)]="selectedDeviceType" (change)="filterDevices()" class="filter-select">
            <option value="">Todos los tipos</option>
            <option value="smartphone">Smartphone</option>
            <option value="tablet">Tablet</option>
            <option value="laptop">Laptop</option>
            <option value="desktop">Desktop</option>
            <option value="printer">Impresora</option>
            <option value="other">Otro</option>
          </select>
          
          <select [(ngModel)]="selectedPriority" (change)="filterDevices()" class="filter-select">
            <option value="">Todas las prioridades</option>
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
      </div>
      
      <button class="btn btn-primary" (click)="openDeviceForm()">
        <i class="fas fa-plus"></i>
        Nuevo Dispositivo
      </button>
    </div>

    <!-- Lista de dispositivos -->
    <div class="devices-grid">
      <div 
        *ngFor="let device of filteredDevices" 
        class="device-card"
        [class]="'status-' + device.status">
        
        <!-- Header del dispositivo -->
        <div class="device-header">
          <div class="device-info">
            <div class="device-name">
              <i [class]="getDeviceIcon(device.device_type)"></i>
              {{ device.brand }} {{ device.model }}
            </div>
            <div class="device-type">{{ device.device_type | titlecase }}</div>
          </div>
          
          <div class="device-status">
            <span class="status-badge" [class]="'status-' + device.status">
              {{ getStatusLabel(device.status) }}
            </span>
            <span class="priority-badge" [class]="'priority-' + device.priority">
              {{ getPriorityLabel(device.priority) }}
            </span>
          </div>
        </div>

        <!-- Información del cliente -->
        <div class="client-info" *ngIf="device.client">
          <i class="fas fa-user"></i>
          <span>{{ device.client.name }}</span>
          <span *ngIf="device.client.phone" class="phone">{{ device.client.phone }}</span>
        </div>

        <!-- Problema reportado -->
        <div class="reported-issue">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ device.reported_issue }}</span>
        </div>

        <!-- Fechas importantes -->
        <div class="device-dates">
          <div class="date-item">
            <i class="fas fa-calendar-plus"></i>
            <span>Recibido: {{ formatDate(device.received_at) }}</span>
          </div>
          
          <div class="date-item" *ngIf="device.estimated_cost">
            <i class="fas fa-euro-sign"></i>
            <span>Presupuesto: {{ device.estimated_cost }}€</span>
          </div>
          
          <div class="date-item" *ngIf="getProgressDays(device.received_at) > 0">
            <i class="fas fa-clock"></i>
            <span>{{ getProgressDays(device.received_at) }} días</span>
          </div>
        </div>

        <!-- Acciones -->
        <div class="device-actions">
          <button 
            class="btn btn-sm btn-outline" 
            (click)="viewDeviceDetail(device)"
            title="Ver detalle">
            <i class="fas fa-eye"></i>
          </button>
          
          <button 
            class="btn btn-sm btn-secondary" 
            (click)="editDevice(device)"
            title="Editar">
            <i class="fas fa-edit"></i>
          </button>
          
          <button 
            class="btn btn-sm btn-success" 
            (click)="updateDeviceStatus(device)"
            title="Cambiar estado"
            *ngIf="device.status !== 'delivered'">
            <i class="fas fa-arrow-right"></i>
          </button>
          
          <button 
            class="btn btn-sm btn-info" 
            (click)="viewImages(device)"
            title="Ver imágenes">
            <i class="fas fa-images"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div *ngIf="filteredDevices.length === 0" class="empty-state">
      <i class="fas fa-mobile-alt"></i>
      <h3>No hay dispositivos</h3>
      <p>No se encontraron dispositivos con los filtros aplicados.</p>
      <button class="btn btn-primary" (click)="openDeviceForm()">
        <i class="fas fa-plus"></i>
        Agregar Primer Dispositivo
      </button>
    </div>

    <!-- Modal para formulario de dispositivo -->
    <div *ngIf="showDeviceForm" class="modal-overlay" (click)="closeDeviceForm()">
      <div class="modal-content device-modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>
            <i class="fas fa-mobile-alt"></i>
            {{ editingDevice ? 'Editar Dispositivo' : 'Nuevo Dispositivo' }}
          </h2>
          <button class="btn-close" (click)="closeDeviceForm()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal-body">
          <!-- Información básica -->
          <div class="form-section">
            <h3>Información Básica</h3>
            
            <div class="form-row">
              <div class="form-group">
                <label for="client_id">Cliente *</label>
                <select 
                  id="client_id"
                  [(ngModel)]="deviceFormData.client_id" 
                  name="client_id"
                  class="form-control"
                  [class.error]="deviceFormErrors['client_id']">
                  <option value="">Seleccionar cliente</option>
                  <option *ngFor="let client of clients" [value]="client.id">
                    {{ client.name }}
                  </option>
                </select>
                <div *ngIf="deviceFormErrors['client_id']" class="error-message">
                  {{ deviceFormErrors['client_id'] }}
                </div>
              </div>

              <div class="form-group">
                <label for="device_type">Tipo de Dispositivo *</label>
                <select 
                  id="device_type"
                  [(ngModel)]="deviceFormData.device_type" 
                  name="device_type"
                  class="form-control"
                  [class.error]="deviceFormErrors['device_type']">
                  <option value="">Seleccionar tipo</option>
                  <option value="smartphone">Smartphone</option>
                  <option value="tablet">Tablet</option>
                  <option value="laptop">Laptop</option>
                  <option value="desktop">Desktop</option>
                  <option value="printer">Impresora</option>
                  <option value="other">Otro</option>
                </select>
                <div *ngIf="deviceFormErrors['device_type']" class="error-message">
                  {{ deviceFormErrors['device_type'] }}
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="brand">Marca *</label>
                <input 
                  type="text" 
                  id="brand"
                  [(ngModel)]="deviceFormData.brand" 
                  name="brand"
                  class="form-control"
                  [class.error]="deviceFormErrors['brand']"
                  placeholder="Apple, Samsung, HP...">
                <div *ngIf="deviceFormErrors['brand']" class="error-message">
                  {{ deviceFormErrors['brand'] }}
                </div>
              </div>

              <div class="form-group">
                <label for="model">Modelo *</label>
                <input 
                  type="text" 
                  id="model"
                  [(ngModel)]="deviceFormData.model" 
                  name="model"
                  class="form-control"
                  [class.error]="deviceFormErrors['model']"
                  placeholder="iPhone 14 Pro, Galaxy S23...">
                <div *ngIf="deviceFormErrors['model']" class="error-message">
                  {{ deviceFormErrors['model'] }}
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="serial_number">Número de Serie</label>
                <input 
                  type="text" 
                  id="serial_number"
                  [(ngModel)]="deviceFormData.serial_number" 
                  name="serial_number"
                  class="form-control"
                  placeholder="Número de serie del dispositivo">
              </div>

              <div class="form-group" *ngIf="deviceFormData.device_type === 'smartphone'">
                <label for="imei">IMEI</label>
                <input 
                  type="text" 
                  id="imei"
                  [(ngModel)]="deviceFormData.imei" 
                  name="imei"
                  class="form-control"
                  placeholder="IMEI para smartphones">
              </div>
            </div>
          </div>

          <!-- Problema y estado -->
          <div class="form-section">
            <h3>Problema Reportado</h3>
            
            <div class="form-group">
              <label for="reported_issue">Problema Reportado *</label>
              <textarea 
                id="reported_issue"
                [(ngModel)]="deviceFormData.reported_issue" 
                name="reported_issue"
                class="form-control"
                [class.error]="deviceFormErrors['reported_issue']"
                rows="3"
                placeholder="Describe el problema reportado por el cliente..."></textarea>
              <div *ngIf="deviceFormErrors['reported_issue']" class="error-message">
                {{ deviceFormErrors['reported_issue'] }}
              </div>
            </div>

            <div class="form-group">
              <label for="condition_on_arrival">Condición al Llegar</label>
              <textarea 
                id="condition_on_arrival"
                [(ngModel)]="deviceFormData.condition_on_arrival" 
                name="condition_on_arrival"
                class="form-control"
                rows="2"
                placeholder="Estado físico del dispositivo al recibirlo..."></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="priority">Prioridad</label>
                <select 
                  id="priority"
                  [(ngModel)]="deviceFormData.priority" 
                  name="priority"
                  class="form-control">
                  <option value="low">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              <div class="form-group">
                <label for="estimated_cost">Presupuesto Estimado (€)</label>
                <input 
                  type="number" 
                  id="estimated_cost"
                  [(ngModel)]="deviceFormData.estimated_cost" 
                  name="estimated_cost"
                  class="form-control"
                  min="0"
                  step="0.01"
                  placeholder="0.00">
              </div>
            </div>
          </div>

          <!-- Información técnica adicional -->
          <div class="form-section">
            <h3>Información Técnica (Opcional)</h3>
            
            <div class="form-row">
              <div class="form-group">
                <label for="operating_system">Sistema Operativo</label>
                <input 
                  type="text" 
                  id="operating_system"
                  [(ngModel)]="deviceFormData.operating_system" 
                  name="operating_system"
                  class="form-control"
                  placeholder="iOS 16, Android 13, Windows 11...">
              </div>

              <div class="form-group">
                <label for="storage_capacity">Capacidad de Almacenamiento</label>
                <input 
                  type="text" 
                  id="storage_capacity"
                  [(ngModel)]="deviceFormData.storage_capacity" 
                  name="storage_capacity"
                  class="form-control"
                  placeholder="128GB, 1TB...">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="color">Color</label>
                <input 
                  type="text" 
                  id="color"
                  [(ngModel)]="deviceFormData.color" 
                  name="color"
                  class="form-control"
                  placeholder="Space Gray, Blanco...">
              </div>

              <div class="form-group">
                <label for="warranty_status">Estado de Garantía</label>
                <select 
                  id="warranty_status"
                  [(ngModel)]="deviceFormData.warranty_status" 
                  name="warranty_status"
                  class="form-control">
                  <option value="unknown">Desconocido</option>
                  <option value="in_warranty">En Garantía</option>
                  <option value="out_of_warranty">Fuera de Garantía</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" (click)="closeDeviceForm()">
            Cancelar
          </button>
          <button type="button" class="btn btn-primary" (click)="saveDevice()">
            <i class="fas fa-save"></i>
            {{ editingDevice ? 'Actualizar' : 'Crear' }} Dispositivo
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./devices-manager.component.scss']
})
export class DevicesManagerComponent implements OnInit {
  private devicesService = inject(DevicesService);
  private simpleSupabase = inject(SimpleSupabaseService);

  // Estado principal
  devices: Device[] = [];
  filteredDevices: Device[] = [];
  deviceStats: DeviceStats = {
    total_devices: 0,
    received_count: 0,
    in_progress_count: 0,
    completed_count: 0,
    delivered_count: 0,
    avg_repair_time: 0
  };

  // Filtros y búsqueda
  searchTerm = '';
  selectedStatus = '';
  selectedDeviceType = '';
  selectedPriority = '';

  // Clientes para el formulario
  clients: SimpleClient[] = [];

  // Formulario de dispositivo
  showDeviceForm = false;
  editingDevice: Device | null = null;
  deviceFormData: Partial<Device> = {};
  deviceFormErrors: Record<string, string> = {};

  // Company ID (debería venir del contexto global)
  selectedCompanyId = '1'; // TODO: Obtener de un servicio global

  ngOnInit() {
    this.loadDevices();
    this.loadDeviceStats();
    this.loadClients();
  }

  async loadDevices() {
    try {
      this.devices = await this.devicesService.getDevices(this.selectedCompanyId);
      this.filteredDevices = [...this.devices];
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  }

  async loadDeviceStats() {
    try {
      this.deviceStats = await this.devicesService.getDeviceStats(this.selectedCompanyId);
    } catch (error) {
      console.error('Error loading device stats:', error);
    }
  }

  async loadClients() {
    try {
      const response = await this.simpleSupabase.getClients();
      if (response.success && response.data) {
        this.clients = response.data;
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  }

  filterDevices() {
    let filtered = [...this.devices];

    // Filtro por texto
    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(device =>
        device.brand.toLowerCase().includes(search) ||
        device.model.toLowerCase().includes(search) ||
        device.serial_number?.toLowerCase().includes(search) ||
        device.reported_issue.toLowerCase().includes(search) ||
        device.client?.name.toLowerCase().includes(search)
      );
    }

    // Filtros por selects
    if (this.selectedStatus) {
      filtered = filtered.filter(device => device.status === this.selectedStatus);
    }
    if (this.selectedDeviceType) {
      filtered = filtered.filter(device => device.device_type === this.selectedDeviceType);
    }
    if (this.selectedPriority) {
      filtered = filtered.filter(device => device.priority === this.selectedPriority);
    }

    this.filteredDevices = filtered;
  }

  // Métodos de UI
  getDeviceIcon(deviceType: string): string {
    const icons: Record<string, string> = {
      smartphone: 'fas fa-mobile-alt',
      tablet: 'fas fa-tablet-alt',
      laptop: 'fas fa-laptop',
      desktop: 'fas fa-desktop',
      printer: 'fas fa-print',
      other: 'fas fa-microchip'
    };
    return icons[deviceType] || 'fas fa-microchip';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      received: 'Recibido',
      in_progress: 'En Reparación',
      completed: 'Completado',
      delivered: 'Entregado',
      cancelled: 'Cancelado'
    };
    return labels[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      low: 'Baja',
      normal: 'Normal',
      high: 'Alta',
      urgent: 'Urgente'
    };
    return labels[priority] || priority;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-ES');
  }

  getProgressDays(receivedAt: string): number {
    const received = new Date(receivedAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - received.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Métodos del formulario
  openDeviceForm(device?: Device) {
    this.editingDevice = device || null;
    this.deviceFormData = device ? { ...device } : {
      company_id: this.selectedCompanyId,
      status: 'received',
      priority: 'normal',
      warranty_status: 'unknown'
    };
    this.deviceFormErrors = {};
    this.showDeviceForm = true;
    
    // Bloquear scroll
    document.body.style.overflow = 'hidden';
  }

  closeDeviceForm() {
    this.showDeviceForm = false;
    this.editingDevice = null;
    this.deviceFormData = {};
    this.deviceFormErrors = {};
    
    // Restaurar scroll
    document.body.style.overflow = '';
  }

  validateDeviceForm(): boolean {
    this.deviceFormErrors = {};
    let isValid = true;

    if (!this.deviceFormData.client_id?.trim()) {
      this.deviceFormErrors['client_id'] = 'El cliente es requerido';
      isValid = false;
    }

    if (!this.deviceFormData.device_type?.trim()) {
      this.deviceFormErrors['device_type'] = 'El tipo de dispositivo es requerido';
      isValid = false;
    }

    if (!this.deviceFormData.brand?.trim()) {
      this.deviceFormErrors['brand'] = 'La marca es requerida';
      isValid = false;
    }

    if (!this.deviceFormData.model?.trim()) {
      this.deviceFormErrors['model'] = 'El modelo es requerido';
      isValid = false;
    }

    if (!this.deviceFormData.reported_issue?.trim()) {
      this.deviceFormErrors['reported_issue'] = 'El problema reportado es requerido';
      isValid = false;
    }

    return isValid;
  }

  async saveDevice() {
    if (!this.validateDeviceForm()) {
      return;
    }

    try {
      if (this.editingDevice) {
        await this.devicesService.updateDevice(this.editingDevice.id, this.deviceFormData);
      } else {
        await this.devicesService.createDevice(this.deviceFormData);
      }

      this.closeDeviceForm();
      await this.loadDevices();
      await this.loadDeviceStats();
    } catch (error) {
      console.error('Error saving device:', error);
    }
  }

  // Métodos de acciones
  viewDeviceDetail(device: Device) {
    // TODO: Implementar modal de detalle completo
    console.log('View device detail:', device);
  }

  editDevice(device: Device) {
    this.openDeviceForm(device);
  }

  async updateDeviceStatus(device: Device) {
    // TODO: Implementar modal para cambio de estado
    console.log('Update device status:', device);
  }

  viewImages(device: Device) {
    // TODO: Implementar galería de imágenes
    console.log('View device images:', device);
  }
}
