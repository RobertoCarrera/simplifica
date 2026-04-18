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
          'bg-gradient-to-r from-blue-500 to-blue-600': currentTheme() === 'light',
          'bg-gray-800 border-b border-gray-700': currentTheme() === 'dark'
        }"
      >
        <div class="flex flex-col gap-3">
          <!-- Date (left) + Settings gear (right) — always visible, same row -->
          <div class="flex items-center justify-between">
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

            <!-- Settings gear — same height as date title -->
            @if (!loading()) {
              <button
                (click)="settingsClick.emit()"
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/20 rounded-lg transition-all text-xs font-bold"
                title="Configuración">
                <i class="fas fa-cog text-xs"></i>
              </button>
            }
          </div>

          <!-- Mobile Controls Row (hidden on sm+): prev/today/next + copy link -->
          <div class="flex items-center justify-between gap-3 sm:hidden border-t border-white/10 pt-3">
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
                (click)="copyLinkClick.emit()"
                class="flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/20 rounded-lg transition-all"
                title="Copiar enlace agenda">
                <i class="fas fa-copy text-xs"></i>
              </button>
            } @else {
              <div class="h-8 w-16 bg-white/20 animate-pulse rounded-lg"></div>
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
                      ? 'bg-blue-600 outline outline-2 outline-blue-500/30 text-white shadow-md transform scale-105'
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
      @if (!loading() && !fabHidden) {
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
                            <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative cursor-pointer hover:bg-blue-50/30 transition-colors"
                                 (click)="onDateClick(getDateFor3Day(day), false, $event, slot.hour)">
                                <div class="absolute top-[15px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                <div class="absolute top-[30px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                <div class="absolute top-[45px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                            </div>
                        }
                        <div class="absolute inset-x-0 top-0 mx-1 z-10">
                          @for (event of getEventsForDay(day); track event.id) {
                              <div class="absolute inset-x-0 rounded p-1 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-all z-10 shadow-sm border-l-4"
                                   [class.opacity-20]="hasActiveSearch() && !isEventMatchingSearch(event)"
                                   [class.ring-2]="hasActiveSearch() && isEventMatchingSearch(event)"
                                   [class.ring-yellow-400]="hasActiveSearch() && isEventMatchingSearch(event)"
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
                            <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative cursor-pointer hover:bg-blue-50/30 transition-colors"
                                 (click)="onDateClick(getDateFor3Day(day), false, $event)"></div>
                        }
                        @for (event of getEventsForDate(getDateFor3Day(day)); track event.id) {
                            <div class="absolute inset-x-0 mx-1 rounded p-1 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-all z-10 shadow-sm border-l-4"
                                 [class.opacity-20]="hasActiveSearch() && !isEventMatchingSearch(event)"
                                 [class.ring-2]="hasActiveSearch() && isEventMatchingSearch(event)"
                                 [class.ring-yellow-400]="hasActiveSearch() && isEventMatchingSearch(event)"
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
          @case ('month') {
            <div class="month-view" @slideIn>
              <div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                @for (dayName of weekDays; track dayName) {
                  <div class="bg-blue-100 dark:bg-blue-900 p-2 text-center text-sm font-semibold text-blue-700 dark:text-blue-200">
                    {{ dayName.substring(0,2) }}
                  </div>
                }
                @for (day of monthDays(); track day.key) {
                  <div
                    class="min-h-[100px] p-1 bg-white dark:bg-gray-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors relative group"
                    [class.opacity-50]="!day.isCurrentMonth"
                    [class.bg-gray-50]="day.isCurrentMonth && !isDayWorking(day.date)"
                    [class.dark:bg-gray-900]="day.isCurrentMonth && !isDayWorking(day.date)"
                    (click)="day.isCurrentMonth && onDateClick(day.date, true, $event)">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm font-medium"
                            [class.text-blue-600]="isSameDay(day.date, todayDate) && day.isCurrentMonth"
                            [class.text-blue-400]="isSameDay(day.date, todayDate) && !day.isCurrentMonth"
                            [class.text-gray-400]="!isSameDay(day.date, todayDate) && !day.isCurrentMonth"
                            [class.dark:text-blue-300]="isSameDay(day.date, todayDate) && day.isCurrentMonth"
                            [class.dark:text-gray-500]="!isSameDay(day.date, todayDate) && day.isCurrentMonth"
                            [class.dark:text-gray-400]="!day.isCurrentMonth">
                        {{ day.date.getDate() }}
                      </span>
                    </div>
                    <div class="space-y-1">
                      @for (event of getEventsForDate(day.date).slice(0, isDayExpanded(day.date) ? undefined : 2); track event.id) {
                        <div class="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 transition-all border-l-2"
                             [class.opacity-20]="hasActiveSearch() && !isEventMatchingSearch(event)"
                             [class.ring-1]="hasActiveSearch() && isEventMatchingSearch(event)"
                             [class.ring-yellow-400]="hasActiveSearch() && isEventMatchingSearch(event)"
                             [style.background-color]="getEventStyle(event).backgroundColor"
                             [style.color]="getEventStyle(event).color"
                             [class.border-l-2]="true"
                             [style.border-left-color]="getEventStyle(event).backgroundColor"
                             (click)="onEventClick(event, $event)">
                          <span class="font-medium">{{ formatEventTime(event) }}</span>
                          <span class="ml-1 truncate">{{ event.title }}</span>
                        </div>
                      }
                      @if (getEventsForDate(day.date).length > 2) {
                        <button
                          class="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-center w-full cursor-pointer hover:underline"
                          (click)="toggleDayExpanded(day.date); $event.stopPropagation()">
                          @if (isDayExpanded(day.date)) {
                            <i class="fas fa-chevron-up mr-1"></i> Ver menos
                          } @else {
                            +{{ getEventsForDate(day.date).length - 2 }} más
                          }
                        </button>
                      }
                    </div>
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
                             <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-blue-50/30 transition-colors"
                                  (click)="onDateClick(currentView().date, false, $event, slot.hour)"></div>
                        }
                        @for (event of currentDayEvents(); track event.id) {
                            <div class="absolute left-1 right-1 rounded p-2 text-sm overflow-hidden cursor-pointer hover:opacity-90 transition-all z-10 shadow-sm border-l-4"
                                 [class.opacity-20]="hasActiveSearch() && !isEventMatchingSearch(event)"
                                 [class.ring-2]="hasActiveSearch() && isEventMatchingSearch(event)"
                                 [class.ring-yellow-400]="hasActiveSearch() && isEventMatchingSearch(event)"
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
               <app-agenda class="w-full h-full" [constraints]="constraints" [date]="currentView().date" [eventsData]="currentDayEvents()" (dateChange)="onAgendaDateChange($event)" (dateClick)="onAgendaDateClick($event)" [searchQuery]="searchQuery()" (eventClick)="onEventClick($event.event, $event.nativeEvent)"></app-agenda>
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
  @Input() fabHidden = false;
  private _constraints = signal<any>(null);
  @Input() set constraints(val: any) {
    const incomingDefault = val?.defaultView;
    this._constraints.set(val);
    // Only call setView if:
    // 1. There's a defaultView, AND
    // 2. _professionalViewApplied is false (reapplyDefaultView hasn't run yet in this session)
    // This ensures: ngAfterViewInit() runs first (reapplyDefaultView), sets _professionalViewApplied=true.
    // THEN if loadCompanySettings() fires its constraint setter, it skips setView (professional wins).
    if (incomingDefault && !this._professionalViewApplied) {
      this.setView(incomingDefault);
      this._lastConstraintDefaultView = incomingDefault;
    }
  }
  get constraints() { return this._constraints(); }
  // Tracks the last defaultView applied by the constraint setter (not user clicks)
  private _lastConstraintDefaultView: string | undefined = undefined;
  // Tracks whether reapplyDefaultView() was already called with the professional's preference.
  // If true, the constraint setter should NOT call setView() (professional view wins).
  // Reset by the parent in ngOnInit so each "session" starts fresh.
  private _professionalViewApplied = false;

  /** Force re-evaluate the current defaultView from constraints and switch to it.
   *  Call this when the parent has updated constraints.defaultView (e.g. after loading
   *  professional preferences). Guards against overriding after a professional view
   *  was already applied in this session. */
  reapplyDefaultView() {
    const incomingDefault = this.constraints?.defaultView;
    if (incomingDefault && this._lastConstraintDefaultView !== incomingDefault) {
      this.setView(incomingDefault);
      this._lastConstraintDefaultView = incomingDefault;
      this._professionalViewApplied = true;
    }
  }
  private themeService = inject(ThemeService);
  currentTheme = this.themeService.currentTheme;

  @Output() eventClick = new EventEmitter<CalendarEventClick>();
  @Output() dateClick = new EventEmitter<CalendarDateClick>();
  @Output() addEvent = new EventEmitter<void>();
  @Output() viewChange = new EventEmitter<CalendarView>();
  @Output() eventChange = new EventEmitter<CalendarEvent>();
  @Output() settingsClick = new EventEmitter<void>();
  @Output() copyLinkClick = new EventEmitter<void>();

  currentView = signal<CalendarView>({ type: 'agenda', date: new Date() });
  searchQuery = signal<string>('');
  selectedDate = signal<Date | null>(null);
  isMobile = signal(false);

  private normalizeText(text: string): string {
    return text
      ?.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim() || '';
  }

  hasActiveSearch = computed(() => !!this.normalizeText(this.searchQuery()));

  isEventMatchingSearch(event: CalendarEvent): boolean {
    const search = this.normalizeText(this.searchQuery());
    if (!search) return true;
    const titleMatch = this.normalizeText(event.title || '').includes(search);
    const resourceMatch = this.normalizeText(event.resourceName || (event as any).extendedProps?.shared?.resourceName || '').includes(search);
    const profMatch = this.normalizeText(event.professionalName || '').includes(search);
    return titleMatch || resourceMatch || profMatch;
  }

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

  // Computed: slot structure for current view date
  visibleSlotStructure = computed(() => this.getSlotStructureForDate(this.currentView().date));

  // Returns slot structure for any given date — per-day schedule or global fallback.
  getSlotStructureForDate(date: Date): any[] {
    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...6=Sat
    const daySchedules = (this.constraints?.schedules || []).filter(
      (s: any) => Number(s.day_of_week) === dayOfWeek,
    );
    if (daySchedules.length === 0) {
      const min = this.constraints?.minHour ?? 8;
      const max = this.constraints?.maxHour ?? 20;
      const structure: any[] = [];
      for (let h = min; h <= max; h++) structure.push({ type: 'hour', hour: h, height: 60 });
      return structure;
    }
    const structure: any[] = [];
    for (const schedule of daySchedules) {
      const startH = parseInt(schedule.start_time.split(':')[0], 10);
      const endH = parseInt(schedule.end_time.split(':')[0], 10) + 1; // +1 buffer
      for (let h = startH; h <= endH; h++) {
        if (!structure.some(s => s.hour === h)) structure.push({ type: 'hour', hour: h, height: 60 });
      }
    }
    return structure.sort((a, b) => a.hour - b.hour);
  }

  availableViews = computed(() => {
    // Logic: 
    // - If enabledViews is set → use it (owner or professional's configured views)
    // - If NOT set → owner fallback to baseViews (which includes 'agenda')
    // - Professionals ALWAYS have enabledViews set (via bookingConstraints in parent)
    // - 'agenda' is NEVER in a professional's calendar_views (enforced in self-settings)
    const baseViews = ['agenda', 'week', '3days', 'day', 'month'];
    const enabled = this.constraints?.enabledViews;
    if (enabled?.length) {
      // ALWAYS use enabledViews directly — never fall back to baseViews
      // This means: owner with enabledViews = all views, or professional with their configured views
      return enabled;
    }
    // Only reached for owner (no enabledViews = unrestricted)
    return baseViews;
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

  // Expanded days for month view - tracks which day cells are expanded to show all events
  expandedDays = signal<Set<string>>(new Set());
  todayDate = new Date();

  monthDays = computed(() => {
    const view = this.currentView();
    const date = view.date;
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = (firstDay.getDay() + 6) % 7; // Monday = 0
    const days: any[] = [];
    
    // Previous month padding
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, key: this.dayKey(d), isCurrentMonth: false });
    }
    
    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, key: this.dayKey(d), isCurrentMonth: true });
    }
    
    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, key: this.dayKey(d), isCurrentMonth: false });
    }
    
    return days;
  });

ngOnInit() { 
    this.checkMobile(); 
    this.loading.set(true); 
    setTimeout(() => this.loading.set(false), 800); 
  }

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
    if (view.type === 'week') d.setDate(d.getDate() + (dir * 7));
    else if (view.type === '3days') d.setDate(d.getDate() + (dir * 3));
    else if (view.type === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir);
    this.currentView.update(v => ({ ...v, date: d }));
    this.viewChange.emit(this.currentView());
  }

  today() { 
    const newDate = new Date();
    this.currentView.update(v => ({ ...v, date: newDate }));
    this.viewChange.emit(this.currentView()); 
  }

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
  onAgendaDateChange(d: Date) { 
    this.currentView.update(v => ({ ...v, date: d })); 
  }
  onAgendaDateClick(e: { date: Date; professional?: any }) { this.dateClick.emit({ date: e.date, allDay: false, nativeEvent: new MouseEvent('click') }); }

  getEventsForDate(date: Date) { return this.events.filter(e => this.isSameDay(e.start, date)); }
  getEventsForDay(dayName: string) { return this.getEventsForDate(this.getDateForWeekDay(dayName)); }
  

  isSameDay(d1: any, d2: any) { d1 = new Date(d1); d2 = d2 || new Date(); return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(); }
  isDayWorking(d: Date) { return !this.constraints?.workingDays?.length || this.constraints.workingDays.includes(d.getDay()); }

  dayKey(d: Date): string { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
  isDayExpanded(d: Date): boolean { return this.expandedDays().has(this.dayKey(d)); }
  toggleDayExpanded(d: Date) {
    const key = this.dayKey(d);
    this.expandedDays.update(set => {
      const next = new Set(set);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }


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
