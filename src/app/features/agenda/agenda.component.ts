import { Component, ChangeDetectionStrategy, computed, signal, OnInit, OnDestroy, inject, Input, Output, EventEmitter, NgZone, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseProfessionalsService, Professional } from '../../services/supabase-professionals.service';
import { SupabaseResourcesService, Resource } from '../../services/supabase-resources.service';
import { ProfessionalBlockedDatesService, ProfessionalBlockedDate } from '../../services/professional-blocked-dates.service';
import { CalendarEvent } from '../calendar/calendar.interface';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './agenda.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block; height: 100%;' },
})
export class AgendaComponent implements OnInit, OnDestroy {
  loading = signal<boolean>(false);
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
  private blockedDatesService = inject(ProfessionalBlockedDatesService);
  private zone = inject(NgZone);

  @Input() set eventsData(val: CalendarEvent[]) { this.events.set(val); }
  @Input() minHour = 8;
  @Input() maxHour = 20;

  @Input() set date(val: Date) {
    if (val) this.currentDate.set(val);
  }
  @Output() dateChange = new EventEmitter<Date>();
  @Output() dateClick = new EventEmitter<{ date: Date; professional?: any }>();

  @Input() set searchQuery(val: string) {
    this.globalSearchTerm.set(val || '');
  }

  @ViewChild('agendaMainScroll') set agendaMainScroll(ref: ElementRef<HTMLDivElement>) {
    if (ref) {
      this.mainGridContainer = ref.nativeElement;
      // Scroll to centered line if already available
      if (this.currentTimeTop() >= 0) {
        setTimeout(() => this.scrollToCurrentTimeCenter(), 50);
      }
    }
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
  mobileFiltersOpen = signal(false);

  // Accordion sections
  showProfesionales = signal(false);
  showServicios = signal(false);
  showSalas = signal(false);

  // Blocked dates
  blockedDates = signal<ProfessionalBlockedDate[]>([]);
  showBlockDatesModal = signal(false);
  blockDateForm = signal<{ professionalId: string; startDate: string; endDate: string; reason: string }>({
    professionalId: '', startDate: '', endDate: '', reason: ''
  });
  blockDateSaving = signal(false);

  // Main scrolling container reference
  private mainGridContainer: HTMLDivElement | null = null;

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
    
    // Normalize function for diacritics and case
    const normalize = (text: string) => 
      text?.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim() || '';

    const globalSearch = normalize(this.globalSearchTerm());
    const agendaSearch = normalize(this.agendaSearchTerm());
    const selectedProfs = this.selectedProfessionalIds();
    const selectedSvcs = this.selectedServiceIds();
    const svcCount = this.availableServices().length;

    const search = globalSearch || agendaSearch;
    if (search) {
      profs = profs.filter(p => {
        const nameMatch = normalize(p.display_name).includes(search);
        const titleMatch = normalize(p.title || '').includes(search);
        const servicesMatch = (p.services || []).some(s => normalize(s.name).includes(search));
        
        return nameMatch || titleMatch || servicesMatch;
      });
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

  constructor() {
    effect(() => {
      const top = this.currentTimeTop();
      if (top >= 0) {
        setTimeout(() => this.scrollToCurrentTimeCenter(), 100);
      }
    });
  }

  ngOnInit() {
    this.loadProfessionals();
    this.loadResources();
    this.loadBlockedDates();
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

  private scrollToCurrentTimeCenter() {
    if (!this.mainGridContainer) return;
    const top = this.currentTimeTop();
    if (top < 0) return;
    const containerHeight = this.mainGridContainer.clientHeight;
    // Center the red line
    this.mainGridContainer.scrollTop = Math.max(0, top - containerHeight / 2);
  }

  loadProfessionals() {
    this.loading.set(true);
    this.professionalsService.getProfessionals().subscribe(profs => {
      this.professionals.set(profs);
      this.selectedProfessionalIds.set(new Set(profs.map(p => p.id)));
      const allSvcIds = new Set<string>();
      profs.forEach(p => (p.services || []).forEach(s => allSvcIds.add(s.id)));
      this.selectedServiceIds.set(allSvcIds);
      this.loading.set(false);
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

  getProfessionalAvailabilityBlocks(prof: Professional): Record<string, string>[] {
    if (this.isDateBlockedForProfessional(prof.id, this.currentDate())) return [];
    if (!prof.schedules) return [];

    const dayOfWeek = this.currentDate().getDay();
    const schedule = prof.schedules.find(s => s.day_of_week === dayOfWeek && s.is_active);
    if (!schedule) return [];

    const parseTime = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h + m / 60;
    };

    const calMin = this.minHour;
    const calMax = this.maxHour;
    const totalHours = calMax - calMin;
    if (totalHours <= 0) return [];

    // Clamp schedule to calendar range
    const schedStart = Math.max(parseTime(schedule.start_time), calMin);
    const schedEnd = Math.min(parseTime(schedule.end_time), calMax);
    if (schedStart >= schedEnd) return [];

    const color = prof.color || '#e5e7eb';
    const makeBlock = (s: number, e: number): Record<string, string> => ({
      'position': 'absolute',
      'top': `${((s - calMin) / totalHours) * 100}%`,
      'height': `${((e - s) / totalHours) * 100}%`,
      'left': '0',
      'right': '0',
      'background-color': color,
      'opacity': '0.1',
      'pointer-events': 'none'
    });

    // Handle break: split into two blocks
    if (schedule.break_start && schedule.break_end) {
      const breakStart = Math.max(parseTime(schedule.break_start), schedStart);
      const breakEnd = Math.min(parseTime(schedule.break_end), schedEnd);
      const blocks: Record<string, string>[] = [];
      if (schedStart < breakStart) blocks.push(makeBlock(schedStart, breakStart));
      if (breakEnd < schedEnd) blocks.push(makeBlock(breakEnd, schedEnd));
      return blocks;
    }

    return [makeBlock(schedStart, schedEnd)];
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

  // Resolves missing professionalId specifically for external events or misaligned syncs
  isEventForProfessional(event: CalendarEvent, profId: string): boolean {
    const pId = event.professionalId || (event as any).extendedProps?.shared?.professionalId;
    
    if (pId) return pId === profId;
    
    // If it STILL has no professionalId, maybe it's purely external meeting. 
    // Show it in the first professional's column for visibility? 
    // Or we strictly return false if it's meant to be orphaned. 
    // Let's check if the first professional in the array matches profId.
    const validProfs = this.filteredProfessionals();
    if (validProfs.length > 0 && validProfs[0].id === profId) {
        return true; 
    }
    return false;
  }

  shouldShowEvent(event: CalendarEvent): boolean {
    if (!event.resourceId) return true;
    if (this.resources().length === 0) return true; // Show until resources loaded
    if (this.resources().length === 0) return true; // Show until resources loaded
    return this.selectedResourceIds().has(event.resourceId);
  }

  toggleEspecialistas() { this.showProfesionales.update(v => !v); }
  toggleSalas() { this.showSalas.update(v => !v); }
  toggleServicios() { this.showServicios.update(v => !v); }

  printAgenda(prof: Professional) { /* TODO: implement print */ }
  createEvent(prof: Professional, time: string) {
    // Prevent creating events on blocked dates
    if (this.isDateBlockedForProfessional(prof.id, this.currentDate())) {
      alert('Esta fecha está bloqueada para ' + prof.display_name + '. No se pueden crear reservas.');
      return;
    }
    const [h, m] = time.split(':').map(Number);
    const d = new Date(this.currentDate());
    d.setHours(h, m, 0, 0);
    this.dateClick.emit({ date: d, professional: prof });
  }
  actionWaitList() { /* TODO: implement wait list */ }

  actionBlockDates() {
    const today = new Date().toISOString().split('T')[0];
    this.blockDateForm.set({ professionalId: '', startDate: today, endDate: today, reason: '' });
    this.showBlockDatesModal.set(true);
  }

  async saveBlockDate() {
    const form = this.blockDateForm();
    if (!form.professionalId || !form.startDate || !form.endDate) return;
    this.blockDateSaving.set(true);
    try {
      await this.blockedDatesService.createBlockedDate({
        professional_id: form.professionalId,
        start_date: form.startDate,
        end_date: form.endDate,
        reason: form.reason || undefined
      });
      this.showBlockDatesModal.set(false);
      this.loadBlockedDates();
    } catch (e) {
      console.error('Error saving blocked date:', e);
    } finally {
      this.blockDateSaving.set(false);
    }
  }

  async removeBlockedDate(id: string) {
    try {
      await this.blockedDatesService.deleteBlockedDate(id);
      this.loadBlockedDates();
    } catch (e) {
      console.error('Error removing blocked date:', e);
    }
  }

  loadBlockedDates() {
    this.blockedDatesService.getBlockedDates().subscribe({
      next: (dates) => this.blockedDates.set(dates),
      error: (err) => console.error('Error loading blocked dates:', err)
    });
  }

  isDateBlockedForProfessional(professionalId: string, date: Date): boolean {
    const dateStr = date.toISOString().split('T')[0];
    return this.blockedDates().some(
      b => b.professional_id === professionalId && b.start_date <= dateStr && b.end_date >= dateStr
    );
  }

  getBlockedDatesForProfessional(professionalId: string): ProfessionalBlockedDate[] {
    return this.blockedDates().filter(b => b.professional_id === professionalId);
  }

  updateBlockDateForm(field: string, value: string) {
    this.blockDateForm.update(f => ({ ...f, [field]: value }));
  }

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
