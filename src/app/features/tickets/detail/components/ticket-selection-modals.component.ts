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

// ─── Services ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-ticket-services-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div class="modal-overlay">
        <div class="modal-content w-full max-w-[1100px] lg:max-w-[1000px]" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Seleccionar Servicios</h2>
            <button (click)="close.emit()" class="modal-close" aria-label="Cerrar modal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body space-y-3">
            <input
              type="text"
              class="form-input"
              placeholder="Buscar servicios..."
              [(ngModel)]="searchText"
              (input)="onSearch()"
            />
            <div class="max-h-80 overflow-auto divide-y">
              @for (svc of filtered(); track svc) {
                <div class="py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" (click)="toggle(svc)">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 pr-4">
                      <div class="font-medium">{{ svc.name }}</div>
                      <div class="text-xs text-gray-500 line-clamp-2">{{ svc.description }}</div>
                      <div class="text-xs text-gray-500 mt-1">
                        @if (svc.tags?.length) {
                          <i class="fas fa-tag"></i>
                          @for (t of svc.tags; track t; let i = $index) {
                            <span>{{ t }}{{ i < svc.tags.length - 1 ? ', ' : '' }}</span>
                          }
                        } @else {
                          🏷️ {{ svc.category || 'Sin categoría' }}
                        }
                      </div>
                    </div>
                    <div class="pl-3">
                      <input type="checkbox" [checked]="isSelected(svc.id)" (change)="toggle(svc)" />
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="modal-footer flex justify-end space-x-2 p-2">
            <button (click)="close.emit()" class="btn btn-secondary">Cancelar</button>
            <button
              [disabled]="selectedIds.size === 0"
              (click)="save.emit(selectedIds)"
              class="btn btn-primary"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketServicesModalComponent {
  @Input() show = false;
  @Input() set services(v: any[]) { this._services = v; this.applyFilter(); }
  @Input() set selectedIds(v: Set<string>) { this._selectedIds = v; }
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Set<string>>();

  _services: any[] = [];
  _selectedIds: Set<string> = new Set();
  searchText = '';
  filtered = signal<any[]>([]);

  private _all: any[] = [];

  onSearch() { this.applyFilter(); }

  private applyFilter() {
    const q = this.searchText.toLowerCase();
    this.filtered.set(
      q ? this._services.filter(s => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
        : [...this._services]
    );
  }

  ngOnChanges() {
    this._all = [...this._services];
    this.applyFilter();
  }

  isSelected(id: string) { return this._selectedIds.has(id); }

  toggle(svc: any) {
    const next = new Set(this._selectedIds);
    next.has(svc.id) ? next.delete(svc.id) : next.add(svc.id);
    this._selectedIds = next;
  }
}

// ─── Products ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-ticket-products-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div class="modal-overlay">
        <div class="modal-content w-full max-w-[1100px] lg:max-w-[1000px]" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Seleccionar Productos</h2>
            <button (click)="close.emit()" class="modal-close" aria-label="Cerrar modal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body space-y-3">
            <input
              type="text"
              class="form-input"
              placeholder="Buscar productos..."
              [(ngModel)]="searchText"
              (input)="onSearch()"
            />
            <div class="max-h-80 overflow-auto divide-y">
              @for (prod of filtered(); track prod) {
                <div class="py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" (click)="toggle(prod)">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 pr-4">
                      <div class="font-medium">{{ prod.name }}</div>
                      <div class="text-xs text-gray-500 line-clamp-2">{{ prod.description }}</div>
                      @if (prod.stock !== undefined) {
                        <div class="text-xs mt-1" [class.text-red-500]="prod.stock === 0" [class.text-green-500]="prod.stock > 0">
                          Stock: {{ prod.stock }}
                        </div>
                      }
                    </div>
                    <div class="pl-3">
                      <input type="checkbox" [checked]="isSelected(prod.id)" (change)="toggle(prod)" />
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="modal-footer flex justify-end space-x-2 p-2">
            <button (click)="close.emit()" class="btn btn-secondary">Cancelar</button>
            <button
              [disabled]="selectedIds.size === 0"
              (click)="save.emit(selectedIds)"
              class="btn btn-primary"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketProductsModalComponent {
  @Input() show = false;
  @Input() set products(v: any[]) { this._products = v; this.applyFilter(); }
  @Input() set selectedIds(v: Set<string>) { this._selectedIds = v; }
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Set<string>>();

  _products: any[] = [];
  _selectedIds: Set<string> = new Set();
  searchText = '';
  filtered = signal<any[]>([]);

  onSearch() { this.applyFilter(); }

  private applyFilter() {
    const q = this.searchText.toLowerCase();
    this.filtered.set(
      q ? this._products.filter(p => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
        : [...this._products]
    );
  }

  ngOnChanges() { this.applyFilter(); }
  isSelected(id: string) { return this._selectedIds.has(id); }
  toggle(prod: any) {
    const next = new Set(this._selectedIds);
    next.has(prod.id) ? next.delete(prod.id) : next.add(prod.id);
    this._selectedIds = next;
  }
}

// ─── Devices ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-ticket-devices-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div class="modal-overlay">
        <div class="modal-content w-full max-w-[1100px] lg:max-w-[1000px]" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Seleccionar Dispositivos</h2>
            <div class="flex items-center gap-2">
              <button
                (click)="createNew.emit()"
                class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm hover:shadow-md transition-all"
              >
                <i class="fas fa-plus mr-1"></i> Nuevo Dispositivo
              </button>
              <button (click)="close.emit()" class="modal-close" aria-label="Cerrar modal">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div class="modal-body space-y-3">
            <input
              type="text"
              class="form-input"
              placeholder="Buscar dispositivos..."
              [(ngModel)]="searchText"
              (input)="onSearch()"
            />
            <div class="max-h-80 overflow-auto divide-y">
              @for (dev of filtered(); track dev) {
                <div class="py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" (click)="toggle(dev)">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 pr-4">
                      <div class="font-medium">{{ dev.brand }} {{ dev.model }}</div>
                      <div class="text-xs text-gray-500 line-clamp-1">
                        {{ dev.device_type || '' }} {{ dev.imei ? '· IMEI: ' + dev.imei : '' }}
                      </div>
                    </div>
                    <div class="pl-3">
                      <input type="checkbox" [checked]="isSelected(dev.id)" (change)="toggle(dev)" />
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="modal-footer flex justify-end space-x-2 p-2">
            <button (click)="close.emit()" class="btn btn-secondary">Cancelar</button>
            <button
              [disabled]="selectedIds.size === 0"
              (click)="save.emit(selectedIds)"
              class="btn btn-primary"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketDevicesModalComponent {
  @Input() show = false;
  @Input() set devices(v: any[]) { this._devices = v; this.applyFilter(); }
  @Input() set selectedIds(v: Set<string>) { this._selectedIds = v; }
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Set<string>>();
  @Output() createNew = new EventEmitter<void>();

  _devices: any[] = [];
  _selectedIds: Set<string> = new Set();
  searchText = '';
  filtered = signal<any[]>([]);

  onSearch() { this.applyFilter(); }

  private applyFilter() {
    const q = this.searchText.toLowerCase();
    this.filtered.set(
      q ? this._devices.filter(d =>
        d.brand?.toLowerCase().includes(q) ||
        d.model?.toLowerCase().includes(q) ||
        d.imei?.toLowerCase().includes(q)
      ) : [...this._devices]
    );
  }

  ngOnChanges() { this.applyFilter(); }
  isSelected(id: string) { return this._selectedIds.has(id); }
  toggle(dev: any) {
    const next = new Set(this._selectedIds);
    next.has(dev.id) ? next.delete(dev.id) : next.add(dev.id);
    this._selectedIds = next;
  }
}
