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
              <div class="grid grid-cols-7 gap-px mb-2">
                @for (day of weekDays; track day) {
                  <div class="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ day }}
                  </div>
                }
              </div>
              
              <!-- Month grid -->
              <div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                @for (day of monthDays(); track day.date.getTime()) {
                  <div 
                    class="bg-white dark:bg-gray-800 min-h-[120px] p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    [ngClass]="{
                      'opacity-50': !day.isCurrentMonth,
                      'ring-2 ring-indigo-500': day.isSelected,
                      'bg-indigo-50 dark:bg-indigo-900': day.isToday
                    }"
                    (click)="onDateClick(day.date, true, $event)">
                    
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm font-medium"
                            [ngClass]="{
                              'text-indigo-600 dark:text-indigo-400': day.isToday,
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
                    <div class="space-y-1">
                      @for (event of day.events.slice(0, 3); track event.id) {
                        <div 
                          class="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 transition-opacity"
                          [style.background-color]="event.color || '#6366f1'"
                          [style.color]="getTextColor(event.color || '#6366f1')"
                          (click)="onEventClick(event, $event)"
                          [title]="event.title + (event.description ? ' - ' + event.description : '')">
                          {{ event.title }}
                        </div>
                      }
                      @if (day.events.length > 3) {
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-medium">
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
              <!-- Week header -->
              <div class="grid grid-cols-8 gap-px mb-4">
                <div class="p-2"></div> <!-- Time column header -->
                @for (day of weekDays; track day) {
                  <div class="p-2 text-center">
                    <div class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ day }}</div>
                    <div class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                      {{ getWeekDayNumber(day) }}
                    </div>
                  </div>
                }
              </div>
              
              <!-- Week grid -->
              <div class="grid grid-cols-8 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                @for (hour of hourSlots; track hour) {
                  <div class="bg-white dark:bg-gray-800 p-2 text-sm text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                    {{ formatHour(hour) }}
                  </div>
                  @for (day of weekDays; track day) {
                    <div
                      class="bg-white dark:bg-gray-800 min-h-[60px] p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-r border-gray-200 dark:border-gray-700"
                      (click)="onTimeSlotClick(day, hour, $event)">
                      <!-- Hour events will be rendered here -->
                      @for (event of getHourEvents(day, hour); track event.id) {
                        <div
                          class="text-xs p-1 rounded mb-1 cursor-pointer hover:opacity-80 transition-opacity"
                          [style.background-color]="event.color || '#6366f1'"
                          [style.color]="getTextColor(event.color || '#6366f1')"
                          (click)="onEventClick(event, $event)"
                          [title]="event.title + (event.description ? ' - ' + event.description : '')">
                          {{ event.title }}
                        </div>
                      }
                    </div>
                  }
                }
              </div>
            </div>
          }
          
          @case ('day') {
            <div class="day-view" @slideIn>
              <!-- Day header -->
              <div class="mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ formatDayHeader() }}
                </h3>
              </div>

              <!-- Day timeline -->
              <div class="space-y-1">
                @for (hour of hourSlots; track hour) {
                  <div class="flex items-start border-b border-gray-100 dark:border-gray-700 pb-2">
                    <div class="w-20 flex-shrink-0 text-sm text-gray-500 dark:text-gray-400 pt-2">
                      {{ formatHour(hour) }}
                    </div>
                    <div
                      class="flex-1 min-h-[60px] p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
                      (click)="onTimeSlotClick('day', hour, $event)">
                      @for (event of getDayHourEvents(hour); track event.id) {
                        <div
                          class="text-sm p-2 rounded mb-2 cursor-pointer hover:opacity-80 transition-opacity"
                          [style.background-color]="event.color || '#6366f1'"
                          [style.color]="getTextColor(event.color || '#6366f1')"
                          (click)="onEventClick(event, $event)">
                          <div class="font-medium">{{ event.title }}</div>
                          @if (event.description) {
                            <div class="text-xs opacity-90 mt-1">{{ event.description }}</div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }
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

    .month-view .grid {
      min-height: 600px;
    }

    .week-view .grid {
      min-height: 800px;
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

  @Output() eventClick = new EventEmitter<CalendarEventClick>();
  @Output() dateClick = new EventEmitter<CalendarDateClick>();
  @Output() addEvent = new EventEmitter<void>();
  @Output() viewChange = new EventEmitter<CalendarView>();

  currentView = signal<CalendarView>({
    type: 'month',
    date: new Date()
  });

  selectedDate = signal<Date | null>(null);

  weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  hourSlots = Array.from({ length: 24 }, (_, i) => i);

  monthDays = computed(() => {
    const view = this.currentView();
    const year = view.date.getFullYear();
    const month = view.date.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: CalendarDay[] = [];
    const today = new Date();
    const selected = this.selectedDate();

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

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
        })} - ${weekEnd.toLocaleDateString('es-CL', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })}`;
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

  onTimeSlotClick(day: string, hour: number, event: MouseEvent) {
    const slotDate = new Date();
    slotDate.setHours(hour, 0, 0, 0);
    this.onDateClick(slotDate, false, event);
  }

  onAddEvent() {
    this.addEvent.emit();
  }

  getWeekStart(date: Date): Date {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
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

  getHourEvents(day: string, hour: number): CalendarEvent[] {
    // This would filter events for specific day and hour in week view
    return [];
  }

  getDayHourEvents(hour: number): CalendarEvent[] {
    const view = this.currentView();
    return this.events.filter(event => {
      const eventHour = event.start.getHours();
      return this.isSameDay(event.start, view.date) && eventHour === hour;
    });
  }

  getTextColor(backgroundColor: string): string {
    // Simple contrast calculation
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
}
