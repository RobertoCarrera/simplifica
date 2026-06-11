import { Component, Input, Output, EventEmitter, computed, signal, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, CdkDragEnd, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CalendarEvent, CalendarView, CalendarDay, CalendarEventClick, CalendarDateClick } from './calendar.interface';
import { AnimationService } from '../../services/animation.service';
import { AgendaComponent } from '../agenda/agenda.component';
import { ThemeService } from '../../services/theme.service';
import { BlockDatesModalService } from '../../services/block-dates-modal.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseBookingsService, SourceIconConfig, DEFAULT_ICONS } from '../../services/supabase-bookings.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, DragDropModule, AgendaComponent, RouterModule],
  animations: [AnimationService.fadeInUp, AnimationService.slideIn],
  template: `
    <div class="bg-white dark:bg-gray-800 overflow-hidden flex flex-col h-full w-full relative" @fadeInUp>
      <!-- Header (fixed, never scrolls) -->
      <div 
        class="px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0 transition-colors duration-300"
        [ngClass]="{
          'bg-gradient-to-r from-blue-500 to-blue-600': currentTheme() === 'light',
          'bg-gray-800 border-b border-gray-700': currentTheme() === 'dark'
        }"
      >
        <div class="flex flex-col gap-3">
          <!-- Single row: Date + Nav + Search + (View selector if not owner) + Settings + Copy link -->
          <div class="flex items-center justify-between gap-3">
            <!-- Left: Date + Nav -->
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

            <!-- Right: Search (mobile-hidden, moved to mobile controls row) + View selector + Settings + Copy link (owner) -->
            <div class="flex items-center gap-2">
              @if (loading()) {
                <div class="hidden sm:block w-48 h-8 bg-white/10 animate-pulse rounded-lg"></div>
              } @else {
                <!-- Search bar (desktop/tablet only; mobile version lives in the mobile controls row below) -->
                <div class="relative hidden sm:block">
                  <i class="fas fa-search absolute left-3 top-2.5 text-white/50"></i>
                  <input
                    type="text"
                    [value]="searchQuery()"
                    (input)="searchQuery.set($any($event.target).value)"
                    placeholder="Buscar..."
                    aria-label="Buscar reservas"
                    class="border border-white/20 rounded-lg pl-9 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm bg-white/10 text-white placeholder-white/60 backdrop-blur-sm w-32 md:w-64"
                  >
                </div>
              }

              @if (!hideViewSelector) {
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
              }

              <!-- Toggle cancelled (always visible) -->
              <button
                (click)="showCancelled.update(v => !v)"
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg transition-all"
                [class]="showCancelled() ? 'bg-white/20 text-white border-white/30' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/80'"
                [title]="showCancelled() ? 'Ocultar canceladas' : 'Mostrar canceladas'">
                <i class="fas fa-calendar-xmark text-xs"></i>
              </button>

              <!-- Extra controls projected from parent (e.g. copy link button for owner) -->
              <ng-content select="[calendarToolbarRight]"></ng-content>

              <!-- Block dates button (only visible to professionals in top bar; owners use sidebar dropdown) -->
              @if (isProfessionalRole()) {
                <button
                  (click)="openBlockDatesModal()"
                  class="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/20 rounded-lg transition-all text-xs font-bold"
                  title="Bloquear fechas">
                  <i class="fas fa-calendar-times text-xs"></i>
                  <span class="hidden sm:inline">Bloquear</span>
                </button>
              }

              <!-- Settings gear -->
              @if (!loading()) {
                <button
                  (click)="settingsClick.emit($event)"
                  class="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/20 rounded-lg transition-all text-xs font-bold"
                  title="Configuración">
                  <i class="fas fa-cog text-xs"></i>
                </button>
              }
            </div>
          </div>

          <!-- Mobile Controls Row (hidden on sm+): search + prev/today/next + copy link -->
          <div class="flex items-center gap-2 sm:hidden border-t border-white/10 pt-3">
            @if (loading()) {
              <div class="flex-1 h-8 bg-white/10 animate-pulse rounded-lg"></div>
              <div class="h-8 w-32 bg-white/10 animate-pulse rounded-lg shrink-0"></div>
              <div class="h-8 w-10 bg-white/10 animate-pulse rounded-lg shrink-0"></div>
            } @else {
              <!-- Mobile search bar -->
              <div class="relative flex-1 min-w-0">
                <i class="fas fa-search absolute left-3 top-2.5 text-white/50 text-xs"></i>
                <input
                  type="text"
                  [value]="searchQuery()"
                  (input)="searchQuery.set($any($event.target).value)"
                  placeholder="Buscar..."
                  aria-label="Buscar reservas"
                  class="border border-white/20 rounded-lg pl-8 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm bg-white/10 text-white placeholder-white/60 backdrop-blur-sm w-full"
                >
              </div>
              <div class="flex items-center bg-white/10 rounded-lg p-1 border border-white/10 shrink-0">
                <button
                  (click)="previousPeriod()"
                  aria-label="Periodo anterior"
                  class="p-1.5 text-white hover:bg-white/20 rounded-md transition-colors">
                  <i class="fas fa-chevron-left text-xs"></i>
                </button>
                <button
                  (click)="today()"
                  class="px-2 py-0.5 text-[11px] font-bold text-white uppercase tracking-wider">
                  Hoy
                </button>
                <button
                  (click)="nextPeriod()"
                  aria-label="Periodo siguiente"
                  class="p-1.5 text-white hover:bg-white/20 rounded-md transition-colors">
                  <i class="fas fa-chevron-right text-xs"></i>
                </button>
              </div>
              <button
                (click)="copyLinkClick.emit()"
                aria-label="Compartir enlace agenda"
                class="flex items-center justify-center p-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/20 rounded-lg transition-all shrink-0"
                title="Compartir enlace agenda">
                <i class="fas fa-share-alt text-xs"></i>
              </button>
            }
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
                           <div class="h-[80px] border-b border-gray-100 dark:border-gray-700 relative">
                              <span class="absolute top-1 right-2 text-xs text-gray-400 block">
                                 {{ formatHour(slot.hour) }}
                              </span>
                           </div>
                      }
                 </div>
                @for (day of visibleWeekDays(); track day) {
                    @let weekDate = getDateForWeekDay(day);
                    @let weekBlock = getBlockedDateForDay(weekDate);
                    <div class="col-span-1 relative border-r border-gray-100 dark:border-gray-700"
                         cdkDropList
                         [cdkDropListData]="weekDate"
                         [cdkDropListDisabled]="!!weekBlock"
                         (cdkDropListDropped)="onEventDrop($event)">
                        @for (slot of visibleSlotStructure(); track slot.hour) {
                            <div class="h-[80px] border-b border-gray-100 dark:border-gray-700 relative transition-colors"
                                 [class.cursor-pointer]="!weekBlock"
                                 [class.hover:bg-blue-50/30]="!weekBlock"
                                 [class.cursor-not-allowed]="!!weekBlock"
                                 [class.bg-gray-100]="!!weekBlock"
                                 [class.dark:bg-gray-900]="!!weekBlock"
                                 (click)="weekBlock ? null : onDateClick(weekDate, false, $event, slot.hour)">
                                <div class="absolute top-[20px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                <div class="absolute top-[40px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                                <div class="absolute top-[60px] left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700 opacity-60"></div>
                            </div>
                        }
                        @if (weekBlock) {
                          <div class="absolute inset-0 z-20 pointer-events-none flex items-center justify-center"
                               [style.background-image]="'repeating-linear-gradient(135deg, rgba(156,163,175,0.18) 0px, rgba(156,163,175,0.18) 8px, transparent 8px, transparent 16px)'">
                            <div class="bg-gray-700/85 text-white text-[11px] font-semibold px-2 py-1 rounded shadow text-center">
                              <i class="fas fa-ban mr-1"></i>Día no disponible
                              @if (weekBlock.reason) { <div class="text-[9px] font-normal opacity-80 mt-0.5">{{ weekBlock.reason }}</div> }
                            </div>
                          </div>
                        }
                        <div class="absolute inset-x-0 top-0 mx-1 z-10">
                          @for (event of getEventsForDay(day); track event.id) {
<div class="absolute inset-x-0 rounded p-1 pr-6 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-all z-10 shadow-sm relative"
                                     [style.border-left-color]="getEventBorderColor($any(event))"
                                     [style.border-left-width]="'4px'"
                                     [style.border-left-style]="'solid'"
                               [class.opacity-50]="$any(event).extendedProps?.shared?.status === 'cancelled'"
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
<div class="flex items-center gap-1">
                                      <div class="leading-tight">
                                       <span class="font-semibold truncate block">{{ $any(event).extendedProps?.shared?.clientName || event.title.split(' - ')[0] }}</span>
                                    @if ($any(event).extendedProps?.shared?.status === 'cancelled') {
                                      <span class="text-[9px] font-bold text-red-500 uppercase tracking-wider bg-red-100 dark:bg-red-900/30 px-1 rounded">Cancelada</span>
                                    }
                                       @if ($any(event).extendedProps?.shared?.serviceName) {
                                         <span class="text-[10px] opacity-70 truncate block">{{ $any(event).extendedProps?.shared?.serviceName }}</span>
                                       }
                                     </div>
                                     @if ($any(event).extendedProps?.shared?.source === 'docplanner' && $any(event).extendedProps?.shared?.dp_service_unmapped) {
                                       <span class="relative group flex-shrink-0" title="Servicio de Doctoralia no asociado. Asígnelo en Configuración > Integraciones > Doctoralia.">
                                         <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold cursor-help">!</span>
                                         <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Servicio de Doctoralia no asociado</span>
                                       </span>
                                     }
                                     @if (missingFields($any(event)).length > 0 && !($any(event).extendedProps?.shared?.dp_service_unmapped)) {
                                       @let mf2 = missingFields($any(event));
                                       <span class="relative group flex-shrink-0" title="Falta: {{ mf2.join(', ') }}">
                                         <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold cursor-help animate-pulse">!</span>
                                         <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Falta: {{ mf2.join(', ') }}</span>
                                       </span>
                                     }
@if (missingFields($any(event)).length > 0 && !($any(event).extendedProps?.shared?.dp_service_unmapped)) {
                                          @let mf = missingFields($any(event));
                                          <span class="relative group flex-shrink-0" title="Falta: {{ mf.join(', ') }}">
                                            <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold cursor-help animate-pulse">!</span>
                                            <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Falta: {{ mf.join(', ') }}</span>
                                          </span>
                                        }
                                      </div>
                                       <!-- Top-right source icons -->
                                       <div class="absolute top-1 right-1 flex items-center gap-1">
                                       @let sourceKey = $any(event).extendedProps?.shared?.source;
                                       @if (sourceKey && sourceKey !== 'docplanner') {
                                         <span class="text-[10px] opacity-80" title="{{ getSourceIcon(sourceKey)?.label }}">
                                           {{ getSourceIcon(sourceKey)?.icon }}
                                         </span>
                                       }
 @if ($any(event).extendedProps?.shared?.source === 'docplanner') {
                                    <span class="bg-white rounded-full inline-flex items-center justify-center flex-shrink-0" style="width:14px;height:14px"><img src="https://www.doctoralia.es/favicon.ico" style="width:10px;height:10px" alt="Doctoralia"></span>
                                  }
                                       </div>
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
                           <div class="h-[80px] border-b border-gray-100 dark:border-gray-700 relative">
                              <span class="absolute top-1 right-2 text-xs text-gray-400 block">
                                 {{ formatHour(slot.hour) }}
                              </span>
                           </div>
                      }
                 </div>
                @for (day of visible3Days(); track $index) {
                    @let day3Date = getDateFor3Day(day);
                    @let day3Block = getBlockedDateForDay(day3Date);
                    <div class="col-span-1 relative border-r border-gray-100 dark:border-gray-700"
                         cdkDropList
                         [cdkDropListData]="day3Date"
                         [cdkDropListDisabled]="!!day3Block"
                         (cdkDropListDropped)="onEventDrop($event)">
                        @for (slot of visibleSlotStructure(); track slot.hour) {
                            <div class="h-[80px] border-b border-gray-100 dark:border-gray-700 relative transition-colors"
                                 [class.cursor-pointer]="!day3Block"
                                 [class.hover:bg-blue-50/30]="!day3Block"
                                 [class.cursor-not-allowed]="!!day3Block"
                                 [class.bg-gray-100]="!!day3Block"
                                 [class.dark:bg-gray-900]="!!day3Block"
                                 (click)="day3Block ? null : onDateClick(day3Date, false, $event)"></div>
                        }
                        @if (day3Block) {
                          <div class="absolute inset-0 z-20 pointer-events-none flex items-center justify-center"
                               [style.background-image]="'repeating-linear-gradient(135deg, rgba(156,163,175,0.18) 0px, rgba(156,163,175,0.18) 8px, transparent 8px, transparent 16px)'">
                            <div class="bg-gray-700/85 text-white text-[11px] font-semibold px-2 py-1 rounded shadow text-center">
                              <i class="fas fa-ban mr-1"></i>Día no disponible
                              @if (day3Block.reason) { <div class="text-[9px] font-normal opacity-80 mt-0.5">{{ day3Block.reason }}</div> }
                            </div>
                          </div>
                        }
                        @for (event of getEventsForDate(getDateFor3Day(day)); track event.id) {
                             <div class="absolute inset-x-0 mx-1 rounded p-1 text-xs overflow-hidden cursor-pointer hover:opacity-90 transition-all z-10 shadow-sm relative"
                                 [style.border-left-color]="getEventBorderColor($any(event))"
                                 [style.border-left-width]="'4px'"
                                 [style.border-left-style]="'solid'"
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
<div class="font-semibold truncate flex items-center gap-1">
                                    <div class="leading-tight min-w-0">
                                     <span class="truncate block">{{ $any(event).extendedProps?.shared?.clientName || event.title.split(' - ')[0] }}</span>
                                     @if ($any(event).extendedProps?.shared?.serviceName) {
                                       <span class="text-[10px] opacity-70 truncate block">{{ $any(event).extendedProps?.shared?.serviceName }}</span>
                                     }
                                   </div>
                                   @if ($any(event).extendedProps?.shared?.source === 'docplanner' && $any(event).extendedProps?.shared?.dp_service_unmapped) {
                                     <span class="relative group flex-shrink-0" title="Servicio de Doctoralia no asociado. Asígnelo en Configuración > Integraciones > Doctoralia.">
                                       <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold cursor-help">!</span>
                                       <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Servicio de Doctoralia no asociado</span>
                                     </span>
                                   }
@if (missingFields($any(event)).length > 0 && !($any(event).extendedProps?.shared?.dp_service_unmapped)) {
                                      @let mf3 = missingFields($any(event));
                                      <span class="relative group flex-shrink-0" title="Falta: {{ mf3.join(', ') }}">
                                        <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold cursor-help animate-pulse">!</span>
                                        <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Falta: {{ mf3.join(', ') }}</span>
                                      </span>
                                    }
                                   </div>
                                   <!-- Top-right source icons -->
                                   <div class="absolute top-1 right-1 flex items-center gap-1">
                                   @let srcKey3 = $any(event).extendedProps?.shared?.source;
                                   @if (srcKey3 && srcKey3 !== 'docplanner') {
                                     <span class="text-[10px] opacity-80" title="{{ getSourceIcon(srcKey3)?.label }}">
                                       {{ getSourceIcon(srcKey3)?.icon }}
                                     </span>
                                   }
                                  @if ($any(event).extendedProps?.shared?.source === 'docplanner') {
                                    <span class="bg-white rounded-full inline-flex items-center justify-center flex-shrink-0" style="width:14px;height:14px"><img src="https://www.doctoralia.es/favicon.ico" style="width:10px;height:10px" alt="Doctoralia"></span>
                                  }
                                   </div>
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
                  @let monthBlock = day.isCurrentMonth ? getBlockedDateForDay(day.date) : null;
                  <div
                    class="min-h-[100px] p-1 transition-colors relative group"
                    [ngClass]="monthBlock
                      ? 'bg-gray-100 dark:bg-gray-900 cursor-not-allowed'
                      : (day.isCurrentMonth
                        ? 'bg-white dark:bg-gray-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700'
                        : 'bg-white dark:bg-gray-800 opacity-50 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700')"
                    (click)="day.isCurrentMonth && !monthBlock && onDateClick(day.date, true, $event)">
                    @if (monthBlock) {
                      <div class="absolute inset-0 z-10 pointer-events-none flex items-center justify-center"
                           [style.background-image]="'repeating-linear-gradient(135deg, rgba(156,163,175,0.22) 0px, rgba(156,163,175,0.22) 8px, transparent 8px, transparent 16px)'">
                        <div class="bg-gray-700/85 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded shadow text-center">
                          <i class="fas fa-ban mr-1"></i>Bloqueado
                        </div>
                      </div>
                    }
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
<div class="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 transition-all relative"
                             [style.border-left-color]="getEventBorderColor($any(event))"
                             [style.border-left-width]="'2px'"
                             [style.border-left-style]="'solid'"
                              [class.opacity-20]="hasActiveSearch() && !isEventMatchingSearch(event)"
                              [class.ring-1]="hasActiveSearch() && isEventMatchingSearch(event)"
                              [class.ring-yellow-400]="hasActiveSearch() && isEventMatchingSearch(event)"
                              [style.background-color]="getEventStyle(event).backgroundColor"
                              [style.color]="getEventStyle(event).color"
                              (click)="onEventClick(event, $event)">
                          <span class="font-medium">{{ formatEventTime(event) }}</span>
                          <span class="ml-1 truncate">{{ $any(event).extendedProps?.shared?.clientName || event.title.split(' - ')[0] }}</span>
                          @if ($any(event).extendedProps?.shared?.source === 'docplanner') {
                            <span class="bg-white rounded-full inline-flex items-center justify-center flex-shrink-0" style="width:14px;height:14px"><img src="https://www.doctoralia.es/favicon.ico" style="width:10px;height:10px" alt="Doctoralia"></span>
                          }
                           @if ($any(event).extendedProps?.shared?.source === 'docplanner' && $any(event).extendedProps?.shared?.dp_service_unmapped) {
                             <span class="relative group inline-flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[8px] font-bold ml-1 flex-shrink-0 cursor-help" title="Servicio de Doctoralia no asociado. Asígnelo en Configuración > Integraciones > Doctoralia.">
                               !
                               <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Servicio de Doctoralia no asociado</span>
                             </span>
                           }
@if (missingFields($any(event)).length > 0 && !($any(event).extendedProps?.shared?.dp_service_unmapped)) {
                             @let mfM = missingFields($any(event));
                             <span class="relative group inline-flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[8px] font-bold ml-1 flex-shrink-0 cursor-help animate-pulse" title="Falta: {{ mfM.join(', ') }}">
                               !
                               <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Falta: {{ mfM.join(', ') }}</span>
                             </span>
                           }
@let srcKeyM = $any(event).extendedProps?.shared?.source;
                            @if (srcKeyM && srcKeyM !== 'docplanner') {
                              <span class="text-[10px] opacity-80 ml-1" title="{{ getSourceIcon(srcKeyM)?.label }}">
                                {{ getSourceIcon(srcKeyM)?.icon }}
                              </span>
                            }
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
                          <div class="h-[80px] text-xs text-gray-400 text-right pr-2 relative border-b border-gray-100 dark:border-gray-700">
                             <span class="block pt-1">{{ formatHour(slot.hour) }}</span>
                          </div>
                     }
                   </div>
                   <div class="flex-1 relative" cdkDropList [cdkDropListData]="currentView().date" (cdkDropListDropped)="onEventDrop($event)">
                        @for (slot of visibleSlotStructure(); track slot.hour) {
                             <div class="h-[80px] border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-blue-50/30 transition-colors"
                                  (click)="onDateClick(currentView().date, false, $event, slot.hour)"></div>
                        }
                        @for (event of currentDayEvents(); track event.id) {
                            <div class="absolute left-1 right-1 rounded p-2 text-sm overflow-hidden cursor-pointer hover:opacity-90 transition-all z-10 shadow-sm"
                                 [style.border-left-color]="getEventBorderColor($any(event))"
                                 [style.border-left-width]="'4px'"
                                 [style.border-left-style]="'solid'"
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
<div class="font-bold mb-0.5 flex items-center gap-1">
                                  <div class="leading-tight min-w-0">
                                     <span class="truncate block">{{ $any(event).extendedProps?.shared?.clientName || event.title.split(' - ')[0] }}</span>
                                     @if ($any(event).extendedProps?.shared?.serviceName) {
                                       <span class="text-[10px] opacity-70 truncate block">{{ $any(event).extendedProps?.shared?.serviceName }}</span>
                                     }
                                   </div>
                                   @if ($any(event).extendedProps?.shared?.source === 'docplanner' && $any(event).extendedProps?.shared?.dp_service_unmapped) {
                                     <span class="relative group flex-shrink-0" title="Servicio de Doctoralia no asociado. Asígnelo en Configuración > Integraciones > Doctoralia.">
                                       <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold cursor-help">!</span>
                                       <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Servicio de Doctoralia no asociado</span>
                                     </span>
                                   }
                                   @if (missingFields($any(event)).length > 0 && !($any(event).extendedProps?.shared?.dp_service_unmapped)) {
                                     @let mfDay = missingFields($any(event));
                                     <span class="relative group flex-shrink-0" title="Falta: {{ mfDay.join(', ') }}">
                                       <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold cursor-help animate-pulse">!</span>
                                       <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">Falta: {{ mfDay.join(', ') }}</span>
                                     </span>
                                   }
                                 </div>
                                   <div class="text-xs">{{ formatEventTime(event) }}</div>
                                 @if (event.resourceName) {
                                   <div class="text-xs opacity-80 flex items-center gap-1 mt-0.5">
                                     <i class="fas fa-door-open" style="font-size:10px"></i>
                                     <span>{{ event.resourceName }}</span>
                                   </div>
                                 }
                                 @if ($any(event).extendedProps?.shared?.source === 'docplanner') {
                                   <span class="bg-white rounded-full inline-flex items-center justify-center flex-shrink-0" style="width:14px;height:14px"><img src="https://www.doctoralia.es/favicon.ico" style="width:10px;height:10px" alt="Doctoralia"></span>
                                 }
                            </div>
                        }
                  </div>
              </div>
            </div>
          }
          @case ('agenda') {
            <div class="agenda-view w-full h-full flex flex-col flex-1 min-h-0" @slideIn>
                <app-agenda class="w-full h-full" [constraints]="constraints" [date]="currentView().date" [eventsData]="currentDayEvents()" [sourceIconsMap]="sourceIcons()" [hasCompanyResources]="hasCompanyResources()" (dateChange)="onAgendaDateChange($event)" (dateClick)="onAgendaDateClick($event)" [searchQuery]="searchQuery()" (eventClick)="onEventClick($event.event, $event.nativeEvent)"></app-agenda>
            </div>
          }
        }
      </div>
      <!-- Floating debug counter (supervisor debug) -->
      @if (isSupervisorDebug() && (bookingsWithoutService() > 0 || bookingsWithoutResource() > 0)) {
        <div class="absolute bottom-3 left-3 z-30 bg-gray-900/90 dark:bg-gray-700/90 backdrop-blur-sm text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-600/50 space-y-1">
          @if (bookingsWithoutService() > 0) {
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold">!</span>
              <span>{{ bookingsWithoutService() }} sin servicio</span>
            </div>
          }
          @if (bookingsWithoutResource() > 0) {
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold">!</span>
              <span>{{ bookingsWithoutResource() }} sin recurso</span>
            </div>
          }
        </div>
      }
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
    return (this._events() ?? []).filter(e => this.isSameDay(e.start, this.currentView().date));
  });
  @Input() set events(val: CalendarEvent[]) { this._events.set(val ?? []); }
  get events() { return this._events(); }
  @Input() editable = true;
  @Input() selectable = true;
  @Input() fabHidden = false;
  @Input() hideViewSelector = false;
  /**
   * Blocked dates to render visually as unavailable days. The DB-level trigger
   * `trg_bookings_blocked_dates` already REJECTS any INSERT/UPDATE on a
   * blocked date — this input is purely cosmetic: it makes the day unselectable
   * in the UI (no click → no event-form opens) and shows a "Día no disponible"
   * overlay. Pass the same array the parent already loads from
   * ProfessionalBlockedDatesService.
   */
  private _blockedDates = signal<{ start_date: string; end_date: string; all_day?: boolean; start_time?: string; end_time?: string; reason?: string }[]>([]);
  @Input() set blockedDates(val: { start_date: string; end_date: string; all_day?: boolean; start_time?: string; end_time?: string; reason?: string }[] | null | undefined) {
    this._blockedDates.set(val ?? []);
  }
  get blockedDates() { return this._blockedDates(); }
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
  private router = inject(Router);
  private blockDatesService = inject(BlockDatesModalService);
  private authService = inject(AuthService);
  private bookingsService = inject(SupabaseBookingsService);

  openBlockDatesModal() {
    const profile = this.authService.userProfile as any;
    const activeProfId = (this.authService as any).activeProfessionalId?.();
    const profId = activeProfId || profile?.professional_id || null;

    if (this.authService.userRole() === 'professional' && profId) {
      // Pre-fill with the professional's own ID (read-only in modal)
      this.blockDatesService.open({ professionalId: profId });
    } else {
      // Owner/admin: open with empty professional (user selects)
      this.blockDatesService.open({});
    }
  }

  isProfessionalRole(): boolean {
    return this.authService.userRole() === 'professional';
  }

  // Debug visibility: only owner sees debug elements
  isSupervisorDebug(): boolean {
    const role = this.authService.userRole();
    return role === 'owner' || !!this.authService.userProfile?.is_super_admin || this.authService.isRoberto();
  }

  @Output() eventClick = new EventEmitter<CalendarEventClick>();
  @Output() dateClick = new EventEmitter<CalendarDateClick>();
  @Output() addEvent = new EventEmitter<void>();
  @Output() viewChange = new EventEmitter<CalendarView>();
  @Output() eventChange = new EventEmitter<CalendarEvent>();
  @Output() settingsClick = new EventEmitter<MouseEvent>();
  @Output() copyLinkClick = new EventEmitter<void>();

  // Show/hide cancelled bookings
  showCancelled = signal(false);

  currentView = signal<CalendarView>({ type: 'agenda', date: new Date() });
  searchQuery = signal<string>('');
  selectedDate = signal<Date | null>(null);
  isMobile = signal(false);
  sourceIcons = signal<Map<string, SourceIconConfig>>(new Map());

  /** Returns the icon+label config for a given source key, falling back to DEFAULT_ICONS */
  getSourceIcon(sourceKey: string): SourceIconConfig | undefined {
    if (!sourceKey) return undefined;
    const custom = this.sourceIcons().get(sourceKey);
    if (custom) return custom;
    return DEFAULT_ICONS[sourceKey as keyof typeof DEFAULT_ICONS];
  }

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

  // Computed: effective min hour — derived from actual slot structure (may differ from constraints.minHour when schedules are active)
  effectiveMinHour = computed(() => {
    const slots = this.visibleSlotStructure();
    return slots.length > 0 ? slots[0].hour : (this.constraints?.minHour ?? 8);
  });

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
      for (let h = min; h <= max; h++) structure.push({ type: 'hour', hour: h, height: 80 });
      return structure;
    }
    const structure: any[] = [];
    for (const schedule of daySchedules) {
      const startH = parseInt(schedule.start_time.split(':')[0], 10);
      const endH = parseInt(schedule.end_time.split(':')[0], 10) + 1; // +1 buffer
      for (let h = startH; h <= endH; h++) {
        if (!structure.some(s => s.hour === h)) structure.push({ type: 'hour', hour: h, height: 80 });
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

  /**
   * Loads custom source icons for the given company.
   * Should be called by the parent component after company context is available.
   */
  loadSourceIcons(companyId: string): void {
    this.bookingsService.getBookingSourceIcons(companyId).then(icons => {
      const map = new Map<string, SourceIconConfig>();
      for (const icon of icons) {
        map.set(icon.source, { icon: icon.icon, label: icon.label });
      }
      this.sourceIcons.set(map);
    }).catch(err => {
      console.warn('[CalendarComponent] Failed to load source icons:', err);
    });
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
  navigateToWaitlist() { this.router.navigate(['/waitlist']); }
  onAgendaDateChange(d: Date) { 
    this.currentView.update(v => ({ ...v, date: d })); 
  }
  onAgendaDateClick(e: { date: Date; professional?: any }) { this.dateClick.emit({ date: e.date, allDay: false, nativeEvent: new MouseEvent('click'), professional: e.professional }); }

  getEventsForDate(date: Date) {
    const events = this.events.filter((e: CalendarEvent) => this.isSameDay(e.start, date));
    if (!this.showCancelled()) {
      return events.filter((e: CalendarEvent) => (e.extendedProps?.shared as any)?.status !== 'cancelled');
    }
    return events;
  }
  getEventsForDay(dayName: string) { return this.getEventsForDate(this.getDateForWeekDay(dayName)); }
  

  isSameDay(d1: any, d2: any) { d1 = new Date(d1); d2 = d2 instanceof Date ? d2 : (d2 ? new Date(d2) : new Date()); return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(); }
  isDayWorking(d: Date) { return !this.constraints?.workingDays?.length || this.constraints.workingDays.includes(d.getDay()); }

  // ─── Blocked dates (visual) ─────────────────────────────────────────
  /** Returns the blocked-date record that covers a given date, or null. */
  getBlockedDateForDay(d: Date): { start_date: string; end_date: string; all_day?: boolean; start_time?: string; end_time?: string; reason?: string } | null {
    if (!this._blockedDates().length) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    return this._blockedDates().find(b => b.start_date <= dateStr && b.end_date >= dateStr) ?? null;
  }
  isDayBlocked(d: Date): boolean { return !!this.getBlockedDateForDay(d); }

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
  formatEventTime(e: CalendarEvent) {
    const t = this.getEventTimes(e);
    return `${t.hour}:${t.minutes.toString().padStart(2, '0')}`;
  }

  hasCompanyResources = computed(() => this.events.some((e: CalendarEvent) =>
    !!(e.extendedProps?.shared?.resourceId || e.extendedProps?.shared?.resourceName)
  ));

  bookingsWithoutService = computed(() =>
    this.events.filter((e: CalendarEvent) => 
      (e.extendedProps?.shared as any)?.status !== 'cancelled' &&
      !e.extendedProps?.shared?.serviceId && !e.extendedProps?.shared?.serviceName
    ).length
  );

  bookingsWithoutResource = computed(() => {
    if (!this.hasCompanyResources()) return 0;
    return this.events.filter((e: CalendarEvent) =>
      (e.extendedProps?.shared as any)?.status !== 'cancelled' &&
      !!e.extendedProps?.shared?.professionalId && !e.extendedProps?.shared?.resourceId && !e.extendedProps?.shared?.resourceName
    ).length;
  });

  missingFields(e: CalendarEvent): string[] {
    const shared = e.extendedProps?.shared;
    if ((shared as any)?.status === 'cancelled') return [];
    const missing: string[] = [];
    if (!shared?.serviceId && !shared?.serviceName) missing.push('Servicio');
    if (this.hasCompanyResources() && shared?.professionalId && !shared?.resourceId && !shared?.resourceName) missing.push('Recurso');
    return missing;
  }

  /** Dynamic border-left color: green=complete, red=has issues, gray=cancelled */
  getEventBorderColor(e: CalendarEvent): string {
    if ((e.extendedProps?.shared as any)?.status === 'cancelled') return '#94a3b8';
    const missing = this.missingFields(e);
    const dpUnmapped = (e.extendedProps?.shared as any)?.dp_service_unmapped;
    if (missing.length > 0 || dpUnmapped) return '#ef4444';
    return '#22c55e';
  }

  /**
   * Returns the wall-clock { hour, minutes, start, end } for an event.
   *
   * `BookingSettingsComponent.mapBookingToEvent` now passes `start`/`end` as
   * the RAW ISO string from PostgREST (e.g. `2026-06-08T15:30:00.000Z` or
   * `2026-06-08T17:30:00+02:00`) — NOT a `new Date(...)` — so we can read the
   * wall-clock hour/minute from the literal "HH:mm" of that string. That
   * anchors the slot position to the time the professional entered, regardless
   * of the browser's local TZ.
   *
   * Why: the DB column is `TIMESTAMPTZ` and the company is in Europe/Madrid.
   * If the professional's browser is in a different TZ (mobile with VPN,
   * system clock wrong, etc.) `getHours()` would shift the time by the TZ
   * delta and push the event into a different slot. Reading the literal
   * "HH:mm" sidesteps that entirely.
   *
   * Falls back to `getHours()`/`getMinutes()` if the value is a Date object
   * (e.g. coming from `mergeGoogleEvents` or `onEventChange`).
   */
  private getEventTimes(e: CalendarEvent) {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const wall = this.extractWallClock(e.start);
    return {
      start,
      end,
      hour: wall.hour,
      minutes: wall.minutes,
    };
  }

  /**
   * Extract the wall-clock hour and minutes from a date-like value.
   * - Strings matching `YYYY-MM-DDTHH:mm[:ss[.sss]](Z|±HH:MM)?` → the literal
   *   HH/mm from the string (the time the professional entered).
   * - Anything else (Date object, naive string) → fallback to
   *   `getHours()` / `getMinutes()` on the Date.
   */
  private extractWallClock(value: any): { hour: number; minutes: number } {
    if (typeof value === 'string') {
      const m = value.match(/T(\d{2}):(\d{2})/);
      if (m) {
        return { hour: Number(m[1]), minutes: Number(m[2]) };
      }
    }
    const d = new Date(value);
    return { hour: d.getHours(), minutes: d.getMinutes() };
  }

  getEventTopRelative(e: CalendarEvent) {
    const t = this.getEventTimes(e);
    const min = this.effectiveMinHour();
    return `${(t.hour - min) * 80 + Math.round(t.minutes * 80 / 60)}px`;
  }

  getEventStyle(e: CalendarEvent) {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const height = Math.max(Math.round((end.getTime() - start.getTime()) / 60000 * 80 / 60), 28);
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
