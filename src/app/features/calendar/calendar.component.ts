import { Component, Input, Output, EventEmitter, OnInit, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { CalendarEvent, CalendarView, CalendarDateClick, CalendarEventClick, CalendarDay, CalendarResource } from './calendar.interface';
import { trigger, transition, style, animate } from '@angular/animations';
import { ContextMenuComponent, MenuAction } from '../../shared/components/context-menu/context-menu.component';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, DragDropModule, ContextMenuComponent],
  animations: [AnimationService.fadeInUp, AnimationService.slideIn],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden h-full flex flex-col" @fadeInUp>
      <!-- Header -->
      <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex-shrink-0">
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
              @for (viewType of ['month', 'week', 'day', 'timeline']; track viewType) {
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
            <div class="flex space-x-2">
                <button
                *ngIf="showWaitlistButton"
                (click)="onWaitlistClick()"
                class="inline-flex items-center px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-md hover:bg-amber-600 transition-colors shadow-sm"
                title="Lista de Espera">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="hidden sm:inline">Espera</span>
                <span *ngIf="waitlistCount > 0" class="ml-2 bg-white text-amber-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{{ waitlistCount }}</span>
                </button>

                <button
                *ngIf="showBlockButton"
                (click)="onBlockTime()"
                class="inline-flex items-center px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                </svg>
                Bloquear
                </button>

                <button
                *ngIf="showAddButton"
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
      </div>

      <!-- Calendar content -->
      <div class="flex-1 overflow-hidden relative" cdkDropListGroup>
        @switch (currentView().type) {
          @case ('month') {
            <div class="h-full flex flex-col p-4 overflow-y-auto pb-0 no-scrollbar" @slideIn>
              <!-- Month header with days -->
              <div class="grid grid-cols-7 gap-px mb-2 flex-shrink-0">
                @for (day of weekDays; track day) {
                  <div class="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ day }}
                  </div>
                }
              </div>
              
              <!-- Month grid -->
              <div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex-1">
                @for (day of monthDays(); track day.date.getTime()) {
                  <div 
                    class="bg-white dark:bg-gray-800 min-h-[100px] p-2 flex flex-col relative transition-all hover:bg-gray-50 dark:hover:bg-gray-700"
                    [ngClass]="{
                      'bg-gray-50/50 dark:bg-gray-800/50': !day.isCurrentMonth,
                      'ring-2 ring-inset ring-indigo-500 z-10': day.isSelected
                    }"
                    (click)="onDateClick(day.date, true, $event)"
                    cdkDropList
                    [cdkDropListData]="{ date: day.date, isAllDay: true }"
                    (cdkDropListDropped)="onEventDrop($event)">
                    
                    <!-- Today Highlight Background -->
                     <div *ngIf="day.isToday" class="absolute inset-0 bg-indigo-50 dark:bg-indigo-900/30 pointer-events-none"></div>

                    <div class="flex items-center justify-between mb-2 relative z-0">
                      <span class="text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full"
                            [ngClass]="{
                              'bg-indigo-600 text-white': day.isToday,
                              'text-gray-900 dark:text-white': day.isCurrentMonth && !day.isToday,
                              'text-gray-400 dark:text-gray-500': !day.isCurrentMonth
                            }">
                        {{ day.date.getDate() }}
                      </span>
                      @if (day.events.length > 0) {
                        <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {{ day.events.length }}
                        </span>
                      }
                    </div>
                    
                    <!-- Events preview -->
                    <div class="space-y-1 relative z-0 flex-1">
                      @for (event of day.events.slice(0, 4); track event.id) {
                        <div 
                          class="px-2 py-1 text-xs rounded-md truncate cursor-pointer hover:opacity-80 transition-opacity border-l-2"
                          [style.background-color]="getEventColor(event) + '20'"
                          [style.border-left-color]="getEventColor(event)"
                          [style.border-left-style]="event.meta?.original?.status === 'pending' ? 'dashed' : 'solid'"
                          [style.color]="'inherit'"
                          (click)="onEventClick(event, $event)"
                          (contextmenu)="onEventContextMenu($event, event)"
                          [title]="event.title + (event.description ? ' - ' + event.description : '')"
                          cdkDrag
                          [cdkDragData]="event"
                          [cdkDragDisabled]="!editable">
                          <span class="font-medium" [style.color]="getEventColor(event)">
                            {{ event.start | date:'HH:mm' }}
                          </span>
                          <span class="text-gray-700 dark:text-gray-300 ml-1">
                            {{ event.title }}
                          </span>
                          <!-- Drag Preview -->
                          <div *cdkDragPreview class="bg-white shadow-xl rounded-md p-2 w-48 opacity-90">
                              {{ event.title }}
                          </div>
                        </div>
                      }
                      @if (day.events.length > 4) {
                        <div class="text-xs text-gray-500 dark:text-gray-400 pl-1 hover:text-indigo-600 cursor-pointer">
                          +{{ day.events.length - 4 }} más
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
          
          @case ('week') {
            <div class="h-full flex flex-col p-4 overflow-hidden" @slideIn>
              <!-- Week header (Sticky) -->
              <div class="flex mb-4 flex-shrink-0 pr-4 border-b border-gray-200 dark:border-gray-700 pb-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm sticky top-0 z-20">
                <div class="w-16 flex-shrink-0"></div> <!-- Time column header placeholder -->
                <div class="flex-1 flex">
                  @for (day of weekDays; track day) {
                    <div class="flex-1 text-center">
                      <div class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ day }}</div>
                      <div class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                        {{ getWeekDayNumber(day) }}
                      </div>
                    </div>
                  }
                </div>
              </div>
              
              <!-- Week grid (Scrollable) -->
              <div class="flex-1 overflow-y-auto relative pt-1 no-scrollbar" #weekContainer>
                  <div class="flex relative bg-gray-200 dark:bg-gray-700 rounded-lg"
                       [style.height.px]="totalHeight">
                    
                    <!-- Time Column -->
                    <div class="w-16 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 relative z-10">
                        @for (hour of hourSlots; track hour) {
                            <div class="text-sm text-gray-500 dark:text-gray-400 text-right pr-2 sticky left-0"
                                 [style.height.px]="hourHeight">
                                <span class="-translate-y-1/2 block">{{ formatHour(hour) }}</span>
                            </div>
                        }
                    </div>

                    <!-- Days Columns Container -->
                    <div class="flex-1 flex relative">
                        <!-- Background Grid & Drop Lists -->
                         @for (day of weekDays; track day; let i = $index) {
                             <div class="flex-1 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 relative h-full"
                                  cdkDropList
                                  [cdkDropListData]="{ dayStr: day }"
                                  (cdkDropListDropped)="onEventDrop($event)">
                                  
                                  <!-- Hour Slots (Clickable) -->
                                  @for (hour of hourSlots; track hour) {
                                      <div class="border-b border-gray-100 dark:border-gray-700 w-full absolute box-border hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                           [style.top.px]="(hour - startHour) * hourHeight"
                                           [style.height.px]="hourHeight"
                                           (click)="onTimeSlotClick(day, hour, $event)">
                                      </div>
                                  }

                                  <!-- Events Overlay -->
                                  @for (event of getDayEvents(day); track event.id) {
                                      <div class="absolute inset-x-1 rounded px-2 py-1 text-xs cursor-pointer hover:shadow-md transition-all shadow-sm z-20 overflow-hidden border-l-4"
                                           [style.top.px]="getEventTop(event)"
                                           [style.height.px]="getEventHeight(event)"
                                           [style.background-color]="getEventColor(event) + '20'"
                                           [style.border-left-color]="getEventColor(event)"
                                           [style.border-left-style]="event.meta?.original?.status === 'pending' ? 'dashed' : 'solid'"
                                           [style.color]="'inherit'"
                                           (click)="onEventClick(event, $event)"
                                           (contextmenu)="onEventContextMenu($event, event)"
                                           [title]="event.title"
                                           cdkDrag
                                           [cdkDragData]="event"
                                           [cdkDragDisabled]="!editable">
                                           
                                           <div class="font-semibold text-gray-900 dark:text-white truncate">
                                              {{ event.title }}
                                           </div>
                                           <div class="text-gray-600 dark:text-gray-300 truncate">
                                              {{ event.start | date:'HH:mm' }} - {{ event.end | date:'HH:mm' }}
                                           </div>
                                           
                                           <div *cdkDragPreview class="bg-indigo-600 text-white shadow-xl rounded-md p-2 w-48 opacity-90 h-16">
                                              {{ event.start | date:'HH:mm' }} - {{ event.title }}
                                           </div>
                                           
                                           <!-- Resize Handle -->
                                           <div class="absolute bottom-0 inset-x-0 h-2 cursor-ns-resize z-30 opacity-0 hover:opacity-100 hover:bg-indigo-400"
                                                cdkDrag
                                                cdkDragLockAxis="y"
                                                (cdkDragEnded)="onResizeEnd($event, event)"
                                                (click)="$event.stopPropagation()">
                                           </div>
                                      </div>
                                  }
                             </div>
                         }
                    </div>

                  </div>
              </div>
            </div>
          }
          
          @case ('day') {
             <div class="h-full flex flex-col p-4 overflow-hidden" @slideIn>
               <div class="mb-4 flex-shrink-0">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ formatDayHeader() }}
                </h3>
               </div>

               <div class="flex-1 overflow-y-auto relative pb-0 pt-2 no-scrollbar">
                   <div class="flex relative" [style.height.px]="totalHeight">
                       <!-- Time Labels -->
                       <div class="w-16 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10">
                           @for (hour of hourSlots; track hour) {
                                <div class="text-sm text-gray-500 dark:text-gray-400 text-right pr-2 sticky left-0"
                                     [style.height.px]="hourHeight">
                                     <span class="-translate-y-1/2 block">{{ formatHour(hour) }}</span>
                                </div>
                           }
                       </div>

                       <!-- Day Content -->
                       <div class="flex-1 relative bg-white dark:bg-gray-800 max-w-full"
                            cdkDropList
                            [cdkDropListData]="{ isDayView: true }"
                            (cdkDropListDropped)="onEventDrop($event)">
                            
                            <!-- Grid Lines (Clickable) -->
                            @for (hour of hourSlots; track hour) {
                                <div class="border-b border-gray-100 dark:border-gray-700 w-full absolute box-border hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                     [style.top.px]="(hour - startHour) * hourHeight"
                                     [style.height.px]="hourHeight"
                                     (click)="onTimeSlotClick('', hour, $event)">
                                </div>
                            }

                            <!-- Events -->
                            @for (event of getDayViewEvents(); track event.id) {
                                <div class="absolute left-2 right-2 rounded px-3 py-2 text-sm cursor-pointer hover:opacity-90 transition-opacity shadow-sm z-20 border-l-4 overflow-hidden"
                                     [style.top.px]="getEventTop(event)"
                                     [style.height.px]="getEventHeight(event)"
                                     [style.background-color]="getEventColor(event) + '20'"
                                     [style.border-left-color]="getEventColor(event)"
                                     [style.border-left-style]="event.meta?.original?.status === 'pending' ? 'dashed' : 'solid'"
                                     (click)="onEventClick(event, $event)"
                                     (contextmenu)="onEventContextMenu($event, event)"
                                     cdkDrag
                                     [cdkDragData]="event"
                                     [cdkDragDisabled]="!editable">
                                     
                                     <div class="font-bold text-gray-900 dark:text-white truncate">
                                        {{ event.title }}
                                     </div>
                                     <div class="text-gray-600 dark:text-gray-300 truncate">
                                        {{ event.start | date:'HH:mm' }} - {{ event.end | date:'HH:mm' }}
                                     </div>
                                     
                                     <div *cdkDragPreview class="bg-indigo-600 text-white shadow-xl rounded-md p-2 w-full opacity-90">
                                          {{ event.start | date:'HH:mm' }} - {{ event.title }}
                                     </div>

                                     <!-- Resize Handle -->
                                     <div class="absolute bottom-0 inset-x-0 h-2 cursor-ns-resize z-30 opacity-0 hover:opacity-100 hover:bg-indigo-400"
                                          cdkDrag
                                          cdkDragLockAxis="y"
                                          (cdkDragEnded)="onResizeEnd($event, event)"
                                          (click)="$event.stopPropagation()">
                                     </div>
                                </div>
                            }
                       </div>
                   </div>
               </div>
             </div>
          }
          
          @case ('timeline') {
            <div class="h-full flex flex-col p-4 overflow-hidden" @slideIn>
               <!-- Timeline Header -->
               <div class="flex border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                   <div class="w-48 flex-shrink-0 font-semibold text-gray-500 dark:text-gray-400 pl-2">
                       Profesionales
                   </div>
                   <div class="flex-1 flex overflow-hidden">
                       @for (hour of hourSlots; track hour) {
                           <div class="flex-1 min-w-[80px] text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                               {{ formatHour(hour) }}
                           </div>
                       }
                   </div>
               </div>

               <!-- Timeline Body (Scrollable) -->
               <div class="flex-1 overflow-y-auto no-scrollbar relative">
                   @for (resource of resources; track resource.id) {
                       <div class="flex border-b border-gray-100 dark:border-gray-700 min-h-[80px] relative hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                           <!-- Resource Header (Row Label) -->
                           <div class="w-48 flex-shrink-0 p-3 border-r border-gray-200 dark:border-gray-700 flex items-center gap-3 sticky left-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm z-30 shadow-sm">
                               @if (resource.avatar) {
                                   <img [src]="resource.avatar" class="w-8 h-8 rounded-full object-cover">
                               } @else {
                                   <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold text-xs">
                                       {{ resource.title.charAt(0) }}
                                   </div>
                               }
                               <div class="font-medium text-sm text-gray-900 dark:text-white truncate">
                                   {{ resource.title }}
                               </div>
                           </div>

                           <!-- Resource Lane (Drop Zone) -->
                           <div class="flex-1 relative flex"
                                cdkDropList
                                [cdkDropListData]="{ resourceId: resource.id, isTimeline: true }"
                                (cdkDropListDropped)="onEventDrop($event)">
                                
                                <!-- Background Grid -->
                                 @for (hour of hourSlots; track hour) {
                                     <div class="flex-1 min-w-[80px] border-r border-gray-100 dark:border-gray-700 h-full relative cursor-pointer hover:bg-gray-100/50"
                                          (click)="onTimeSlotClick('', hour, $event)">
                                         <!-- Maybe add click for creating event here too? Need passing resourceId -->
                                     </div>
                                 }
                                 
                                 <!-- Events Overlay -->
                                  @for (calEvent of getTimelineEvents(resource.id); track calEvent.id) {
                                      <div class="absolute top-2 bottom-2 rounded px-2 py-1 text-xs cursor-pointer hover:shadow-md transition-all shadow-sm z-20 overflow-hidden border-l-4"
                                           [style.left.%]="getUserEventLeftPercent(calEvent)"
                                           [style.width.%]="getUserEventWidthPercent(calEvent)"
                                           [style.background-color]="getEventColor(calEvent) + '20'"
                                           [style.border-left-color]="getEventColor(calEvent)"
                                           [style.border-left-style]="calEvent.meta?.original?.status === 'pending' ? 'dashed' : 'solid'"
                                           (click)="onEventClick(calEvent, $event)"
                                           (contextmenu)="onEventContextMenu($event, calEvent)"
                                           cdkDrag
                                           [cdkDragData]="calEvent"
                                           [cdkDragDisabled]="!editable">
                                           
                                           <div class="font-semibold text-gray-900 dark:text-white truncate">
                                              {{ calEvent.title }}
                                           </div>
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
      <app-context-menu
        *ngIf="contextMenuVisible"
        [position]="contextMenuPosition"
        [actions]="contextMenuActions"
        (actionClick)="onMenuAction($event)"
        (close)="closeContextMenu()">
    </app-context-menu>
  </div>
  `,
  styles: [`
    .cdk-drag-preview {
      box-sizing: border-box;
      border-radius: 4px;
      box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2),
                  0 8px 10px 1px rgba(0, 0, 0, 0.14),
                  0 3px 14px 2px rgba(0, 0, 0, 0.12);
    }
    .cdk-drag-placeholder {
      opacity: 0;
    }
    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    .month-view.cdk-drop-list-dragging .month-cell:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    /* We don't want the list itself to animate items out of the way for absolute positioning */
    .cdk-drop-list-dragging .cdk-drag {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1); 
    }
    /* Hide scrollbar but allow scrolling */
    .no-scrollbar {
      -ms-overflow-style: none;  /* IE and Edge */
      scrollbar-width: none;  /* Firefox */
    }
    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
  `]
})
export class CalendarComponent implements OnInit {
  @Input() events: CalendarEvent[] = [];
  @Input() editable = true;
  @Input() selectable = true;
  @Input() showAddButton = true;
  @Input() showBlockButton = false;
  @Input() showWaitlistButton = false;
  @Input() waitlistCount = 0;
  @Input() startHour = 8;
  @Input() endHour = 22;
  @Input() resources: CalendarResource[] = [];
  @Input() colorMode: 'status' | 'service' | 'professional' | 'static' = 'status';

  @Output() eventClick = new EventEmitter<CalendarEventClick>();
  @Output() dateClick = new EventEmitter<CalendarDateClick>();
  @Output() addEvent = new EventEmitter<void>();
  @Output() blockTime = new EventEmitter<void>();
  @Output() viewChange = new EventEmitter<CalendarView>();
  @Output() eventDrop = new EventEmitter<{ event: CalendarEvent, newStart: Date, newResource?: string }>();
  @Output() eventResize = new EventEmitter<{ event: CalendarEvent, newEnd: Date }>();
  @Output() eventAction = new EventEmitter<{ action: string, event: CalendarEvent }>();
  @Output() waitlistClick = new EventEmitter<void>();

  // Context Menu State
  contextMenuVisible = false;
  contextMenuPosition = { x: 0, y: 0 };
  selectedEvent: CalendarEvent | null = null;
  contextMenuActions: MenuAction[] = [
    { label: 'Marcar como Llegado', action: 'status_arrived', icon: '📍', class: 'text-green-600' },
    { label: 'Marcar como Completado', action: 'status_completed', icon: '✅', class: 'text-blue-600' },
    { label: 'Marcar como No-Show', action: 'status_noshow', icon: '🚫', class: 'text-red-600' },
    { divider: true, label: '', action: '' },
    { label: 'Editar', action: 'edit', icon: '✏️' },
    { label: 'Eliminar', action: 'delete', icon: '🗑️', class: 'text-red-500' }
  ];

  currentView = signal<CalendarView>({
    type: 'month',
    date: new Date()
  });

  // ... (Code continues) ...




  selectedDate = signal<Date | null>(null);

  weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  hourSlots: number[] = [];
  hourHeight = 60;

  ngOnChanges() {
    this.updateHourSlots();
  }

  // ... (Keep existing methods: updateHourSlots, monthDays, ngOnInit, helpers) ...
  private updateHourSlots() {
    const start = Math.max(0, Math.min(23, this.startHour));
    const end = Math.max(start, Math.min(23, this.endHour));
    this.hourSlots = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  monthDays = computed(() => {
    const view = this.currentView();
    const year = view.date.getFullYear();
    const month = view.date.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    const dayOfWeek = firstDay.getDay();
    const diff = (dayOfWeek + 6) % 7;
    startDate.setDate(startDate.getDate() - diff);

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

  ngOnInit() { }

  // ... (Keep format methods) ...
  formatHeaderDate(): string {
    const view = this.currentView();
    const date = view.date;
    switch (view.type) {
      case 'month': return date.toLocaleDateString('es-CL', { year: 'numeric', month: 'long' });
      case 'week':
        const weekStart = this.getWeekStart(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return `${weekStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      case 'day': return date.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      default: return '';
    }
  }

  formatDayHeader(): string {
    return this.currentView().date.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  getViewLabel(viewType: string): string {
    const labels = { month: 'Mes', week: 'Semana', day: 'Día', timeline: 'Timeline' };
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
      case 'month': newDate.setMonth(newDate.getMonth() - 1); break;
      case 'week': newDate.setDate(newDate.getDate() - 7); break;
      case 'day': newDate.setDate(newDate.getDate() - 1); break;
      case 'timeline': newDate.setDate(newDate.getDate() - 1); break;
    }
    this.currentView.update(v => ({ ...v, date: newDate }));
    this.viewChange.emit(this.currentView());
  }

  nextPeriod() {
    const view = this.currentView();
    const newDate = new Date(view.date);
    switch (view.type) {
      case 'month': newDate.setMonth(newDate.getMonth() + 1); break;
      case 'week': newDate.setDate(newDate.getDate() + 7); break;
      case 'day': newDate.setDate(newDate.getDate() + 1); break;
      case 'timeline': newDate.setDate(newDate.getDate() + 1); break;
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
    // If it was a right click, it might be handled by (contextmenu) but standard click is left.
    this.eventClick.emit({ event: calendarEvent, nativeEvent: event });
  }

  getEventColor(event: CalendarEvent): string {
    if (this.colorMode === 'static') {
      return event.color || '#6366f1';
    }

    if (this.colorMode === 'status' && event.meta?.original?.status) {
      switch (event.meta.original.status) {
        case 'confirmed': return '#4f46e5'; // Indigo-600
        case 'pending': return '#f59e0b'; // Amber-500
        case 'cancelled': return '#ef4444'; // Red-500
        case 'arrived': return '#10b981'; // Emerald-500
        case 'completed': return '#3b82f6'; // Blue-500
        case 'noshow': return '#6b7280'; // Gray-500
        default: return event.color || '#6366f1';
      }
    }

    if (this.colorMode === 'professional' && event.resourceId) {
      // Find resource color? Or hash from ID?
      const resource = this.resources.find(r => r.id === event.resourceId);
      return resource?.color || event.color || '#6366f1';
    }

    // Fallback
    return event.color || '#6366f1';
  }

  onEventContextMenu(event: MouseEvent, calendarEvent: CalendarEvent) {
    event.preventDefault();
    event.stopPropagation();

    this.selectedEvent = calendarEvent;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    this.contextMenuVisible = true;
  }

  onMenuAction(action: MenuAction) {
    if (this.selectedEvent) {
      this.eventAction.emit({ action: action.action, event: this.selectedEvent });
    }
    this.closeContextMenu();
  }

  closeContextMenu() {
    this.contextMenuVisible = false;
    this.selectedEvent = null;
  }

  // UPDATED METHODS FOR WEEK/DAY VIEW LOGIC

  getHourEvents(day: string, hour: number): CalendarEvent[] {
    const viewDate = this.currentView().date;
    const weekStart = this.getWeekStart(viewDate);
    const dayIndex = this.weekDays.indexOf(day);

    // Calculate the date for this specific column
    const colDate = new Date(weekStart);
    colDate.setDate(weekStart.getDate() + dayIndex);

    return this.events.filter(event => {
      const eventHour = event.start.getHours();
      return this.isSameDay(event.start, colDate) && eventHour === hour;
    });
  }

  getDayHourEvents(hour: number): CalendarEvent[] {
    const view = this.currentView();
    return this.events.filter(event => {
      const eventHour = event.start.getHours();
      return this.isSameDay(event.start, view.date) && eventHour === hour;
    });
  }

  // HELPER METHODS FOR ABSOLUTE POSITIONING
  getEventTop(event: CalendarEvent): number {
    const eventStart = new Date(event.start);
    // Diff in minutes from startHour
    const startHourDate = new Date(eventStart);
    startHourDate.setHours(this.startHour, 0, 0, 0);

    const diffMs = eventStart.getTime() - startHourDate.getTime();
    const diffMins = diffMs / (1000 * 60);

    // Pixels = (mins / 60) * hourHeight
    return (diffMins / 60) * this.hourHeight;
  }

  getEventHeight(event: CalendarEvent): number {
    const durationMs = event.end.getTime() - event.start.getTime();
    const durationMins = durationMs / (1000 * 60);
    return Math.max((durationMins / 60) * this.hourHeight, 20); // Min height 20px
  }

  getDayEvents(day: string): CalendarEvent[] {
    // For week view: Find date for 'day' (Mon, Tue...) and filter
    const viewDate = this.currentView().date;
    const weekStart = this.getWeekStart(viewDate);
    const dayIndex = this.weekDays.indexOf(day);
    const colDate = new Date(weekStart);
    colDate.setDate(weekStart.getDate() + dayIndex);

    return this.events.filter(event => this.isSameDay(event.start, colDate));
  }

  getDayViewEvents(): CalendarEvent[] {
    const viewDate = this.currentView().date;
    return this.events.filter(event => this.isSameDay(event.start, viewDate));
  }

  onTimeSlotClick(day: string, hour: number, event: MouseEvent) {
    let slotDate = new Date();
    if (this.currentView().type === 'week') {
      const viewDate = this.currentView().date;
      const weekStart = this.getWeekStart(viewDate);
      const dayIndex = this.weekDays.indexOf(day);
      slotDate = new Date(weekStart);
      slotDate.setDate(weekStart.getDate() + dayIndex);
    } else if (this.currentView().type === 'day' || this.currentView().type === 'timeline') {
      slotDate = new Date(this.currentView().date);
    }
    slotDate.setHours(hour, 0, 0, 0);
    this.onDateClick(slotDate, false, event);
  }

  getTimelineEvents(resourceId: string): CalendarEvent[] {
    const viewDate = this.currentView().date;
    return this.events.filter(event =>
      this.isSameDay(event.start, viewDate) &&
      event.resourceId === resourceId
    );
  }

  onAddEvent() {
    this.addEvent.emit();
  }

  onBlockTime() {
    this.blockTime.emit();
  }

  onWaitlistClick() {
    this.waitlistClick.emit();
  }

  // DRAG AND DROP HANDLER
  onEventDrop(event: CdkDragDrop<any>) {
    const movedEvent: CalendarEvent = event.item.data;
    const targetData = event.container.data;

    let newStart = new Date(movedEvent.start);
    let newResource = movedEvent.resourceId;

    // 1. Timeline: Resource Change
    if (targetData.isTimeline) {
      if (targetData.resourceId) {
        newResource = targetData.resourceId;
      }
    }
    // 2. Month View: Date Change
    else if (targetData.date) {
      const targetDate = new Date(targetData.date);
      newStart.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    }
    // 3. Week View: Date Change
    else if (targetData.dayStr) {
      const viewDate = this.currentView().date;
      const weekStart = this.getWeekStart(viewDate);
      const dayIndex = this.weekDays.indexOf(targetData.dayStr);
      const colDate = new Date(weekStart);
      colDate.setDate(weekStart.getDate() + dayIndex);

      newStart.setFullYear(colDate.getFullYear(), colDate.getMonth(), colDate.getDate());
    }
    // 4. Day View: Ensure Date
    else if (targetData.isDayView) {
      const viewDate = this.currentView().date;
      newStart.setFullYear(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());
    }

    // 5. Vertical Time Change (Week/Day)
    if ((this.currentView().type === 'week' || this.currentView().type === 'day') && !targetData.isTimeline) {
      const deltaY = event.distance.y;
      const deltaMins = Math.round((deltaY / this.hourHeight) * 60);
      // Apply delta to original time
      newStart.setHours(movedEvent.start.getHours(), movedEvent.start.getMinutes() + deltaMins);
    }

    // Only emit if changed
    if (newStart.getTime() !== movedEvent.start.getTime() || newResource !== movedEvent.resourceId) {
      this.eventDrop.emit({ event: movedEvent, newStart, newResource });
    }
  }

  getUserEventLeftPercent(event: CalendarEvent): number {
    const startHour = this.startHour;
    const totalHours = this.endHour - startHour + 1;

    const eventStart = event.start.getHours() + event.start.getMinutes() / 60;
    const diff = eventStart - startHour;

    return (diff / totalHours) * 100;
  }

  getUserEventWidthPercent(event: CalendarEvent): number {
    const totalHours = this.endHour - this.startHour + 1;
    const durationHours = (event.end.getTime() - event.start.getTime()) / (1000 * 60 * 60);

    return (durationHours / totalHours) * 100;
  }

  onResizeEnd(dragEvent: any, calendarEvent: CalendarEvent) {
    const deltaY = dragEvent.distance.y;
    const deltaMins = Math.round((deltaY / this.hourHeight) * 60);

    const newEnd = new Date(calendarEvent.end);
    if (deltaMins !== 0) {
      newEnd.setMinutes(newEnd.getMinutes() + deltaMins);
      this.eventResize.emit({ event: calendarEvent, newEnd });
    }
    dragEvent.source.reset();
  }

  getTextColor(backgroundColor: string): string {
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  getWeekStart(date: Date): Date {
    const start = new Date(date);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
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

  get totalHeight(): number {
    return this.hourSlots.length * this.hourHeight;
  }

  formatHour(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
}
