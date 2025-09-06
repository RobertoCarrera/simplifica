import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataTableComponent } from '../data-table/data-table.component';
import { CalendarComponent } from '../calendar/calendar.component';
import { ToastService } from '../../services/toast.service';
import { AnimationService } from '../../services/animation.service';
import { 
  TableColumn, 
  TableAction, 
  SortEvent, 
  FilterEvent, 
  PaginationEvent 
} from '../data-table/data-table.interface';
import { 
  CalendarEvent, 
  CalendarEventClick, 
  CalendarDateClick 
} from '../calendar/calendar.interface';

interface DemoCustomer {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: 'active' | 'inactive' | 'pending';
  lastContact: Date;
  revenue: number;
}

@Component({
  selector: 'app-demo-components',
  standalone: true,
  imports: [CommonModule, DataTableComponent, CalendarComponent],
  animations: [AnimationService.fadeInUp, AnimationService.staggerList],
  template: `
    <div class="p-6 space-y-8" @fadeInUp>
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          🎨 Componentes Premium
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Demostración de componentes avanzados con animaciones y funcionalidades premium
        </p>
      </div>

      <!-- Data Table Demo -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6" @fadeInUp>
        <div class="mb-6">
          <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            📊 Tabla de Datos Avanzada
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            Tabla con virtualización, ordenamiento, filtros y acciones personalizadas
          </p>
        </div>

        <app-data-table
          [data]="customers()"
          [columns]="tableColumns"
          [actions]="tableActions"
          [loading]="tableLoading"
          [searchable]="true"
          [sortable]="true"
          [paginated]="true"
          [virtualScroll]="true"
          [pageSize]="10"
          (sortChange)="onSort($event)"
          (filterChange)="onFilter($event)"
          (pageChange)="onPageChange($event)"
          (actionClick)="onTableAction($event)">
        </app-data-table>
      </div>

      <!-- Calendar Demo -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6" @fadeInUp>
        <div class="mb-6">
          <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            📅 Calendario Interactivo
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            Calendario con vistas múltiples, gestión de eventos y navegación intuitiva
          </p>
        </div>

        <app-calendar
          [events]="calendarEvents()"
          [editable]="true"
          [selectable]="true"
          (eventClick)="onEventClick($event)"
          (dateClick)="onDateClick($event)"
          (addEvent)="onAddEvent()"
          (viewChange)="onViewChange($event)">
        </app-calendar>
      </div>

      <!-- Animation Demo -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6" @fadeInUp>
        <div class="mb-6">
          <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            ✨ Animaciones y Micro-interacciones
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            Demostración de animaciones fluidas y efectos visuales premium
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" @staggerList>
          @for (demo of animationDemos; track demo.id) {
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-6 text-white cursor-pointer hover:scale-105 transition-transform duration-200"
                 (click)="triggerAnimation(demo.id)">
              <div class="text-2xl mb-2">{{ demo.icon }}</div>
              <h3 class="text-lg font-semibold mb-2">{{ demo.title }}</h3>
              <p class="text-indigo-100 text-sm">{{ demo.description }}</p>
            </div>
          }
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" @staggerList>
        @for (stat of statsCards; track stat.id) {
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow duration-200" @fadeInUp>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-600 dark:text-gray-400">{{ stat.label }}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stat.value }}</p>
                <p class="text-sm text-gray-500 dark:text-gray-500 mt-1">{{ stat.change }}</p>
              </div>
              <div class="text-3xl" [style.color]="stat.color">{{ stat.icon }}</div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class DemoComponentsComponent {
  customers = signal<DemoCustomer[]>([]);
  calendarEvents = signal<CalendarEvent[]>([]);
  tableLoading = signal(false);

  tableColumns: TableColumn[] = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      width: '80px'
    },
    {
      key: 'name',
      label: 'Nombre',
      sortable: true,
      type: 'text'
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      type: 'text'
    },
    {
      key: 'company',
      label: 'Empresa',
      sortable: true,
      type: 'text'
    },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      type: 'status',
      render: (value: string) => {
        const colors = {
          active: 'bg-green-100 text-green-800',
          inactive: 'bg-red-100 text-red-800',
          pending: 'bg-yellow-100 text-yellow-800'
        };
        const labels = {
          active: 'Activo',
          inactive: 'Inactivo',
          pending: 'Pendiente'
        };
        return `<span class="px-2 py-1 text-xs font-semibold rounded-full ${colors[value as keyof typeof colors]}">${labels[value as keyof typeof labels]}</span>`;
      }
    },
    {
      key: 'revenue',
      label: 'Ingresos',
      sortable: true,
      type: 'currency',
      format: (value: number) => `$${value.toLocaleString('es-CL')}`
    }
  ];

  tableActions: TableAction[] = [
    {
      label: 'Editar',
      icon: 'edit',
      color: 'primary',
      onClick: (row: any) => this.handleEdit(row)
    },
    {
      label: 'Eliminar',
      icon: 'delete',
      color: 'danger',
      onClick: (row: any) => this.handleDelete(row)
    },
    {
      label: 'Ver',
      icon: 'view',
      color: 'success',
      onClick: (row: any) => this.handleView(row)
    }
  ];

  animationDemos = [
    {
      id: 1,
      icon: '🌊',
      title: 'Fade In Up',
      description: 'Entrada suave desde abajo'
    },
    {
      id: 2,
      icon: '🎭',
      title: 'Modal Slide',
      description: 'Animación de modal elegante'
    },
    {
      id: 3,
      icon: '📱',
      title: 'Card Hover',
      description: 'Efecto hover en tarjetas'
    },
    {
      id: 4,
      icon: '🎯',
      title: 'Button Press',
      description: 'Feedback táctil en botones'
    },
    {
      id: 5,
      icon: '📋',
      title: 'Stagger List',
      description: 'Animación escalonada'
    },
    {
      id: 6,
      icon: '🔄',
      title: 'Loading Spinner',
      description: 'Indicador de carga'
    }
  ];

  statsCards = [
    {
      id: 1,
      label: 'Clientes Totales',
      value: '2,543',
      change: '+12% vs mes anterior',
      icon: '👥',
      color: '#6366f1'
    },
    {
      id: 2,
      label: 'Ingresos',
      value: '$48,290',
      change: '+8% vs mes anterior',
      icon: '💰',
      color: '#10b981'
    },
    {
      id: 3,
      label: 'Tickets Abiertos',
      value: '127',
      change: '-5% vs mes anterior',
      icon: '🎫',
      color: '#f59e0b'
    },
    {
      id: 4,
      label: 'Satisfacción',
      value: '94%',
      change: '+2% vs mes anterior',
      icon: '⭐',
      color: '#ef4444'
    }
  ];

  constructor(private toastService: ToastService) {
    this.generateDemoData();
  }

  generateDemoData() {
    // Generate demo customers
    const demoCustomers: DemoCustomer[] = [];
    const names = ['Juan Pérez', 'María González', 'Carlos López', 'Ana Martín', 'Luis Rodríguez'];
    const companies = ['Tech Corp', 'Innovate SL', 'Digital Solutions', 'Future Systems', 'Smart Business'];
    const statuses: ('active' | 'inactive' | 'pending')[] = ['active', 'inactive', 'pending'];

    for (let i = 1; i <= 50; i++) {
      demoCustomers.push({
        id: i,
        name: names[Math.floor(Math.random() * names.length)],
        email: `cliente${i}@empresa.com`,
        phone: `+56 9 ${Math.floor(Math.random() * 90000000) + 10000000}`,
        company: companies[Math.floor(Math.random() * companies.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        lastContact: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
        revenue: Math.floor(Math.random() * 100000) + 5000
      });
    }

    this.customers.set(demoCustomers);

    // Generate demo calendar events
    const demoEvents: CalendarEvent[] = [];
    const eventTitles = [
      'Reunión con cliente',
      'Llamada de seguimiento',
      'Presentación producto',
      'Revisión técnica',
      'Capacitación equipo'
    ];

    for (let i = 1; i <= 20; i++) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30) - 15);
      startDate.setHours(Math.floor(Math.random() * 8) + 9, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + Math.floor(Math.random() * 3) + 1);

      demoEvents.push({
        id: i.toString(),
        title: eventTitles[Math.floor(Math.random() * eventTitles.length)],
        description: `Descripción del evento ${i}`,
        start: startDate,
        end: endDate,
        allDay: Math.random() > 0.7,
        color: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][Math.floor(Math.random() * 5)],
        attendees: [`Asistente ${i}`, `Participante ${i + 1}`],
        location: `Sala ${Math.floor(Math.random() * 5) + 1}`
      });
    }

    this.calendarEvents.set(demoEvents);
  }

  onSort(event: SortEvent) {
    console.log('Sort event:', event);
    this.toastService.info('Ordenamiento', `Ordenando por ${event.column} (${event.direction})`);
  }

  onFilter(event: FilterEvent) {
    console.log('Filter event:', event);
    this.toastService.info('Filtro', `Filtrando: ${event.value}`);
  }

  onPageChange(event: PaginationEvent) {
    console.log('Page change:', event);
    const totalPages = Math.ceil(event.total / event.pageSize);
    this.toastService.info('Paginación', `Página ${event.page} de ${totalPages}`);
  }

  onTableAction(event: any) {
    console.log('Table action:', event);
    this.toastService.success('Acción', `Acción ${event.action.label} ejecutada en ${event.item.name}`);
  }

  onEventClick(event: CalendarEventClick) {
    console.log('Event click:', event);
    this.toastService.info('Evento', `Evento: ${event.event.title}`);
  }

  onDateClick(event: CalendarDateClick) {
    console.log('Date click:', event);
    this.toastService.info('Fecha', `Fecha seleccionada: ${event.date.toLocaleDateString('es-CL')}`);
  }

  onAddEvent() {
    this.toastService.success('Evento', 'Funcionalidad de agregar evento - Por implementar');
  }

  onViewChange(view: any) {
    console.log('View change:', view);
    this.toastService.info('Vista', `Vista cambiada a: ${view.type}`);
  }

  triggerAnimation(demoId: number) {
    const demo = this.animationDemos.find(d => d.id === demoId);
    if (demo) {
      this.toastService.success('Animación', `Animación: ${demo.title} activada! 🎉`);
    }
  }

  handleEdit(row: any) {
    this.toastService.info('Editar', `Editando: ${row.name}`);
  }

  handleDelete(row: any) {
    this.toastService.warning('Eliminar', `¿Eliminar a ${row.name}?`);
  }

  handleView(row: any) {
    this.toastService.info('Ver', `Viendo detalles de: ${row.name}`);
  }
}
