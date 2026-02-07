import { Component, Input, Output, EventEmitter, computed, signal, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop, CdkDragEnd, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CalendarEvent, CalendarView, CalendarDay, CalendarEventClick, CalendarDateClick } from './calendar.interface';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  animations: [AnimationService.fadeInUp, AnimationService.slideIn],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-180px)]" @fadeInUp>
      <!-- Header (fixed, never scrolls) -->
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

      <!-- Calendar content (scrollable) -->
      <div class="p-6 flex-1 overflow-y-auto">
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
                    
                    <!-- Events preview -->
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
                          <ng-template cdkDragPreview>
                             <div class="text-xs p-1 rounded truncate text-white opacity-80 shadow-lg"
                                  [style.background-color]="event.color || '#6366f1'">
                                 {{ event.title }}
                             </div>
                          </ng-template>
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
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(' + currentWeekDays.length + ', 1fr)'"
                   cdkDropListGroup>
                
                 <!-- Time Column -->
                 <div class="col-span-1 border-r border-gray-100 dark:border-gray-700">
                      @for (slot of currentHourSlots; track slot) {
                           @if (slot.type === 'hour') {
                               <!-- Hour Marker -->
                               <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative">
                                  <span class="absolute top-1 right-2 text-xs text-gray-400 block">
                                     {{ formatHour(slot.hour) }}
                                  </span>
                               </div>
                            } @else {
                               <!-- Gap Marker -->
                               <div class="h-[4px] bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 opacity-50"></div>
                           }
                      }
                 </div>

                <!-- Day Columns -->
                @for (day of currentWeekDays; track day) {
                    <div class="col-span-1 relative border-r border-gray-100 dark:border-gray-700"
                         [style.min-height]="'100%'"
                         cdkDropList
                         [cdkDropListData]="getDateForWeekDay(day)"
                         (cdkDropListDropped)="onEventDrop($event)">
                        <!-- Background Grid Lines -->
                        @for (slot of currentHourSlots; track slot) {
                            @if (slot.type === 'hour') {
                                <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 pointer-events-none relative">
                                    <div class="absolute top-[15px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                    <div class="absolute top-[30px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                    <div class="absolute top-[45px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                    @if(slot.debugInfo) {
                                      <div class="absolute top-1 left-2 bg-red-100 text-red-700 text-[10px] z-50 p-1 rounded border border-red-300">
                                        {{ slot.debugInfo }}
                                      </div>
                                    }
                                </div>
                            } @else {
                                <div class="h-[4px] bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 opacity-50 pointer-events-none"></div>
                            }
                        }

                        <!-- Click Overlay (for creating events) -->
                        <div class="absolute inset-0 z-0 flex flex-col">
                             @for (slot of currentHourSlots; track slot) {
                                @if (slot.type === 'hour') {
                                    <div class="h-[60px] flex flex-col">
                                      @for (quarter of [0, 15, 30, 45]; track quarter) {
                                        <div class="h-[15px] transition-colors relative group"
                                             [ngClass]="{
                                               'bg-gray-200 dark:bg-gray-900': !isSlotAvailable(getWeekDayIndex(day), slot.hour),
                                               'cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800': isSlotAvailable(getWeekDayIndex(day), slot.hour),
                                               'cursor-not-allowed': !isSlotAvailable(getWeekDayIndex(day), slot.hour)
                                             }"
                                             (mouseenter)="hoveredTime.set({hour: slot.hour, minutes: quarter, dayLabel: day})"
                                             (mouseleave)="hoveredTime.set(null)"
                                             (click)="onTimeSlotClick(day, slot.hour, $event, quarter)">
                                          @if (isSlotAvailable(getWeekDayIndex(day), slot.hour)) {
                                            <div class="absolute left-1/2 -translate-x-1/2 -top-7 bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                              {{ slot.hour.toString().padStart(2, '0') }}:{{ quarter.toString().padStart(2, '0') }}
                                            </div>
                                          }
                                        </div>
                                      }
                                    </div>
                                } @else {
                                    <div class="h-[4px] cursor-not-allowed bg-transparent"></div>
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
                                 [title]="event.title"
                                 cdkDrag
                                 [cdkDragData]="event"
                                 [cdkDragDisabled]="event.draggable === false || !editable">
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

          @case ('3days') {
            <div class="three-day-view" @slideIn>
              <!-- 3-Day header -->
              <div class="grid mb-4 sticky top-0 bg-white dark:bg-gray-800 z-20 border-b border-gray-200 dark:border-gray-700 pb-2"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(' + current3Days.length + ', 1fr)'">
                <div class="p-2"></div> <!-- Time column header -->
                @for (day of current3Days; track $index) {
                  <div class="p-2 text-center">
                    <div class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ day }}</div>
                    <div class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                      {{ getDateFor3Day(day).getDate() }}
                    </div>
                  </div>
                }
              </div>
              
              <!-- 3-Day grid Container -->
              <div class="relative grid bg-white dark:bg-gray-800"
                   [style.grid-template-columns]="'minmax(3rem, auto) repeat(' + current3Days.length + ', 1fr)'"
                   cdkDropListGroup>
                
                 <!-- Time Column -->
                 <div class="col-span-1 border-r border-gray-100 dark:border-gray-700">
                      @for (slot of currentHourSlots; track slot) {
                           @if (slot.type === 'hour') {
                               <!-- Hour Marker -->
                               <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 relative">
                                  <span class="absolute top-1 right-2 text-xs text-gray-400 block">
                                     {{ formatHour(slot.hour) }}
                                  </span>
                               </div>
                            } @else {
                               <!-- Gap Marker -->
                               <div class="h-[4px] bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 opacity-50"></div>
                           }
                      }
                 </div>

                <!-- Day Columns for 3-Day View -->
                @for (day of current3Days; track $index) {
                    <div class="col-span-1 relative border-r border-gray-100 dark:border-gray-700"
                         [style.min-height]="'100%'"
                         cdkDropList
                         [cdkDropListData]="getDateFor3Day(day)"
                         (cdkDropListDropped)="onEventDrop($event)">
                        <!-- Background Grid Lines -->
                        @for (slot of currentHourSlots; track slot) {
                             @if (slot.type === 'hour') {
                                 <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 pointer-events-none relative">
                                     <div class="absolute top-[15px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                     <div class="absolute top-[30px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                     <div class="absolute top-[45px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                 </div>
                             } @else {
                                 <div class="h-[4px] bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 opacity-50 pointer-events-none"></div>
                             }
                        }

                        <!-- Click Overlay -->
                        <div class="absolute inset-0 z-0 flex flex-col">
                             @for (slot of currentHourSlots; track slot) {
                                @if (slot.type === 'hour') {
                                    <div class="h-[60px] flex flex-col">
                                      @for (quarter of [0, 15, 30, 45]; track quarter) {
                                        <div class="h-[15px] transition-colors relative group"
                                             [ngClass]="{
                                               'bg-gray-200 dark:bg-gray-900': !isSlotAvailable(getDateFor3Day(day).getDay(), slot.hour),
                                               'cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800': isSlotAvailable(getDateFor3Day(day).getDay(), slot.hour),
                                               'cursor-not-allowed': !isSlotAvailable(getDateFor3Day(day).getDay(), slot.hour)
                                             }"
                                             (mouseenter)="hoveredTime.set({hour: slot.hour, minutes: quarter, dayLabel: day})"
                                             (mouseleave)="hoveredTime.set(null)"
                                             (click)="onTimeSlotClick3Day(day, slot.hour, $event, quarter)">
                                          @if (isSlotAvailable(getDateFor3Day(day).getDay(), slot.hour)) {
                                            <div class="absolute left-1/2 -translate-x-1/2 -top-7 bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                              {{ slot.hour.toString().padStart(2, '0') }}:{{ quarter.toString().padStart(2, '0') }}
                                            </div>
                                          }
                                        </div>
                                      }
                                    </div>
                                } @else {
                                    <div class="h-[4px] cursor-not-allowed bg-transparent"></div>
                                }
                            }
                        </div>

                        <!-- Events -->
                        @for (event of getEventsForDate(getDateFor3Day(day)); track event.id) {
                            <div class="absolute inset-x-0 mx-1 rounded p-1 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 shadow-sm border-l-4"
                                 [style.top]="getEventTopRelative(event)"
                                 [style.height]="getEventStyle(event).height"
                                 [style.background-color]="getEventStyle(event).backgroundColor"
                                 [style.color]="getEventStyle(event).color"
                                 [style.border-color]="getTextColor(event.color || '#6366f1')" 
                                 (click)="onEventClick(event, $event)"
                                 [title]="event.title"
                                 cdkDrag
                                 [cdkDragData]="event"
                                 [cdkDragDisabled]="event.draggable === false || !editable">
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
             <div class="day-view" @slideIn>
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
                              <div class="h-[60px] text-xs text-gray-400 text-right pr-2 relative border-b border-gray-100 dark:border-gray-700">
                                 <span class="block pt-1">
                                    {{ formatHour(slot.hour) }}
                                 </span>
                              </div>
                          } @else {
                              <div class="h-[4px] bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 opacity-50"></div>
                          }
                     }
                   </div>

                   <!-- Day Content -->
                   <div class="flex-1 relative"
                        cdkDropList
                        [cdkDropListData]="currentView().date"
                        (cdkDropListDropped)="onEventDrop($event)">
                        <!-- Background Lines -->
                        @for (slot of currentHourSlots; track slot) {
                             @if (slot.type === 'hour') {
                                 <div class="h-[60px] border-b border-gray-100 dark:border-gray-700 pointer-events-none relative">
                                     <div class="absolute top-[15px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                     <div class="absolute top-[30px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                     <div class="absolute top-[45px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                 </div>
                             } @else {
                                 <div class="h-[4px] bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 opacity-50 pointer-events-none"></div>
                             }
                        }

                        <!-- Click Overlay -->
                        <div class="absolute inset-0 z-0 flex flex-col">
                             @for (slot of currentHourSlots; track slot) {
                                @if (slot.type === 'hour') {
                                    <div class="h-[60px] flex flex-col">
                                      @for (quarter of [0, 15, 30, 45]; track quarter) {
                                        <div class="h-[15px] transition-colors relative group"
                                             [ngClass]="{
                                               'bg-gray-200 dark:bg-gray-900': !isSlotAvailable(currentView().date.getDay(), slot.hour),
                                               'cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800': isSlotAvailable(currentView().date.getDay(), slot.hour),
                                               'cursor-not-allowed': !isSlotAvailable(currentView().date.getDay(), slot.hour)
                                             }"
                                             (mouseenter)="hoveredTime.set({hour: slot.hour, minutes: quarter})"
                                             (mouseleave)="hoveredTime.set(null)"
                                             (click)="onTimeSlotClick('day', slot.hour, $event, quarter)">
                                          @if (isSlotAvailable(currentView().date.getDay(), slot.hour)) {
                                            <div class="absolute left-1/2 -translate-x-1/2 -top-7 bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                              {{ slot.hour.toString().padStart(2, '0') }}:{{ quarter.toString().padStart(2, '0') }}
                                            </div>
                                          }
                                        </div>
                                      }
                                    </div>
                                } @else {
                                    <div class="h-[4px] cursor-not-allowed bg-transparent"></div>
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
                                 (click)="onEventClick(event, $event)"
                                 cdkDrag
                                 [cdkDragData]="event"
                                 [cdkDragDisabled]="event.draggable === false || !editable">
                                 <ng-template cdkDragPreview>
                                     <div class="rounded p-2 text-sm overflow-hidden text-white shadow-xl opacity-80"
                                          [style.background-color]="event.color || '#6366f1'"
                                          [style.height]="getEventStyle(event).height"
                                          [style.width]="'200px'">
                                         <div class="font-bold mb-0.5">{{ event.title }}</div>
                                         <div class="text-xs opacity-90 mb-1 flex items-center">
                                            {{ formatEventTime(event) }}
                                         </div>
                                     </div>
                                 </ng-template>
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
  debugLogs = signal<string[]>([]);
  hoveredTime = signal<{ hour: number, minutes: number, dayLabel?: string } | null>(null);
  private _events = signal<CalendarEvent[]>([]);
  @Input() set events(val: CalendarEvent[]) {
    this._events.set(val);
  }
  get events() { return this._events(); }
  @Input() editable = true;
  @Input() selectable = true;
  @Input() constraints: { minHour: number; maxHour: number; workingDays: number[]; schedules?: any[] } | null = null;

  @Output() eventClick = new EventEmitter<CalendarEventClick>();
  @Output() dateClick = new EventEmitter<CalendarDateClick>();
  @Output() addEvent = new EventEmitter<void>();
  @Output() viewChange = new EventEmitter<CalendarView>();
  @Output() eventChange = new EventEmitter<CalendarEvent>();

  onEventDrop(event: CdkDragDrop<any>) {
    const droppedEvent = event.item.data as CalendarEvent;
    if (droppedEvent.draggable === false || !this.editable) return;

    // Use container data: Date of the column (start of day)
    const targetDayDate = new Date(event.container.data);
    const originalStart = new Date(droppedEvent.start);
    const originalEnd = new Date(droppedEvent.end);
    const duration = originalEnd.getTime() - originalStart.getTime();

    let newStartTime = new Date(originalStart);

    if (this.currentView().type === 'month') {
      // Month View: Only changing the DATE, keeping the TIME/Duration
      // event.container.data is the date of the cell
      newStartTime = new Date(targetDayDate);
      newStartTime.setHours(originalStart.getHours());
      newStartTime.setMinutes(originalStart.getMinutes());
      newStartTime.setSeconds(originalStart.getSeconds());
    } else {
      // Week/Day View: Use Delta (Drag Distance)
      // This preserves the relative time shift better than dropPoint

      // event.distance is { x: number, y: number } in pixels
      const deltaY = event.distance.y;

      // Calculate time shift in minutes
      // 60px = 60 minutes => 1px = 1 minute
      const minutesShift = Math.round(deltaY); // simpler than floating point hours

      // Add shift to original start time
      newStartTime.setMinutes(originalStart.getMinutes() + minutesShift);

      // Snap to 15 minutes
      const m = newStartTime.getMinutes();
      const snappedM = Math.round(m / 15) * 15;
      newStartTime.setMinutes(snappedM);
      newStartTime.setSeconds(0);

      // Now apply the TARGET DAY (in case we dragged to a different column)
      // We must combine the "Time from Delta" with "Date from Target Column"
      const timeInDayMs = newStartTime.getTime() - new Date(originalStart.getFullYear(), originalStart.getMonth(), originalStart.getDate()).getTime();

      // Reconstruct: Target Day Start (00:00) + Calculated Time Offset
      const targetDayStart = new Date(targetDayDate);
      targetDayStart.setHours(0, 0, 0, 0);

      // But wait, newStartTime holds the correct TIME derived from the shift.
      // We just need to implant that TIME onto the TARGET DATE.

      // Extract HH:MM from newStartTime (which is Original + Delta)
      const newH = newStartTime.getHours();
      const newM = newStartTime.getMinutes();

      newStartTime = new Date(targetDayDate);
      newStartTime.setHours(newH, newM, 0, 0);
    }

    const newEndTime = new Date(newStartTime.getTime() + duration);

    const updatedEvent = {
      ...droppedEvent,
      start: newStartTime,
      end: newEndTime
    };

    console.log('🔄 Drag Delta:', event.distance.y);
    console.log('📦 Dropped Event Start:', newStartTime);
    console.log('📧 Attendees check:', droppedEvent.attendees);

    this.eventChange.emit(updatedEvent);
  }

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
  // Structure for slots with gaps
  visibleSlotStructure = computed(() => {
    let min = 0;
    let max = 24;

    if (this.constraints) {
      min = this.constraints.minHour;
      max = this.constraints.maxHour;
    }

    if (max <= min) { min = 0; max = 24; }

    const slots: { type: 'hour' | 'gap', hour: number, height: number, debugInfo?: string }[] = [];

    // 1. Identify valid hours from Constraints and Events using a Map for tracing
    const validHoursMap = new Map<number, Set<string>>();
    const addReason = (h: number, reason: string) => {
      if (!validHoursMap.has(h)) validHoursMap.set(h, new Set());
      validHoursMap.get(h)!.add(reason);
    };

    // Add hours based on view type and actual events
    const view = this.currentView();
    let viewStart: Date;
    let viewEnd: Date;

    if (view.type === 'day') {
      // Day view: single day range
      viewStart = new Date(view.date);
      viewStart.setHours(0, 0, 0, 0);
      viewEnd = new Date(view.date);
      viewEnd.setHours(23, 59, 59, 999);

      // For Day view: only add hours that are available for THIS specific day
      const dayIndex = view.date.getDay(); // 0=Sun, 1=Mon, etc.
      for (let i = min; i < max; i++) {
        if (this.isSlotAvailable(dayIndex, i)) {
          addReason(i, 'Day Rule');
        }
      }
    } else {
      // Week view: week range
      viewStart = this.getWeekStart(view.date);
      viewEnd = new Date(viewStart);
      viewEnd.setDate(viewEnd.getDate() + 7);

      // For Week view: add hours from global rules (available on ANY working day)
      for (let i = min; i < max; i++) {
        if (this.isHourGloballyUsed(i)) {
          addReason(i, 'Global Rule');
        }
      }
    }

    const currentEvents = this.events.filter(e => {
      // Check if event overlaps with current week view
      return e.start < viewEnd && e.end > viewStart;
    });

    if (currentEvents.length > 0) {
      currentEvents.forEach(e => {
        const startH = e.start.getHours();
        const endH = e.end.getHours();
        const titleShort = e.title ? e.title.substring(0, 10) : 'Event';

        // Add start hour
        addReason(startH, `Ev Start: ${titleShort}`);

        // Add intermediate hours
        if (e.end.getMinutes() > 0) addReason(endH, `Ev End+: ${titleShort}`);

        for (let h = startH + 1; h < endH; h++) {
          addReason(h, `Ev Span: ${titleShort}`);
        }
      });
    }

    // Convert to sorted array
    const validHours = Array.from(validHoursMap.keys()).sort((a, b) => a - b);

    // 3. Build slots with gaps
    for (let i = 0; i < validHours.length; i++) {
      const h = validHours[i];
      slots.push({ type: 'hour', hour: h, height: 60 });

      // Check for gap
      if (i < validHours.length - 1) {
        const nextH = validHours[i + 1];
        if (nextH > h + 1) {
          // Found a gap (e.g. 13 -> 16)
          slots.push({ type: 'gap', hour: h, height: 4 });
        }
      }
    }
    return slots;
  });

  // Check if an hour is available in AT LEAST ONE working day
  private isHourGloballyUsed(hour: number): boolean {
    if (!this.constraints) return true;
    if (!this.constraints.schedules || this.constraints.schedules.length === 0) return true;

    const workingDays = this.constraints.workingDays || [];
    if (workingDays.length === 0) return true;

    // Check availability
    const isUsed = workingDays.some(dayIndex => {
      return this.isSlotAvailable(dayIndex, hour);
    });

    return isUsed;
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
    return this.isMobile() ? ['month', 'day'] : ['month', 'week', '3days', 'day'];
  });

  ngOnInit() {
    this.checkMobile();
  }

  // Update template iteration variables
  get currentWeekDays() { return this.visibleWeekDays(); }
  get currentHourSlots() { return this.visibleSlotStructure(); }

  // 3-day view computed - returns array of objects with day name and date for next 3 WORKING days
  visible3DaysData = computed(() => {
    const view = this.currentView();
    let currentDate = new Date(view.date);
    const workingDays = this.constraints?.workingDays?.map(d => Number(d)) || [];
    const hasConstraints = workingDays.length > 0;

    const days: { name: string; date: Date }[] = [];
    let checks = 0;

    while (days.length < 3 && checks < 30) {
      const jsDay = currentDate.getDay(); // 0=Sun, 1=Mon, etc.

      // If no constraints or day is a working day, include it
      if (!hasConstraints || workingDays.includes(jsDay)) {
        const dayName = this.weekDays[jsDay === 0 ? 6 : jsDay - 1];
        days.push({ name: dayName, date: new Date(currentDate) });
      }

      currentDate.setDate(currentDate.getDate() + 1);
      checks++;
    }

    return days;
  });

  // Legacy getter for template - returns day names only
  visible3Days = computed(() => this.visible3DaysData().map(d => d.name));

  get current3Days() { return this.visible3Days(); }

  // Get date for a day in 3-day view by index (more reliable)
  getDateFor3DayByIndex(index: number): Date {
    const data = this.visible3DaysData();
    if (index >= 0 && index < data.length) {
      return new Date(data[index].date);
    }
    return new Date(this.currentView().date);
  }

  // Get date for a day in 3-day view - uses index instead of name matching
  getDateFor3Day(dayName: string): Date {
    const data = this.visible3DaysData();
    const index = this.current3Days.indexOf(dayName);
    if (index !== -1 && index < data.length) {
      return new Date(data[index].date);
    }
    // Fallback
    return new Date(this.currentView().date);
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
      '3days': '3 Días',
      day: 'Día'
    };
    return labels[viewType as keyof typeof labels] || viewType;
  }

  setView(type: string) {
    const validType = type as 'month' | 'week' | '3days' | 'day';
    let newDate = this.currentView().date;

    // For day and 3days views, auto-jump to next working day if current day is not working
    if ((validType === 'day' || validType === '3days') && this.constraints?.workingDays?.length) {
      const workingDays = this.constraints.workingDays.map(d => Number(d));
      const currentDay = newDate.getDay();

      if (!workingDays.includes(currentDay)) {
        // Find next working day
        newDate = this.findNextWorkingDate(new Date(newDate), 1);
      }
    }

    this.currentView.update(view => ({ ...view, type: validType, date: newDate }));
    this.viewChange.emit(this.currentView());
  }

  previousPeriod() {
    const view = this.currentView();
    let newDate = new Date(view.date);

    switch (view.type) {
      case 'month':
        newDate.setMonth(newDate.getMonth() - 1);
        break;
      case 'week':
        newDate.setDate(newDate.getDate() - 7);
        break;
      case '3days':
        newDate.setDate(newDate.getDate() - 3);
        break;
      case 'day':
        if (this.constraints?.workingDays?.length) {
          newDate.setDate(newDate.getDate() - 1);
          newDate = this.findNextWorkingDate(newDate, -1);
        } else {
          newDate.setDate(newDate.getDate() - 1);
        }
        break;
    }

    this.currentView.update(v => ({ ...v, date: newDate }));
    this.viewChange.emit(this.currentView());
  }

  nextPeriod() {
    const view = this.currentView();
    let newDate = new Date(view.date);

    switch (view.type) {
      case 'month':
        newDate.setMonth(newDate.getMonth() + 1);
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + 7);
        break;
      case '3days':
        newDate.setDate(newDate.getDate() + 3);
        break;
      case 'day':
        if (this.constraints?.workingDays?.length) {
          newDate.setDate(newDate.getDate() + 1);
          newDate = this.findNextWorkingDate(newDate, 1);
        } else {
          newDate.setDate(newDate.getDate() + 1);
        }
        break;
    }

    this.currentView.update(v => ({ ...v, date: newDate }));
    this.viewChange.emit(this.currentView());
  }

  private findNextWorkingDate(startDate: Date, direction: 1 | -1): Date {
    if (!this.constraints?.workingDays || this.constraints.workingDays.length === 0) {
      return startDate;
    }

    // Ensure workingDays are numbers (handle string/number mismatch from API)
    const workingDays = this.constraints.workingDays.map(d => Number(d));
    let current = new Date(startDate);

    // Safety: max 30 checks to prevent infinite loops if misconfigured
    let checks = 0;
    while (!workingDays.includes(current.getDay()) && checks < 30) {
      current.setDate(current.getDate() + direction);
      checks++;
    }
    return current;
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

  onTimeSlotClick(dayOrView: string, hour: number, event: MouseEvent, minutes: number = 0) {
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

    slotDate.setHours(hour, minutes, 0, 0);
    this.onDateClick(slotDate, false, event);
  }

  // Handler for 3-day view time slot clicks
  onTimeSlotClick3Day(dayName: string, hour: number, event: MouseEvent, minutes: number = 0) {
    const slotDate = this.getDateFor3Day(dayName);
    const jsDayIndex = slotDate.getDay();

    if (!this.isSlotAvailable(jsDayIndex, hour)) {
      return;
    }

    slotDate.setHours(hour, minutes, 0, 0);
    this.onDateClick(slotDate, false, event);
  }

  // Get events for a specific date (used in 3-day view)
  getEventsForDate(date: Date): CalendarEvent[] {
    return this.events.filter(event => {
      const eventDate = new Date(event.start);
      return eventDate.getFullYear() === date.getFullYear() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getDate() === date.getDate();
    });
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

  getDateForWeekDay(dayName: string): Date {
    const view = this.currentView();
    const weekStart = this.getWeekStart(view.date); // Monday
    const dayIndex = this.weekDays.indexOf(dayName); // 0=Mon, 1=Tue... (based on weekDays array)

    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    return date;
  }

  getWeekDayNumber(dayName: string): number {
    return this.getDateForWeekDay(dayName).getDate();
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

    // Check specific schedules (e.g., 09-13, 16-20)
    // The property is 'day_of_week' (0-6) from Supabase
    // Robustly compare as numbers to avoid "1" !== 1 issues
    const dailySchedules = this.constraints.schedules.filter((s: any) => Number(s.day_of_week) === Number(dayIndex));

    // If schedules exist for this day, we must validate against them
    if (dailySchedules.length > 0) {
      return dailySchedules.some((s: any) => {
        // Parse HH:MM:SS safely
        const startH = parseInt(String(s.start_time).split(':')[0], 10);
        const timeParts = String(s.end_time).split(':');
        let endH = parseInt(timeParts[0], 10);
        const endM = parseInt(timeParts[1], 10);

        if (endM > 0) endH++;

        return hour >= startH && hour < endH;
      });
    }

    // If it is a "Working Day" but has NO schedules defined:
    // This usually means data error or "Not Configured". 
    // Defaulting to FALSE (Closed) is safer for "Gap detection" than showing 24h open.
    return false;
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
    return this.constraints.workingDays.map(d => Number(d)).includes(date.getDay());
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
