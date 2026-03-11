import { Component, ChangeDetectionStrategy, computed, signal, OnInit, OnDestroy, inject, Input, Output, EventEmitter, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseProfessionalsService, Professional } from '../../services/supabase-professionals.service';
import { SupabaseResourcesService, Resource } from '../../services/supabase-resources.service';
import { CalendarEvent } from '../calendar/calendar.interface';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './agenda.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaComponent implements OnInit, OnDestroy {
      // Change professional color, ensuring uniqueness
      onChangeProfessionalColor(prof: Professional, newColor: string) {
        // Prevent duplicate color assignment
        const others = this.professionals().filter(p => p.id !== prof.id);
        if (others.some(p => p.color === newColor)) {
          alert('Ese color ya está asignado a otra profesional. Elige otro.');
          return;
        }
        // Update locally
        const updated = this.professionals().map(p => p.id === prof.id ? { ...p, color: newColor } : p);
        this.professionals.set(updated);
        // Persist
        this.professionalsService.updateProfessional(prof.id, { color: newColor });
      }
    // Default color palette (extend as needed)
    private readonly colorPalette = [
      '#F87171', // Red
      '#FBBF24', // Amber
      '#34D399', // Green
      '#60A5FA', // Blue
      '#A78BFA', // Purple
      '#F472B6', // Pink
      '#F59E42', // Orange
      '#38BDF8', // Sky
      '#4ADE80', // Emerald
      '#FACC15', // Yellow
      '#818CF8', // Indigo
      '#FCD34D', // Gold
      '#A3E635', // Lime
      '#F9A8D4', // Rose
      '#FDBA74', // Peach
      '#6EE7B7', // Teal
      '#C084FC', // Violet
      '#FDE68A', // Light Yellow
      '#FCA5A5', // Light Red
      '#D1D5DB'  // Gray
    ];

  private professionalsService = inject(SupabaseProfessionalsService);
  private resourcesService = inject(SupabaseResourcesService);
  private zone = inject(NgZone);

  @Input() set eventsData(val: CalendarEvent[]) { this.events.set(val); }
  @Input() minHour = 8;
  @Input() maxHour = 20;

  @Input() set date(val: Date) {
    if (val) this.currentDate.set(val);
  }
  @Output() dateChange = new EventEmitter<Date>();

  @Input() set searchQuery(val: string) {
    this.globalSearchTerm.set(val || '');
  }

  events = signal<CalendarEvent[]>([]);
  currentDate = signal(new Date());
  globalSearchTerm = signal('');
  agendaSearchTerm = signal('');

  professionals = signal<Professional[]>([]);
  resources = signal<Resource[]>([]);

  // Checkbox filter selections (all selected by default)
  selectedProfessionalIds = signal<Set<string>>(new Set());
  selectedServiceIds = signal<Set<string>>(new Set());
  selectedResourceIds = signal<Set<string>>(new Set());

  workingToday = signal(false);

  // Accordion sections
  showProfesionales = signal(false);
  showServicios = signal(false);
  showSalas = signal(false);

  // Current time bar
  currentTimeTop = signal<number>(-1);
  private _timerRef: ReturnType<typeof setInterval> | null = null;

  availableServices = computed(() => {
    const map = new Map<string, string>();
    for (const prof of this.professionals()) {
      for (const svc of (prof.services || [])) {
        map.set(svc.id, svc.name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  filteredProfessionals = computed(() => {
    let profs = this.professionals();
    const globalSearch = this.globalSearchTerm().trim().toLowerCase();
    const agendaSearch = this.agendaSearchTerm().trim().toLowerCase();
    const selectedProfs = this.selectedProfessionalIds();
    const selectedSvcs = this.selectedServiceIds();
    const svcCount = this.availableServices().length;

    const search = globalSearch || agendaSearch;
    if (search) {
      profs = profs.filter(p =>
        p.display_name?.toLowerCase().includes(search) ||
        p.title?.toLowerCase().includes(search)
      );
    }

    if (selectedProfs.size < this.professionals().length) {
      profs = profs.filter(p => selectedProfs.has(p.id));
    }

    if (selectedSvcs.size < svcCount && svcCount > 0) {
      profs = profs.filter(p => (p.services || []).some(s => selectedSvcs.has(s.id)));
    }

    return profs;
  });

  timeSlots = computed(() => {
    const slots: string[] = [];
    for (let h = this.minHour; h < this.maxHour; h++) {
      slots.push(`${h}:00`);
      slots.push(`${h}:30`);
    }
    return slots;
  });

  miniCalendarDays = computed(() => {
    const result: Date[] = [];
    const base = this.currentDate();
    const firstDay = new Date(base.getFullYear(), base.getMonth(), 1);
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;
    firstDay.setDate(firstDay.getDate() - (startDay - 1));
    for (let i = 0; i < 42; i++) {
      result.push(new Date(firstDay));
      firstDay.setDate(firstDay.getDate() + 1);
    }
    return result;
  });

  ngOnInit() {
    this.loadProfessionals();
    this.loadResources();
    this.updateCurrentTime();
    this.zone.runOutsideAngular(() => {
      this._timerRef = setInterval(() => {
        this.zone.run(() => this.updateCurrentTime());
      }, 30000);
    });
  }

  ngOnDestroy() {
    if (this._timerRef) clearInterval(this._timerRef);
  }

  private updateCurrentTime() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (h >= this.minHour && h < this.maxHour) {
      this.currentTimeTop.set((h - this.minHour) * 120 + (m / 60) * 120 + 16);
    } else {
      this.currentTimeTop.set(-1);
    }
  }

  loadProfessionals() {
    this.professionalsService.getProfessionals().subscribe(profs => {
      this.professionals.set(profs);
      this.selectedProfessionalIds.set(new Set(profs.map(p => p.id)));
      const allSvcIds = new Set<string>();
      profs.forEach(p => (p.services || []).forEach(s => allSvcIds.add(s.id)));
      this.selectedServiceIds.set(allSvcIds);
    });
  }

  loadResources() {
    this.resourcesService.getResources().subscribe(res => {
      this.resources.set(res);
      this.selectedResourceIds.set(new Set(res.map(r => r.id)));
    });
  }

  prevMonth() {
    this.currentDate.update(d => {
      const nd = new Date(d); nd.setMonth(nd.getMonth() - 1);
      this.dateChange.emit(nd); return nd;
    });
  }

  nextMonth() {
    this.currentDate.update(d => {
      const nd = new Date(d); nd.setMonth(nd.getMonth() + 1);
      this.dateChange.emit(nd); return nd;
    });
  }

  selectDate(d: Date) {
    this.currentDate.set(d);
    this.dateChange.emit(d);
  }

  isToday(d: Date): boolean {
    const t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
  }

  isSelectedDate(d: Date): boolean {
    const c = this.currentDate();
    return d.getDate() === c.getDate() && d.getMonth() === c.getMonth() && d.getFullYear() === c.getFullYear();
  }

  isCurrentDisplayMonth(d: Date): boolean {
    return d.getMonth() === this.currentDate().getMonth();
  }

  getMiniDayClasses(d: Date): string {
    const base = 'h-7 w-7 mx-auto flex items-center justify-center rounded-full cursor-pointer text-xs transition-all select-none';
    if (this.isSelectedDate(d)) {
      return `${base} bg-indigo-600 text-white font-semibold`;
    }
    if (this.isToday(d)) {
      return `${base} ring-2 ring-indigo-500 text-indigo-600 font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900`;
    }
    if (!this.isCurrentDisplayMonth(d)) {
      return `${base} text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700`;
    }
    return `${base} text-gray-700 dark:text-gray-200 hover:bg-indigo-100 dark:hover:bg-indigo-900`;
  }

  // Professional checkboxes
  toggleProfessional(id: string) {
    this.selectedProfessionalIds.update(s => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
  }
  isProfessionalSelected(id: string): boolean { return this.selectedProfessionalIds().has(id); }

  getProfessionalAvailabilityStyle(prof: Professional) {
    if (!prof.schedules) return {};
    const dayOfWeek = this.currentDate().getDay();
    const schedule = prof.schedules.find(s => s.day_of_week === dayOfWeek && s.is_active);
    if (!schedule) return {};

    const parseTime = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h + m / 60;
    };

    const start = parseTime(schedule.start_time);
    const end = parseTime(schedule.end_time);
    
    // total calendar hours = maxHour - minHour
    const totalHours = this.maxHour - this.minHour;
    const top = ((start - this.minHour) / totalHours) * 100;
    const height = ((end - start) / totalHours) * 100;

    return {
      'position': 'absolute',
      'top': `${top}%`,
      'height': `${height}%`,
      'left': '0',
      'right': '0',
      'background-color': prof.color || '#e5e7eb',
      'opacity': '0.1',
      'pointer-events': 'none'
    };
  }
  areAllProfessionalsSelected(): boolean { return this.selectedProfessionalIds().size === this.professionals().length; }
  toggleAllProfessionals() {
    if (this.areAllProfessionalsSelected()) {
      this.selectedProfessionalIds.set(new Set());
    } else {
      this.selectedProfessionalIds.set(new Set(this.professionals().map(p => p.id)));
    }
  }

  // Service checkboxes
  toggleService(id: string) {
    this.selectedServiceIds.update(s => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
  }
  isServiceSelected(id: string): boolean { return this.selectedServiceIds().has(id); }
  areAllServicesSelected(): boolean { return this.selectedServiceIds().size === this.availableServices().length; }
  toggleAllServices() {
    if (this.areAllServicesSelected()) {
      this.selectedServiceIds.set(new Set());
    } else {
      this.selectedServiceIds.set(new Set(this.availableServices().map(s => s.id)));
    }
  }

  // Resource (sala) checkboxes
  toggleResource(id: string) {
    this.selectedResourceIds.update(s => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
  }
  isResourceSelected(id: string): boolean { return this.selectedResourceIds().has(id); }
  areAllResourcesSelected(): boolean { return this.selectedResourceIds().size === this.resources().length; }
  toggleAllResources() {
    if (this.areAllResourcesSelected()) {
      this.selectedResourceIds.set(new Set());
    } else {
      this.selectedResourceIds.set(new Set(this.resources().map(r => r.id)));
    }
  }

  shouldShowEvent(event: CalendarEvent): boolean {
    if (!event.resourceId) return true;
    return this.selectedResourceIds().has(event.resourceId);
  }

  toggleEspecialistas() { this.showProfesionales.update(v => !v); }
  toggleSalas() { this.showSalas.update(v => !v); }
  toggleServicios() { this.showServicios.update(v => !v); }

  printAgenda(prof: Professional) { alert(`Imprimiendo agenda de: ${prof.display_name}`); }
  createEvent(prof: Professional, time: string) { alert(`Crear evento para ${prof.display_name} a las ${time}`); }
  actionWaitList() { alert('Mostrar lista de espera'); }
  actionBlockDates() { alert('Mostrar bloqueo de fechas'); }

  getTopPosition(hour: number, min: number): string {
    return `${(hour - this.minHour) * 120 + (min / 30) * 60 + 16}px`;
  }
  getEventTop(event: CalendarEvent): string {
    const d = new Date(event.start); return this.getTopPosition(d.getHours(), d.getMinutes());
  }
  getEventHeight(event: CalendarEvent): string {
    const mins = (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;
    return `${Math.max(mins * 2, 20)}px`;
  }
}
