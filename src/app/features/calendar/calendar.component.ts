import { Component, Input, Output, EventEmitter, computed, signal, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarEvent, CalendarView, CalendarDay, CalendarEventClick, CalendarDateClick } from './calendar.interface';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule],
  animations: [AnimationService.fadeInUp, AnimationService.slideIn],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden" @fadeInUp>
      <!-- Header -->
      <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <h2 class="text-xl font-semibold text-white">
              {{ formatHeaderDate() }}
            </h2>
            <div class="flex items-center space-x-2">
              <button
                (click)="previousPeriod()"
                class="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-md transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <button
                (click)="today()"
                class="px-3 py-1 text-sm font-medium text-white hover:bg-white hover:bg-opacity-20 rounded-md transition-colors">
                Hoy
              </button>
              <button
                (click)="nextPeriod()"
                class="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-md transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
          
          <div class="flex items-center space-x-2">
            <!-- View selector -->
            <div class="flex bg-white bg-opacity-20 rounded-md p-1">
              @for (viewType of availableViews(); track viewType) {
                <button
                  (click)="setView(viewType)"
                  class="px-3 py-1 text-sm font-medium text-white rounded transition-colors"
                  [ngClass]="currentView().type === viewType 
                    ? 'bg-white bg-opacity-30' 
                    : 'hover:bg-white hover:bg-opacity-20'">
                  {{ getViewLabel(viewType) }}
                </button>
              }
            </div>
            
            <!-- Add event button -->
            <button
              (click)="onAddEvent()"
              class="inline-flex items-center px-4 py-2 bg-white text-indigo-600 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Nuevo Evento
            </button>
          </div>
        </div>
      </div>

      <!-- Calendar content -->
      <div class="p-6">
        @switch (currentView().type) {
          @case ('month') {
            <div class="month-view" @slideIn>
              <!-- Month header with days -->
              <div class="grid gap-px mb-2"
                   [style.grid-template-columns]="'repeat(' + visibleWeekDays().length + ', minmax(0, 1fr))'">
                @for (day of visibleWeekDays(); track day) {
                  <div class="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ day }}
                  </div>
                }
              </div>
              
              <!-- Month grid -->
              <div class="grid gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden"
                   [style.grid-template-columns]="'repeat(' + visibleWeekDays().length + ', minmax(0, 1fr))'">
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
                    (click)="isDayWorking(day.date) && onDateClick(day.date, true, $event)">
                    
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
                    
                    <!-- Events preview -->
                    <div class="space-y-1" [class.opacity-40]="!isDayWorking(day.date)">
                      @for (event of day.events.slice(0, 3); track event.id) {
                        <div 
                          class="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 transition-opacity text-white"
                          [style.background-color]="event.color || '#6366f1'"
                          (click)="onEventClick(event, $event)"
                          [title]="event.title + (event.description ? ' - ' + event.description : '')">
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
            <div class="week-view h-[600px] overflow-y-auto" @slideIn>
              <!-- Week header -->
              <div class="grid mb-4 sticky top-0 bg-white dark:bg-gray-800 z-20 border-b border-gray-200 dark:border-gray-700 pb-2"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(' + currentWeekDays.length + ', 1fr)'">
                <div class="p-2"></div> <!-- Time column header -->
                @for (day of currentWeekDays; track day) {
                  <div class="p-2 text-center">
                    <div class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ day }}</div>
                    <div class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                      {{ getWeekDayNumber(day) }}
                    </div>
                  </div>
                }
              </div>
              
              <!-- Week grid Container -->
              <div class="relative grid bg-white dark:bg-gray-800"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(' + currentWeekDays.length + ', 1fr)'">
                
                 <!-- Time Column -->
                 <div class="col-span-1 border-r border-gray-100 dark:border-gray-700">
                      @for (slot of currentHourSlots; track slot) {
                           @if (slot.type === 'hour') {
                               <!-- Hour Marker -->
                               <div class="h-[60px] border-b border-transparent relative">
                                  <span class="absolute top-1 right-2 text-xs text-gray-400 block">
                                     {{ formatHour(slot.hour) }}
                                  </span>
                               </div>
                           } @else {
                               <!-- Gap Marker -->
                               <div class="h-[20px] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMiIgc3Ryb2tlPSIjOTY5Njk2IiBzdHJva2Utd2lkdGg9IjEiIG9wYWNpdHk9IjAuNSIvPjwvc3ZnPg==')] opacity-50 border-y border-gray-300 dark:border-gray-600"></div>
                           }
                      }
                 </div>

                <!-- Day Columns -->
                @for (day of currentWeekDays; track day) {
                    <div class="col-span-1 relative border-r border-gray-100 dark:border-gray-700"
                         [style.min-height]="'100%'">
                        <!-- Background Grid Lines -->
                        @for (slot of currentHourSlots; track slot) {
                            @if (slot.type === 'hour') {
                                <div class="h-[60px] border-b border-gray-50 dark:border-gray-700 pointer-events-none relative"></div>
                            } @else {
                                <div class="h-[20px] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMiIgc3Ryb2tlPSIjOTY5Njk2IiBzdHJva2Utd2lkdGg9IjEiIG9wYWNpdHk9IjAuNSIvPjwvc3ZnPg==')] opacity-30 border-y border-gray-100 dark:border-gray-700 pointer-events-none"></div>
                            }
                        }

                        <!-- Click Overlay (for creating events) -->
                        <div class="absolute inset-0 z-0 flex flex-col">
                             @for (slot of currentHourSlots; track slot) {
                                @if (slot.type === 'hour') {
                                    <div class="h-[60px] border-b border-transparent transition-colors"
                                         [ngClass]="{
                                            'bg-gray-200 dark:bg-gray-900': !isSlotAvailable(getWeekDayIndex(day), slot.hour),
                                            'cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800': isSlotAvailable(getWeekDayIndex(day), slot.hour),
                                            'cursor-not-allowed': !isSlotAvailable(getWeekDayIndex(day), slot.hour)
                                         }"
                                         (click)="onTimeSlotClick(day, slot.hour, $event)">
                                    </div>
                                } @else {
                                    <div class="h-[20px] cursor-not-allowed bg-transparent"></div>
                                }
                            }
                        </div>

                        <!-- Absolute Events -->
                        @for (event of getEventsForDay(day); track event.id) {
                            <div class="absolute inset-x-0 mx-1 rounded p-1 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 shadow-sm border-l-4"
                                 [style.top]="getEventTopRelative(event)"
                                 [style.height]="getEventStyle(event).height"
                                 [style.background-color]="getEventStyle(event).backgroundColor"
                                 [style.color]="getEventStyle(event).color"
                                 [style.border-color]="getTextColor(event.color || '#6366f1')" 
                                 (click)="onEventClick(event, $event)"
                                 [title]="event.title">
                                 <div class="font-semibold truncate">{{ event.title }}</div>
                                 <div class="truncate opacity-80 text-[10px]">{{ formatEventTime(event) }}</div>
                                 @if (event.location) {
                                    <div class="truncate opacity-75 hidden sm:block">{{ event.location }}</div>
                                 }
                            </div>
                        }
                    </div>
                }
              </div>
            </div>
          }
          
          @case ('day') {
             <div class="day-view h-[600px] overflow-y-auto" @slideIn>
               <!-- Day header -->
               <div class="mb-4 sticky top-0 bg-white dark:bg-gray-800 z-20 pb-2 border-b border-gray-200 dark:border-gray-700">
                 <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                   {{ formatDayHeader() }}
                 </h3>
               </div>

               <div class="flex relative"
                    [style.min-height]="(currentHourSlots.length * 60) + 'px'">
                   <!-- Time Column -->
                   <div class="w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-700">
                      @for (slot of currentHourSlots; track slot) {
                          @if (slot.type === 'hour') {
                              <div class="h-[60px] text-xs text-gray-400 text-right pr-2 relative">
                                 <span class="block pt-1">
                                    {{ formatHour(slot.hour) }}
                                 </span>
                              </div>
                          } @else {
                              <div class="h-[20px] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMiIgc3Ryb2tlPSIjOTY5Njk2IiBzdHJva2Utd2lkdGg9IjEiIG9wYWNpdHk9IjAuNSIvPjwvc3ZnPg==')] opacity-50 border-y border-gray-300 dark:border-gray-600"></div>
                          }
                     }
                   </div>

                   <!-- Day Content -->
                   <div class="flex-1 relative">
                        <!-- Background Lines -->
                        @for (slot of currentHourSlots; track slot) {
                             @if (slot.type === 'hour') {
                                 <div class="h-[60px] border-b border-gray-50 dark:border-gray-700 pointer-events-none relative"></div>
                             } @else {
                                 <div class="h-[20px] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMiIgc3Ryb2tlPSIjOTY5Njk2IiBzdHJva2Utd2lkdGg9IjEiIG9wYWNpdHk9IjAuNSIvPjwvc3ZnPg==')] opacity-30 border-y border-gray-100 dark:border-gray-700 pointer-events-none"></div>
                             }
                        }

                        <!-- Click Overlay -->
                        <div class="absolute inset-0 z-0 flex flex-col">
                             @for (slot of currentHourSlots; track slot) {
                                @if (slot.type === 'hour') {
                                    <div class="h-[60px] border-b border-transparent transition-colors"
                                         [ngClass]="{
                                            'bg-gray-200 dark:bg-gray-900': !isSlotAvailable(currentView().date.getDay(), slot.hour),
                                            'cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800': isSlotAvailable(currentView().date.getDay(), slot.hour),
                                            'cursor-not-allowed': !isSlotAvailable(currentView().date.getDay(), slot.hour)
                                         }"
                                         (click)="onTimeSlotClick('day', slot.hour, $event)">
                                    </div>
                                } @else {
                                    <div class="h-[20px] cursor-not-allowed bg-transparent"></div>
                                }
                            }
                        </div>

                         <!-- Events -->
                        @for (event of getCurrentDayEvents(); track event.id) {
                            <div class="absolute left-1 right-1 rounded p-2 text-sm overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 shadow-sm border-l-4"
                                 [style.top]="getEventTopRelative(event)"
                                 [style.height]="getEventStyle(event).height"
                                 [style.background-color]="getEventStyle(event).backgroundColor"
                                 [style.color]="getEventStyle(event).color"
                                  [style.border-color]="getTextColor(event.color || '#6366f1')" 
                                 (click)="onEventClick(event, $event)">
                                 <div class="font-bold mb-0.5">{{ event.title }}</div>
                                 <div class="text-xs opacity-90 mb-1 flex items-center">
                                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    {{ formatEventTime(event) }}
                                 </div>
                                 @if (event.description) {
                                    <div class="text-xs opacity-80 line-clamp-2 italic">{{ event.description }}</div>
                                 }
                                  @if (event.location) {
                                    <div class="text-xs opacity-80 mt-1 flex items-center">
                                       <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                       {{ event.location }}
                                    </div>
                                 }
                            </div>
                        }
                  </div>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .day-view {
      max-height: 800px;
      overflow-y: auto;
    }
  `]
})
export class CalendarComponent implements OnInit {
  @Input() events: CalendarEvent[] = [];
  @Input() editable = true;
  @Input() selectable = true;
  @Input() constraints: { minHour: number; maxHour: number; workingDays: number[]; schedules?: any[] } | null = null;

  @Output() eventClick = new EventEmitter<CalendarEventClick>();
  @Output() dateClick = new EventEmitter<CalendarDateClick>();
  @Output() addEvent = new EventEmitter<void>();
  @Output() viewChange = new EventEmitter<CalendarView>();

  currentView = signal<CalendarView>(
    {
      type: 'month',
      date: new Date()
    }
  );

  selectedDate = signal<Date | null>(null);

  // Computed properties for constraints

  // Map day index (0-6) to day name
  private dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']; // Start on Monday

  // Computed days for week view based on constraints
  visibleWeekDays = computed(() => {
    if (!this.constraints || !this.constraints.workingDays) return this.weekDays;

    // Filter weekDays to only include those in constraints.workingDays
    // weekDays is ['Lun', 'Mar', ...]
    // constraints.workingDays is [1, 2, ...] where 1=Mon, 0=Sun.

    return this.weekDays.filter(dayName => {
      const dayIndex = this.getWeekDayIndex(dayName); // 0=Sun, 1=Mon
      return this.constraints!.workingDays.includes(dayIndex);
    });
  });

  // Computed hours based on constraints
  hourSlots = Array.from({ length: 24 }, (_, i) => i); // Default fallback

  // Structure for slots with gaps
  visibleSlotStructure = computed(() => {
    let min = 0;
    let max = 24;

    if (this.constraints) {
      min = this.constraints.minHour;
      max = this.constraints.maxHour;
    }

    if (max <= min) { min = 0; max = 24; }

    const slots: { type: 'hour' | 'gap', hour: number, height: number }[] = [];

    // 1. Identify valid hours
    const validHours: number[] = [];
    for (let i = min; i < max; i++) {
      if (this.isHourGloballyUsed(i)) {
        validHours.push(i);
      }
    }

    // 2. Build slots with gaps
    for (let i = 0; i < validHours.length; i++) {
      const h = validHours[i];
      slots.push({ type: 'hour', hour: h, height: 60 });

      // Check for gap
      if (i < validHours.length - 1) {
        const nextH = validHours[i + 1];
        if (nextH > h + 1) {
          // Found a gap (e.g. 13 -> 16)
          slots.push({ type: 'gap', hour: h, height: 20 });
        }
      }
    }
    return slots;
  });

  // Check if an hour is available in AT LEAST ONE working day
  private isHourGloballyUsed(hour: number): boolean {
    if (!this.constraints) return true;
    // If no detailed schedules, fallback to min/max simple range (which is ALREADY handled by the loop bounds)
    if (!this.constraints.schedules || this.constraints.schedules.length === 0) return true;

    // If filtering is active, check against all WORKING days
    const workingDays = this.constraints.workingDays || [];
    if (workingDays.length === 0) return true;

    // If ANY working day has this slot available, we must show it.
    return workingDays.some(dayIndex => this.isSlotAvailable(dayIndex, hour));
  }

  monthDays = computed(() => {
    const view = this.currentView();
    const year = view.date.getFullYear();
    const month = view.date.getMonth();

    const firstDay = new Date(year, month, 1);
    // Find absolute start date (Monday of the first week)
    const startDay = firstDay.getDay(); // 0=Sun, 1=Mon
    const diff = startDay === 0 ? 6 : startDay - 1;

    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - diff);

    const days: CalendarDay[] = [];
    const today = new Date();
    const selected = this.selectedDate();

    // 6 weeks
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      // Filter out non-working days if we are "optimizing space"
      if (!this.isDayWorking(date)) {
        continue;
      }

      const dayEvents = this.events.filter(event =>
        this.isSameDay(event.start, date)
      );

      days.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday: this.isSameDay(date, today),
        isSelected: selected ? this.isSameDay(date, selected) : false,
        events: dayEvents
      });
    }

    return days;
  });

  isMobile = signal(false);

  availableViews = computed(() => {
    return this.isMobile() ? ['month', 'day'] : ['month', 'week', 'day'];
  });

  ngOnInit() {
    this.checkMobile();
  }

  // Update template iteration variables
  get currentWeekDays() { return this.visibleWeekDays(); }
  get currentHourSlots() { return this.visibleSlotStructure(); }


  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    if (typeof window !== 'undefined') {
      const mobile = window.innerWidth < 768;
      this.isMobile.set(mobile);
      // Force day view if invalid view for mobile is active
      if (mobile && this.currentView().type === 'week') {
        this.setView('day');
      }
    }
  }

  formatHeaderDate(): string {
    const view = this.currentView();
    const date = view.date;

    switch (view.type) {
      case 'month':
        return date.toLocaleDateString('es-CL', {
          year: 'numeric',
          month: 'long'
        });
      case 'week':
        const weekStart = this.getWeekStart(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        return `${weekStart.toLocaleDateString('es-CL', {
          day: 'numeric',
          month: 'short'
        })
          } - ${weekEnd.toLocaleDateString('es-CL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
          } `;
      case 'day':
        return date.toLocaleDateString('es-CL', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      default:
        return '';
    }
  }

  formatDayHeader(): string {
    return this.currentView().date.toLocaleDateString('es-CL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getViewLabel(viewType: string): string {
    const labels = {
      month: 'Mes',
      week: 'Semana',
      day: 'Día'
    };
    return labels[viewType as keyof typeof labels] || viewType;
  }

  setView(type: string) {
    const validType = type as 'month' | 'week' | 'day';
    this.currentView.update(view => ({ ...view, type: validType }));
    this.viewChange.emit(this.currentView());
  }

  previousPeriod() {
    const view = this.currentView();
    const newDate = new Date(view.date);

    switch (view.type) {
      case 'month':
        newDate.setMonth(newDate.getMonth() - 1);
        break;
      case 'week':
        newDate.setDate(newDate.getDate() - 7);
        break;
      case 'day':
        newDate.setDate(newDate.getDate() - 1);
        break;
    }

    this.currentView.update(v => ({ ...v, date: newDate }));
    this.viewChange.emit(this.currentView());
  }

  nextPeriod() {
    const view = this.currentView();
    const newDate = new Date(view.date);

    switch (view.type) {
      case 'month':
        newDate.setMonth(newDate.getMonth() + 1);
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + 7);
        break;
      case 'day':
        newDate.setDate(newDate.getDate() + 1);
        break;
    }

    this.currentView.update(v => ({ ...v, date: newDate }));
    this.viewChange.emit(this.currentView());
  }

  today() {
    this.currentView.update(view => ({ ...view, date: new Date() }));
    this.viewChange.emit(this.currentView());
  }

  onDateClick(date: Date, allDay: boolean, event: MouseEvent) {
    event.stopPropagation();
    this.selectedDate.set(date);
    this.dateClick.emit({ date, allDay, nativeEvent: event });
  }

  onEventClick(calendarEvent: CalendarEvent, event: MouseEvent) {
    event.stopPropagation();
    this.eventClick.emit({
      event: calendarEvent,
      nativeEvent: event
    });
  }

  onTimeSlotClick(dayOrView: string, hour: number, event: MouseEvent) {
    const slotDate = new Date();

    if (dayOrView !== 'day' && this.weekDays.includes(dayOrView)) {
      const view = this.currentView();
      const weekStart = this.getWeekStart(view.date);
      const dayIndex = this.weekDays.indexOf(dayOrView);
      slotDate.setTime(weekStart.getTime());
      slotDate.setDate(weekStart.getDate() + dayIndex);
    } else {
      const view = this.currentView();
      slotDate.setTime(view.date.getTime());
    }

    const jsDayIndex = slotDate.getDay();

    if (!this.isSlotAvailable(jsDayIndex, hour)) {
      return;
    }

    slotDate.setHours(hour, 0, 0, 0);
    this.onDateClick(slotDate, false, event);
  }

  onAddEvent() {
    this.addEvent.emit();
  }

  getWeekStart(date: Date): Date {
    const start = new Date(date);
    const day = start.getDay(); // 0 is Sunday
    const diff = day === 0 ? 6 : day - 1;

    start.setDate(date.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  getWeekDayNumber(dayName: string): number {
    const view = this.currentView();
    const weekStart = this.getWeekStart(view.date);
    const dayIndex = this.weekDays.indexOf(dayName);
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    return date.getDate();
  }

  formatHour(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  // Deprecated usage in template, but kept for compatibility logic if needed
  getHourEvents(dayName: string, hour: number): CalendarEvent[] {
    return [];
  }

  getDayHourEvents(hour: number): CalendarEvent[] {
    return [];
  }

  // NEW METHODS FOR ABSOLUTE POSITIONING

  getEventsForDay(dayName: string): CalendarEvent[] {
    const view = this.currentView();
    const weekStart = this.getWeekStart(view.date);
    const dayIndex = this.weekDays.indexOf(dayName);
    const targetDate = new Date(weekStart);
    targetDate.setDate(weekStart.getDate() + dayIndex);

    return this.events.filter(event =>
      this.isSameDay(event.start, targetDate) && !event.allDay
    );
  }

  // For Day View
  getCurrentDayEvents(): CalendarEvent[] {
    const view = this.currentView();
    return this.events.filter(event =>
      this.isSameDay(event.start, view.date) && !event.allDay
    );
  }

  getEventTopRelative(event: CalendarEvent): string {
    const slots = this.visibleSlotStructure();
    const startHour = event.start.getHours();

    // Calculate cumulative height until we reach the start index
    // Note: Event minutes (0-59) adds pixel offset within the 'hour' slot.

    let topPx = 0;
    let found = false;

    for (const slot of slots) {
      if (slot.type === 'gap') {
        topPx += slot.height;
        continue;
      }

      // It is an hour slot
      if (slot.hour === startHour) {
        // Found start hour
        topPx += event.start.getMinutes(); // 1 min = 1px (assuming 60px slot)
        found = true;
        break;
      } else if (slot.hour < startHour) {
        topPx += slot.height;
      } else {
        // We passed it? (Should not happen if slots are sorted)
      }
    }

    if (!found) {
      return '-9999px';
    }

    return `${topPx}px`;
  }

  getEventStyle(event: CalendarEvent): any {
    const baseStyle = {
      backgroundColor: event.color || '#6366f1',
      color: this.getTextColor(event.color || '#6366f1')
    };

    const slots = this.visibleSlotStructure();
    const startH = event.start.getHours();
    const endH = event.end.getHours();
    const startM = event.start.getMinutes();
    const endM = event.end.getMinutes();

    const startTotalMin = startH * 60 + startM;
    const endTotalMin = endH * 60 + endM;

    let heightPx = 0;

    // Iterate slots and sum visible intersections
    slots.forEach((slot: { type: 'hour' | 'gap', hour: number, height: number }) => {
      if (slot.type === 'gap') {
        // Does the event span across this gap?
        // Simplification: If event start < Gap Start Time AND event end > Gap End Time (next slot start).
        // We will handle via physics of "does event cross this gap" later if precise.
      } else {
        // Hour slot
        const slotStartMin = slot.hour * 60;
        const slotEndMin = (slot.hour + 1) * 60;

        const overlapStart = Math.max(startTotalMin, slotStartMin);
        const overlapEnd = Math.min(endTotalMin, slotEndMin);

        if (overlapEnd > overlapStart) {
          heightPx += (overlapEnd - overlapStart);
        }
      }
    });

    const topPx = parseFloat(this.getEventTopRelative(event));
    if (topPx < 0) return { display: 'none' }; // Hidden

    // Calc Bottom Px
    let bottomPx = 0;
    let foundEnd = false;

    for (const slot of slots) {
      if (slot.type === 'gap') {
        const gapStartMin = (slot.hour + 1) * 60;
        if (endTotalMin > gapStartMin) {
          bottomPx += slot.height;
        }
        continue;
      }

      // Hour slot
      if (slot.hour === endH) {
        bottomPx += endM;
        foundEnd = true;
        break;
      } else if (slot.hour < endH) {
        bottomPx += slot.height;
      }
    }

    if (!foundEnd) {
      // Fix: if endH > last slot?
      if (slots.length > 0 && endH > slots[slots.length - 1].hour) {
        bottomPx = slots.reduce((acc: number, s: { type: 'hour' | 'gap', hour: number, height: number }) => acc + s.height, 0);
      }
    }

    heightPx = bottomPx - topPx;
    if (heightPx < 15) heightPx = 15;

    return {
      height: `${heightPx}px`,
      ...baseStyle
    };
  }

  formatEventTime(event: CalendarEvent): string {
    const start = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const end = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${start} - ${end}`;
  }

  getTextColor(backgroundColor: string): string {
    if (!backgroundColor) return '#ffffff';
    // Simple contrast calculation
    const hex = backgroundColor.replace('#', '');
    // Handle short hex
    const fullHex = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;

    const r = parseInt(fullHex.substr(0, 2), 16);
    const g = parseInt(fullHex.substr(2, 2), 16);
    const b = parseInt(fullHex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  // Check if a specific slot is available
  isSlotAvailable(dayIndex: number, hour: number): boolean {
    if (!this.constraints || !this.constraints.schedules || this.constraints.schedules.length === 0) {
      return true; // If no constraints, assume available or rely on workingDays
    }

    // First check workingDays
    if (this.constraints.workingDays && !this.constraints.workingDays.includes(dayIndex)) {
      return false;
    }

    const schedules = this.constraints.schedules.filter((s: any) => s.day_of_week === dayIndex);
    if (schedules.length === 0) return false;

    // Check if hour falls within ANY schedule
    // Schedules are like 09:00:00 to 13:00:00
    // If hour is 9, it is valid if start <= 9 and end > 9.

    return schedules.some((s: any) => {
      const startH = parseInt(s.start_time.split(':')[0], 10);
      let endH = parseInt(s.end_time.split(':')[0], 10);
      const endM = parseInt(s.end_time.split(':')[1], 10);
      if (endM > 0) endH++;

      return hour >= startH && hour < endH;
    });
  }

  // Check if there is a gap after this hour (next visible slot is not hour + 1)
  hasGapAfter(hour: number): boolean {
    const slots = this.visibleSlotStructure();
    const currentHourSlotIndex = slots.findIndex(s => s.type === 'hour' && s.hour === hour);

    if (currentHourSlotIndex === -1 || currentHourSlotIndex === slots.length - 1) {
      return false; // Not found or last slot
    }

    // Check if the next slot is a gap
    return slots[currentHourSlotIndex + 1].type === 'gap';
  }

  isDayWorking(date: Date): boolean {
    if (!this.constraints || !this.constraints.workingDays) return true;
    return this.constraints.workingDays.includes(date.getDay());
  }

  getWeekDayIndex(dayName: string): number {
    // Map 'Dom' -> 0, etc.
    // this.dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return this.dayNames.indexOf(dayName);
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
}
