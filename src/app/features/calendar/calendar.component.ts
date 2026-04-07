import { Component, Input, Output, EventEmitter, computed, signal, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop, CdkDragEnd, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CalendarEvent, CalendarView, CalendarDay, CalendarEventClick, CalendarDateClick } from './calendar.interface';
import { AnimationService } from '../../services/animation.service';
import { AgendaComponent } from '../agenda/agenda.component';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, DragDropModule, AgendaComponent],
  animations: [AnimationService.fadeInUp, AnimationService.slideIn],
  template: `
    <div class="bg-white dark:bg-gray-800 overflow-hidden flex flex-col h-full w-full" @fadeInUp>
      <!-- Header (fixed, never scrolls) -->
      <div 
        class="px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0 transition-colors duration-300"
        [ngClass]="{
          'bg-gradient-to-r from-indigo-500 to-purple-600': currentTheme() === 'light',
          'bg-gray-800 border-b border-gray-700': currentTheme() === 'dark'
        }"
      >
        <div class="flex flex-col md:flex-row md:items-center md:gap-3 gap-3 sm:gap-4">
          <!-- Date + Nav (desktop: shrink-0; mobile: full width) -->
          <div class="flex items-center gap-3 md:shrink-0">
            @if (loading()) {
              <div class="h-8 w-48 bg-white/20 animate-pulse rounded"></div>
            } @else {
              <h2 class="text-xl font-bold text-white tracking-tight whitespace-nowrap">
                {{ formatHeaderDate() }}
              </h2>
            }
            <div class="hidden sm:flex items-center space-x-2">
              <button
                (click)="previousPeriod()"
                class="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-md transition-colors"
                title="Anterior">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <button
                (click)="today()"
                class="px-3 py-1 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 rounded-md transition-colors border border-white/20">
                Hoy
              </button>
              <button
                (click)="nextPeriod()"
                class="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-md transition-colors"
                title="Siguiente">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Mobile Controls Row (hidden on sm+) -->
          <div class="flex flex-wrap items-center justify-between gap-3 sm:hidden border-t border-white/10 pt-3">
            <div class="flex items-center bg-white/10 rounded-lg p-1 border border-white/10">
              <button
                (click)="previousPeriod()"
                class="p-2 text-white hover:bg-white/20 rounded-md transition-colors">
                <i class="fas fa-chevron-left text-sm"></i>
              </button>
              <button
                (click)="today()"
                class="px-4 py-1 text-xs font-bold text-white uppercase tracking-wider">
                Hoy
              </button>
              <button
                (click)="nextPeriod()"
                class="p-2 text-white hover:bg-white/20 rounded-md transition-colors">
                <i class="fas fa-chevron-right text-sm"></i>
              </button>
            </div>

            @if (!loading()) {
              <button
                (click)="onAddEvent()"
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white text-indigo-700 text-xs font-bold uppercase rounded-lg shadow-lg active:scale-95 transition-all">
                <i class="fas fa-plus"></i>
                Nuevo
              </button>
            } @else {
              <div class="flex-1 h-8 bg-white/20 animate-pulse rounded-lg"></div>
            }
          </div>

          <!-- Search + Views + projected controls (desktop: flex-1 single row; mobile: full row) -->
          <div class="flex items-center gap-2 md:flex-1 overflow-hidden">
            <!-- Search bar (desktop only) -->
            <div class="relative hidden md:block flex-1">
              @if (loading()) {
                <div class="w-full h-8 bg-white/10 animate-pulse rounded-lg"></div>
              } @else {
                <i class="fas fa-search absolute left-3 top-2.5 text-white/50"></i>
                <input
                  type="text"
                  [value]="searchQuery()"
                  (input)="searchQuery.set($any($event.target).value)"
                  placeholder="Buscar..."
                  class="w-full border border-white/20 rounded-lg pl-9 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm bg-white/10 text-white placeholder-white/60 backdrop-blur-sm"
                >
              }
            </div>

            <div class="flex bg-black/10 dark:bg-white/5 rounded-lg p-1 overflow-x-auto no-scrollbar shrink-0 border border-white/10">
              @if (loading()) {
                <div class="h-8 w-40 bg-white/10 animate-pulse rounded-md"></div>
              } @else {
                @for (viewType of availableViews(); track viewType) {
                  <button
                    (click)="setView(viewType)"
                    class="flex-1 sm:flex-none px-4 py-1.5 text-[11px] sm:text-sm font-bold rounded-md transition-all whitespace-nowrap uppercase tracking-wide"
                    [ngClass]="currentView().type === viewType
                      ? 'bg-indigo-600 outline outline-2 outline-indigo-500/30 text-white shadow-md transform scale-105'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'">
                    {{ getViewLabel(viewType) }}
                  </button>
                }
              }
            </div>

            <!-- Extra controls projected from parent (e.g. portal URL + settings button) -->
            <ng-content select="[calendarToolbarRight]"></ng-content>
          </div>
        </div>
      </div>

      <!-- Floating Action Button (FAB) -->
      @if (!loading()) {
        <button
          (click)="onAddEvent()"
          class="fab-button transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center transform group"
          title="Nuevo Evento"
        >
          <i class="fas fa-plus group-hover:rotate-90 transition-transform duration-300"></i>
        </button>
      }

      <!-- Calendar content (scrollable/flexible based on view) -->
      <div class="flex-1 flex flex-col min-h-0 relative" [ngClass]="currentView().type === 'agenda' ? '' : 'p-2 md:p-6 overflow-y-auto bg-gray-50 dark:bg-gray-900'">
        @if (loading()) {
          <div class="absolute inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex flex-col p-2 md:p-6 space-y-4">
            <div class="grid grid-cols-7 gap-4 flex-1">
              @for (i of [1,2,3,4,5,6,7]; track i) {
                <div class="flex flex-col space-y-3">
                  <div class="h-6 w-full bg-gray-200 dark:bg-gray-800 animate-pulse rounded"></div>
                  <div class="flex-1 bg-gray-200/50 dark:bg-gray-800/50 animate-pulse rounded-lg border border-gray-200 dark:border-gray-700"></div>
                </div>
              }
            </div>
          </div>
        }
        
        @switch (currentView().type) {
          @case ('month') {
            <div class="month-view" @slideIn>
              <div class="grid gap-px mb-2"
                   [style.grid-template-columns]="'repeat(' + visibleWeekDays().length + ', minmax(0, 1fr))'">
                @for (day of visibleWeekDays(); track day) {
                  <div class="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ day }}
                  </div>
                }
              </div>
              <div class="grid gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden"
                   [style.grid-template-columns]="'repeat(' + visibleWeekDays().length + ', minmax(0, 1fr))'" cdkDropListGroup>
                @for (day of monthDays(); track day.date.getTime()) {
                  <div 
                    class="min-h-[120px] p-2 transition-colors border-b border-r border-gray-100 dark:border-gray-700"
                    [ngClass]="{
                      'bg-white dark:bg-gray-800': isDayWorking(day.date),
                      'bg-gray-100 dark:bg-gray-950': !isDayWorking(day.date), 
                      'cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-900': isDayWorking(day.date),
                      'cursor-not-allowed': !isDayWorking(day.date),
                      'ring-2 ring-indigo-500 z-10': day.isSelected,
                      'relative': true
                    }"
                    (click)="isDayWorking(day.date) && onDateClick(day.date, true, $event)"
                    cdkDropList
                    [cdkDropListData]="day.date"
                    (cdkDropListDropped)="onEventDrop($event)">
                    <div class="flex items-center justify-between mb-1"
                         [class.opacity-40]="!isDayWorking(day.date)">
                      <span class="text-sm font-medium"
                            [ngClass]="{
                              'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded-full': day.isToday,
                              'text-gray-900 dark:text-white': day.isCurrentMonth && !day.isToday,
                              'text-gray-400 dark:text-gray-600': !day.isCurrentMonth
                            }">
                        {{ day.date.getDate() }}
                      </span>
                      @if (day.events.length > 0) {
                        <span class="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-indigo-500 rounded-full">
                          {{ day.events.length }}
                        </span>
                      }
                    </div>
                    <div class="space-y-1" [class.opacity-40]="!isDayWorking(day.date)">
                      @for (event of day.events.slice(0, 3); track event.id) {
                        <div 
                          class="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 transition-opacity text-white"
                          [style.background-color]="event.color || '#6366f1'"
                          (click)="onEventClick(event, $event)"
                          [title]="event.title + (event.description ? ' - ' + event.description : '')"
                          cdkDrag
                          [cdkDragData]="event"
                          [cdkDragDisabled]="event.draggable === false || !editable">
                          {{ event.title }}
                        </div>
                      }
                      @if (day.events.length > 3) {
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-medium pl-1">
                          +{{ day.events.length - 3 }} más
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
          @case ('week') {
            <div class="week-view" @slideIn>
              <div class="grid mb-4 sticky top-0 bg-white dark:bg-gray-800 z-20 border-b border-gray-200 dark:border-gray-700 pb-2"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(' + visibleWeekDays().length + ', 1fr)'">
                <div class="p-2"></div>
                @for (day of visibleWeekDays(); track day) {
                  <div class="p-2 text-center">
                    <div class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ day }}</div>
                    <div class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                      {{ getWeekDayNumber(day) }}
                    </div>
                  </div>
                }
              </div>
              <div class="relative grid bg-white dark:bg-gray-800"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(' + visibleWeekDays().length + ', 1fr)'"
                   cdkDropListGroup>
                <div class="col-span-1 border-r border-gray-100 dark:border-gray-700">
                      @for (slot of visibleSlotStructure(); track slot.hour) {
                           <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative">
                              <span class="absolute top-1 right-2 text-xs text-gray-400 block">
                                 {{ formatHour(slot.hour) }}
                              </span>
                           </div>
                      }
                 </div>
                @for (day of visibleWeekDays(); track day) {
                    <div class="col-span-1 relative border-r border-gray-100 dark:border-gray-700"
                         cdkDropList
                         [cdkDropListData]="getDateForWeekDay(day)"
                         (cdkDropListDropped)="onEventDrop($event)">
                        @for (slot of visibleSlotStructure(); track slot.hour) {
                            <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative cursor-pointer hover:bg-indigo-50/30 transition-colors"
                                 (click)="onDateClick(getDateFor3Day(day), false, $event, slot.hour)">
                                <div class="absolute top-[15px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                <div class="absolute top-[30px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                <div class="absolute top-[45px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                            </div>
                        }
                        <div class="absolute inset-x-0 top-0 mx-1 z-10">
                          @for (event of getEventsForDay(day); track event.id) {
                              <div class="absolute inset-x-0 rounded p-1 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 shadow-sm border-l-4"
                                   [style.top]="getEventTopRelative(event)"
                                   [style.height]="getEventStyle(event).height"
                                   [style.background-color]="getEventStyle(event).backgroundColor"
                                   [style.color]="getEventStyle(event).color"
                                   (click)="onEventClick(event, $event)"
                                   [title]="event.title"
                                   cdkDrag
                                   [cdkDragData]="event"
                                   [cdkDragDisabled]="event.draggable === false || !editable">
                                   <div class="font-semibold truncate">{{ event.title }}</div>
                                   <div class="truncate opacity-80 text-[10px]">{{ formatEventTime(event) }}</div>
                                   @if (event.resourceName) {
                                     <div class="truncate opacity-80 text-[9px] flex items-center gap-0.5 mt-0.5">
                                       <i class="fas fa-door-open" style="font-size:7px"></i>
                                       <span>{{ event.resourceName }}</span>
                                     </div>
                                   }
                              </div>
                          }
                        </div>
                    </div>
                }
              </div>
            </div>
          }
          @case ('3days') {
            <div class="three-day-view" @slideIn>
              <div class="grid mb-4 sticky top-0 bg-white dark:bg-gray-800 z-20 border-b border-gray-200 dark:border-gray-700 pb-2"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(3, 1fr)'">
                <div class="p-2"></div>
                @for (day of visible3Days(); track $index) {
                  <div class="p-2 text-center">
                    <div class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ day }}</div>
                    <div class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                      {{ getDateFor3Day(day).getDate() }}
                    </div>
                  </div>
                }
              </div>
              <div class="relative grid bg-white dark:bg-gray-800"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(3, 1fr)'"
                   cdkDropListGroup>
                 <div class="col-span-1 border-r border-gray-100 dark:border-gray-700">
                      @for (slot of visibleSlotStructure(); track slot.hour) {
                           <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative">
                              <span class="absolute top-1 right-2 text-xs text-gray-400 block">
                                 {{ formatHour(slot.hour) }}
                              </span>
                           </div>
                      }
                 </div>
                @for (day of visible3Days(); track $index) {
                    <div class="col-span-1 relative border-r border-gray-100 dark:border-gray-700"
                         cdkDropList
                         [cdkDropListData]="getDateFor3Day(day)"
                         (cdkDropListDropped)="onEventDrop($event)">
                        @for (slot of visibleSlotStructure(); track slot.hour) {
                            <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative cursor-pointer hover:bg-indigo-50/30 transition-colors"
                                 (click)="onDateClick(getDateFor3Day(day), false, $event)"></div>
                        }
                        @for (event of getEventsForDate(getDateFor3Day(day)); track event.id) {
                            <div class="absolute inset-x-0 mx-1 rounded p-1 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 shadow-sm border-l-4"
                                 [style.top]="getEventTopRelative(event)"
                                 [style.height]="getEventStyle(event).height"
                                 [style.background-color]="getEventStyle(event).backgroundColor"
                                 [style.color]="getEventStyle(event).color"
                                 (click)="onEventClick(event, $event)"
                                 cdkDrag
                                 [cdkDragData]="event">
                                 <div class="font-semibold truncate">{{ event.title }}</div>
                                 @if (event.resourceName) {
                                   <div class="truncate opacity-80 text-[9px] flex items-center gap-0.5 mt-0.5">
                                     <i class="fas fa-door-open" style="font-size:7px"></i>
                                     <span>{{ event.resourceName }}</span>
                                   </div>
                                 }
                            </div>
                        }
                    </div>
                }
              </div>
            </div>
          }
          @case ('day') {
             <div class="day-view" @slideIn>
               <div class="mb-4 sticky top-0 bg-white dark:bg-gray-800 z-20 pb-2 border-b border-gray-200 dark:border-gray-700">
                 <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ formatDayHeader() }}</h3>
               </div>
               <div class="flex relative">
                   <div class="w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-700">
                      @for (slot of visibleSlotStructure(); track slot.hour) {
                          <div class="h-[60px] text-xs text-gray-400 text-right pr-2 relative border-b border-gray-100 dark:border-gray-700">
                             <span class="block pt-1">{{ formatHour(slot.hour) }}</span>
                          </div>
                     }
                   </div>
                   <div class="flex-1 relative" cdkDropList [cdkDropListData]="currentView().date" (cdkDropListDropped)="onEventDrop($event)">
                        @for (slot of visibleSlotStructure(); track slot.hour) {
                             <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-indigo-50/30 transition-colors"
                                  (click)="onDateClick(currentView().date, false, $event, slot.hour)"></div>
                        }
                        @for (event of currentDayEvents(); track event.id) {
                            <div class="absolute left-1 right-1 rounded p-2 text-sm overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 shadow-sm border-l-4"
                                 [style.top]="getEventTopRelative(event)"
                                 [style.height]="getEventStyle(event).height"
                                 [style.background-color]="getEventStyle(event).backgroundColor"
                                 [style.color]="getEventStyle(event).color"
                                 (click)="onEventClick(event, $event)"
                                 cdkDrag
                                 [cdkDragData]="event">
                                 <div class="font-bold mb-0.5">{{ event.title }}</div>
                                 <div class="text-xs">{{ formatEventTime(event) }}</div>
                                 @if (event.resourceName) {
                                   <div class="text-xs opacity-80 flex items-center gap-1 mt-0.5">
                                     <i class="fas fa-door-open" style="font-size:10px"></i>
                                     <span>{{ event.resourceName }}</span>
                                   </div>
                                 }
                            </div>
                        }
                  </div>
              </div>
            </div>
          }
          @case ('agenda') {
            <div class="agenda-view w-full h-full flex flex-col flex-1 min-h-0" @slideIn>
               <app-agenda class="w-full h-full" [minHour]="constraints?.minHour ?? 8" [maxHour]="constraints?.maxHour ?? 20" [date]="currentView().date" [eventsData]="currentDayEvents()" (dateChange)="onAgendaDateChange($event)" (dateClick)="onAgendaDateClick($event)" [searchQuery]="searchQuery()" (eventClick)="onEventClick($event.event, $event.nativeEvent)"></app-agenda>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .day-view { max-height: 800px; overflow-y: auto; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class CalendarComponent implements OnInit {
  loading = signal<boolean>(false);
  private _events = signal<CalendarEvent[]>([]);
  
  // Computed property to safely cache current day's events instead of recreating array every CD cycle
  currentDayEvents = computed(() => {
    return this._events().filter(e => this.isSameDay(e.start, this.currentView().date));
  });
  @Input() set events(val: CalendarEvent[]) { this._events.set(val); }
  get events() { return this._events(); }
  @Input() editable = true;
  @Input() selectable = true;
  private _constraints = signal<any>(null);
  @Input() set constraints(val: any) {
    this._constraints.set(val);
    if (val?.defaultView && !this._initializedWithDefault) {
      this.setView(val.defaultView);
      this._initializedWithDefault = true;
    }
  }
  get constraints() { return this._constraints(); }
  private _initializedWithDefault = false;
  private themeService = inject(ThemeService);
  currentTheme = this.themeService.currentTheme;

  @Output() eventClick = new EventEmitter<CalendarEventClick>();
  @Output() dateClick = new EventEmitter<CalendarDateClick>();
  @Output() addEvent = new EventEmitter<void>();
  @Output() viewChange = new EventEmitter<CalendarView>();
  @Output() eventChange = new EventEmitter<CalendarEvent>();

  currentView = signal<CalendarView>({ type: 'agenda', date: new Date() });
  searchQuery = signal<string>('');
  selectedDate = signal<Date | null>(null);
  isMobile = signal(false);

  weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  visibleWeekDays = computed(() => {
    const workingDays = this.constraints?.workingDays?.map((d: any) => Number(d)) || [];
    if (workingDays.length === 0) return this.weekDays;
    return this.weekDays.filter((_, index) => {
      const jsDay = index === 6 ? 0 : index + 1;
      return workingDays.includes(jsDay);
    });
  });

  visibleSlotStructure = computed(() => {
    const min = this.constraints?.minHour ?? 8;
    const max = this.constraints?.maxHour ?? 20;
    const structure: any[] = [];
    for (let h = min; h <= max; h++) { structure.push({ type: 'hour', hour: h, height: 60 }); }
    return structure;
  });

  monthDays = computed(() => {
    const view = this.currentView();
    const date = view.date;
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const days: CalendarDay[] = [];
    const firstDayOfWeek = firstDayOfMonth.getDay();
    const paddingDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    for (let i = paddingDays; i > 0; i--) {
      const d = new Date(firstDayOfMonth);
      d.setDate(firstDayOfMonth.getDate() - i);
      days.push({
        date: d, isCurrentMonth: false, isToday: this.isSameDay(d, new Date()),
        isSelected: this.selectedDate() ? this.isSameDay(d, this.selectedDate()!) : false,
        events: this.getEventsForDate(d)
      });
    }
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(date.getFullYear(), date.getMonth(), i);
      days.push({
        date: d, isCurrentMonth: true, isToday: this.isSameDay(d, new Date()),
        isSelected: this.selectedDate() ? this.isSameDay(d, this.selectedDate()!) : false,
        events: this.getEventsForDate(d)
      });
    }
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const d = new Date(lastDayOfMonth);
      d.setDate(lastDayOfMonth.getDate() + i);
      days.push({
        date: d, isCurrentMonth: false, isToday: this.isSameDay(d, new Date()),
        isSelected: this.selectedDate() ? this.isSameDay(d, this.selectedDate()!) : false,
        events: this.getEventsForDate(d)
      });
    }
    return days;
  });

  availableViews = computed(() => {
    const baseViews = this.isMobile() ? ['agenda', 'week', 'day'] : ['agenda', 'week', 'day'];
    const enabled = this.constraints?.enabledViews;
    let finalViews = baseViews;
    if (enabled?.length) {
      const filtered = baseViews.filter(v => enabled.includes(v));
      finalViews = filtered.length ? filtered : baseViews;
    }
    return finalViews;
  });

  visible3DaysData = computed(() => {
    const view = this.currentView();
    const currentDate = new Date(view.date);
    const workingDays = this.constraints?.workingDays?.map((d: any) => Number(d)) || [];
    const days: any[] = [];
    let checks = 0;
    while (days.length < 3 && checks < 30) {
      if (!workingDays.length || workingDays.includes(currentDate.getDay())) {
        const jsDay = currentDate.getDay();
        days.push({ name: this.weekDays[jsDay === 0 ? 6 : jsDay - 1], date: new Date(currentDate) });
      }
      currentDate.setDate(currentDate.getDate() + 1);
      checks++;
    }
    return days;
  });

  visible3Days = computed(() => this.visible3DaysData().map(d => d.name));

  ngOnInit() { this.checkMobile(); this.loading.set(true); setTimeout(() => this.loading.set(false), 800); }

  @HostListener('window:resize') onResize() { this.checkMobile(); }

  private checkMobile() {
    if (typeof window !== 'undefined') {
      const mobile = window.innerWidth < 768;
      this.isMobile.set(mobile);
    }
  }

  setView(type: string) {
    this.currentView.update(v => ({ ...v, type: type as any }));
    this.viewChange.emit(this.currentView());
  }

  previousPeriod() { this.adjustDate(-1); }
  nextPeriod() { this.adjustDate(1); }

  private adjustDate(dir: number) {
    const view = this.currentView();
    const d = new Date(view.date);
    if (view.type === 'month') d.setMonth(d.getMonth() + dir);
    else if (view.type === 'week') d.setDate(d.getDate() + (dir * 7));
    else if (view.type === '3days') d.setDate(d.getDate() + (dir * 3));
    else d.setDate(d.getDate() + dir);
    this.currentView.update(v => ({ ...v, date: d }));
    this.viewChange.emit(this.currentView());
  }

  today() { this.currentView.update(v => ({ ...v, date: new Date() })); this.viewChange.emit(this.currentView()); }

  getDateFor3DayByIndex(index: number): Date {
    const data = this.visible3DaysData();
    if (index >= 0 && index < data.length) return new Date(data[index].date);
    return new Date(this.currentView().date);
  }

  formatHeaderDate(): string {
    const view = this.currentView();
    const date = view.date;
    const isMobile = this.isMobile();
    
    switch (view.type) {
      case 'month': return date.toLocaleDateString('es-CL', { year: 'numeric', month: 'long' });
      case 'week': {
        const weekStart = this.getWeekStart(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        if (isMobile) {
          return `${weekStart.getDate()} - ${weekEnd.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`;
        }
        return `${weekStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }
      case '3days': {
        const d1 = this.getDateFor3DayByIndex(0);
        const d3 = this.getDateFor3DayByIndex(2);
        
        if (isMobile) {
          return `${d1.getDate()} - ${d3.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`;
        }
        return `${d1.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} - ${d3.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }
      case 'day':
      case 'agenda': return date.toLocaleDateString('es-CL', { weekday: isMobile ? 'short' : 'long', year: isMobile ? undefined : 'numeric', month: 'long', day: 'numeric' });
      default: return '';
    }
  }

  formatDayHeader(): string { return this.currentView().date.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  
  getViewLabel(viewType: string): string {
    const labels: Record<string, string> = { month: 'Mes', week: 'Semana', '3days': '3 Días', day: 'Día', agenda: 'Agenda' };
    return labels[viewType] || viewType;
  }

  onEventClick(event: CalendarEvent, e: MouseEvent) { e.stopPropagation(); this.eventClick.emit({ event, nativeEvent: e }); }
  onDateClick(date: Date, allDay: boolean, e: MouseEvent, hour?: number) {
    e.stopPropagation();
    const finalDate = new Date(date);
    if (hour !== undefined) {
      finalDate.setHours(hour, 0, 0, 0);
    }
    this.dateClick.emit({ date: finalDate, allDay, nativeEvent: e });
  }
  onAddEvent() { this.addEvent.emit(); }
  onAgendaDateChange(d: Date) { this.currentView.update(v => ({ ...v, date: d })); }
  onAgendaDateClick(e: { date: Date; professional?: any }) { this.dateClick.emit({ date: e.date, allDay: false, nativeEvent: new MouseEvent('click') }); }

  getEventsForDate(date: Date) { return this.events.filter(e => this.isSameDay(e.start, date)); }
  getEventsForDay(dayName: string) { return this.getEventsForDate(this.getDateForWeekDay(dayName)); }
  

  isSameDay(d1: any, d2: any) { d1 = new Date(d1); d2 = d2 || new Date(); return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(); }
  isDayWorking(d: Date) { return !this.constraints?.workingDays?.length || this.constraints.workingDays.includes(d.getDay()); }

  getWeekStart(d: Date) { const s = new Date(d); const day = s.getDay(); s.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return s; }
  getDateForWeekDay(name: string) { const start = this.getWeekStart(this.currentView().date); start.setDate(start.getDate() + this.weekDays.indexOf(name)); return start; }
  getWeekDayNumber(name: string) { return this.getDateForWeekDay(name).getDate(); }
  getDateFor3Day(name: string) { return this.visible3DaysData().find(d => d.name === name)?.date || new Date(); }
  formatHour(h: number) { return `${h}:00`; }
  formatEventTime(e: CalendarEvent) { return `${new Date(e.start).getHours()}:${new Date(e.start).getMinutes().toString().padStart(2, '0')}`; }

  getEventTopRelative(e: CalendarEvent) {
    const start = new Date(e.start);
    const min = this.constraints?.minHour ?? 8;
    return `${(start.getHours() - min) * 60 + start.getMinutes()}px`;
  }

  getEventStyle(e: CalendarEvent) {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const height = Math.max((end.getTime() - start.getTime()) / 60000, 20);
    return { height: `${height}px`, backgroundColor: e.color || '#6366f1', color: '#fff' };
  }

  onEventDrop(e: CdkDragDrop<any>) {
    const event = e.item.data as CalendarEvent;
    const targetDate = new Date(e.container.data);
    const start = new Date(event.start);
    const newStart = new Date(targetDate);
    newStart.setHours(start.getHours(), start.getMinutes());
    const duration = new Date(event.end).getTime() - start.getTime();
    this.eventChange.emit({ ...event, start: newStart, end: new Date(newStart.getTime() + duration) });
  }
}
