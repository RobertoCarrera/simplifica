import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TiptapEditorComponent } from '../../shared/ui/tiptap-editor/tiptap-editor.component';
import {
  SupabaseMarketingService,
  MarketingCampaign,
  MarketingClient,
  ClientFilters,
  FilterOptions,
  Locality,
} from '../../services/supabase-marketing.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { LocalitiesService } from '../../services/localities.service';

@Component({
  selector: 'app-campaign-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslocoPipe, TiptapEditorComponent],
  template: `
    <div class="h-full bg-slate-50 dark:bg-slate-900/40 flex flex-col">
      <!-- Sticky top bar -->
      <div class="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm">
        <div class="flex items-center gap-4 px-4 md:px-6 py-3">
          <a routerLink="/marketing" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            <i class="fas fa-arrow-left mr-1"></i>
          </a>
          <h1 class="text-lg font-bold text-gray-900 dark:text-white">
            {{ isEditing() ? ('marketing.editCampaign' | transloco) : ('marketing.newCampaign' | transloco) }}
          </h1>
          <div class="ml-auto flex items-center gap-2">
            <button
              (click)="save()"
               [disabled]="saving() || !form.name || !form.content || (includeWithoutConsent() && !legalVerified())"
               class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? ('common.saving' | transloco) : ('common.save' | transloco) }}
            </button>
            <a
              routerLink="/marketing"
              class="px-3 py-1.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              {{ 'common.cancel' | transloco }}
            </a>
          </div>
        </div>
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-20 md:pb-6 no-scrollbar">
        <div class="max-w-5xl mx-auto space-y-4">
          <!-- Row 1: Name + Type -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ 'marketing.campaignName' | transloco }} *
              </label>
              <input
                [(ngModel)]="form.name"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                [placeholder]="'marketing.campaignNamePlaceholder' | transloco"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ 'marketing.type' | transloco }}
              </label>
              <div class="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <i class="fas fa-envelope text-blue-600 dark:text-blue-400"></i>
                Email
              </div>
            </div>
          </div>

          <!-- Row 2: Subject + Schedule -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @if (form.type === 'email') {
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {{ 'marketing.subject' | transloco }}
                </label>
                <input
                  [(ngModel)]="form.subject"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  [placeholder]="'marketing.subjectPlaceholder' | transloco"
                />
              </div>
            }
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ 'marketing.schedule' | transloco }}
              </label>
              <input
                [(ngModel)]="form.scheduled_at"
                type="datetime-local"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="text-xs text-gray-400 mt-1">{{ 'marketing.scheduleHint' | transloco }}</p>
            </div>
          </div>

          <!-- Content -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ 'marketing.content' | transloco }} *
              </label>
              <button
                type="button"
                (click)="openPreview()"
                class="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <i class="fas fa-eye"></i>
                Vista previa
              </button>
            </div>
            <app-tiptap-editor
              [content]="form.content"
              (contentChange)="form.content = $event"
              [placeholder]="'marketing.contentPlaceholder' | transloco"
              [companyId]="auth.currentCompanyId()"
            ></app-tiptap-editor>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Las variables como {{ '{{client_name}}' }} se reemplazan al enviar. Puedes insertar imágenes usando el editor.
            </p>
          </div>

          <!-- Target Audience -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ 'marketing.targetAudience' | transloco }}
              </label>
              <span class="text-sm text-blue-600 dark:text-blue-400 font-medium">
                {{ selectedClientIds().length }} {{ 'marketing.selected' | transloco }}
              </span>
            </div>

            <!-- Search + Select All row -->
            <div class="flex items-center gap-3 mb-2">
              <input
                [(ngModel)]="audienceSearch"
                (input)="searchAudience()"
                type="text"
                class="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                [placeholder]="'marketing.searchClients' | transloco"
              />
              <label class="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  [checked]="selectAll()"
                  (change)="toggleSelectAll()"
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-sm text-gray-600 dark:text-gray-400">{{ 'marketing.selectAll' | transloco }}</span>
              </label>
              <!-- Filter toggle -->
              <button
                type="button"
                (click)="showFilters.set(!showFilters())"
                class="relative flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors text-sm"
              >
                <i class="fas fa-sliders-h"></i>
                <span>{{ 'marketing.filters' | transloco }}</span>
                @if (activeFilterCount() > 0) {
                  <span class="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                    {{ activeFilterCount() }}
                  </span>
                }
              </button>
            </div>

            <!-- Collapsible Filter Panel -->
            @if (showFilters()) {
              <div class="mb-3 p-4 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800/50">
                <!-- Filter grid: 3 columns desktop, 1 column mobile -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">

                  <!-- Column 1: Contact completeness -->
                  <div class="space-y-2">
                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{ 'marketing.filterContactData' | transloco }}</p>

                    <!-- Has Email -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterHasEmail' | transloco }}</label>
                      <select
                        [value]="filters().hasEmail || 'all'"
                        (change)="onSelectEnumFilter('hasEmail', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="yes">{{ 'marketing.filterYes' | transloco }}</option>
                        <option value="no">{{ 'marketing.filterNo' | transloco }}</option>
                      </select>
                    </div>

                    <!-- Has Phone -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterHasPhone' | transloco }}</label>
                      <select
                        [value]="filters().hasPhone || 'all'"
                        (change)="onSelectEnumFilter('hasPhone', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="yes">{{ 'marketing.filterYes' | transloco }}</option>
                        <option value="no">{{ 'marketing.filterNo' | transloco }}</option>
                      </select>
                    </div>

                    <!-- Has DNI -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterHasDni' | transloco }}</label>
                      <select
                        [value]="filters().hasDni || 'all'"
                        (change)="onSelectEnumFilter('hasDni', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="yes">{{ 'marketing.filterYes' | transloco }}</option>
                        <option value="no">{{ 'marketing.filterNo' | transloco }}</option>
                      </select>
                    </div>

                    <!-- Has Address -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterHasAddress' | transloco }}</label>
                      <select
                        [value]="filters().hasAddress || 'all'"
                        (change)="onSelectEnumFilter('hasAddress', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="yes">{{ 'marketing.filterYes' | transloco }}</option>
                        <option value="no">{{ 'marketing.filterNo' | transloco }}</option>
                      </select>
                    </div>
                  </div>

                  <!-- Column 2: Status + Demographics -->
                  <div class="space-y-2">
                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{ 'marketing.filterStatus' | transloco }}</p>

                    <!-- Status -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterStatusLabel' | transloco }}</label>
                      <select
                        [value]="filters().isActive || 'all'"
                        (change)="onSelectEnumFilter('isActive', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="yes">{{ 'marketing.filterActive' | transloco }}</option>
                        <option value="no">{{ 'marketing.filterInactive' | transloco }}</option>
                      </select>
                    </div>

                    <!-- Marketing Consent -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterMarketingConsent' | transloco }}</label>
                      <select
                        [value]="filters().hasMarketingConsent || 'all'"
                        (change)="onSelectEnumFilter('hasMarketingConsent', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="yes">{{ 'marketing.filterWithConsent' | transloco }}</option>
                        <option value="no">{{ 'marketing.filterWithoutConsent' | transloco }}</option>
                      </select>
                    </div>

                    <!-- Locality -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterLocality' | transloco }}</label>
                      <select
                        [value]="filters().localityId || ''"
                        (change)="onSelectNullableFilter('localityId', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{{ 'marketing.filterAll' | transloco }}</option>
                        @for (loc of filterOptions().localities; track loc.id) {
                          <option [value]="loc.id">{{ loc.name }} ({{ loc.postal_code }})</option>
                        }
                      </select>
                    </div>

                    <!-- Age Range -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterAgeRange' | transloco }}</label>
                      <select
                        [value]="filters().ageRange || ''"
                        (change)="onSelectNullableFilter('ageRange', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="18-25">{{ 'marketing.filterAge18_25' | transloco }}</option>
                        <option value="26-35">{{ 'marketing.filterAge26_35' | transloco }}</option>
                        <option value="36-45">{{ 'marketing.filterAge36_45' | transloco }}</option>
                        <option value="46-55">{{ 'marketing.filterAge46_55' | transloco }}</option>
                        <option value="55+">{{ 'marketing.filterAge55plus' | transloco }}</option>
                      </select>
                    </div>

                    <!-- Language -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterLanguage' | transloco }}</label>
                      <select
                        [value]="filters().language || ''"
                        (change)="onSelectNullableFilter('language', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{{ 'marketing.filterAll' | transloco }}</option>
                        @for (lang of filterOptions().languages; track lang) {
                          <option [value]="lang">{{ lang.toUpperCase() }}</option>
                        }
                      </select>
                    </div>

                    <!-- Client Type -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterClientType' | transloco }}</label>
                      <select
                        [value]="filters().clientType || 'all'"
                        (change)="onSelectTypeFilter('clientType', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{{ 'marketing.filterAll' | transloco }}</option>
                        <option value="individual">{{ 'marketing.filterIndividual' | transloco }}</option>
                        <option value="business">{{ 'marketing.filterBusiness' | transloco }}</option>
                      </select>
                    </div>
                  </div>

                  <!-- Column 3: Classification + Date -->
                  <div class="space-y-2">
                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{ 'marketing.filterClassification' | transloco }}</p>

                    <!-- Tier -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterTier' | transloco }}</label>
                      <select
                        [value]="filters().tier || ''"
                        (change)="onSelectNullableFilter('tier', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{{ 'marketing.filterAll' | transloco }}</option>
                        @for (t of filterOptions().tiers; track t) {
                          <option [value]="t">{{ t }}</option>
                        }
                      </select>
                    </div>

                    <!-- Source -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterSource' | transloco }}</label>
                      <select
                        [value]="filters().source || ''"
                        (change)="onSelectNullableFilter('source', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{{ 'marketing.filterAll' | transloco }}</option>
                        @for (s of filterOptions().sources; track s) {
                          <option [value]="s">{{ s }}</option>
                        }
                      </select>
                    </div>

                    <!-- Tags -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterTags' | transloco }}</label>
                      <div class="mt-1 p-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 min-h-[38px] flex flex-wrap gap-1.5">
                        @if (filterOptions().tags.length === 0) {
                          <span class="text-xs text-gray-400 italic px-1 py-0.5">{{ 'marketing.filterTagsEmpty' | transloco }}</span>
                        } @else {
                          @for (tag of filterOptions().tags; track tag) {
                            <button
                              type="button"
                              (click)="toggleTagFilter(tag)"
                              class="px-2 py-0.5 text-xs rounded-full border transition-colors"
                              [class.bg-blue-100]="isTagSelected(tag)"
                              [class.text-blue-700]="isTagSelected(tag)"
                              [class.border-blue-300]="isTagSelected(tag)"
                              [class.dark:bg-blue-900/40]="isTagSelected(tag)"
                              [class.dark:text-blue-300]="isTagSelected(tag)"
                              [class.dark:border-blue-700]="isTagSelected(tag)"
                              [class.bg-gray-100]="!isTagSelected(tag)"
                              [class.text-gray-600]="!isTagSelected(tag)"
                              [class.border-gray-200]="!isTagSelected(tag)"
                              [class.dark:bg-slate-600]="!isTagSelected(tag)"
                              [class.dark:text-gray-300]="!isTagSelected(tag)"
                              [class.dark:border-slate-500]="!isTagSelected(tag)"
                              [class.hover:bg-blue-50]="!isTagSelected(tag)"
                              [class.dark:hover:bg-slate-500]="!isTagSelected(tag)"
                            >
                              {{ tag }}
                            </button>
                          }
                        }
                      </div>
                    </div>

                    <!-- Created After -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterCreatedAfter' | transloco }}</label>
                      <input
                        type="date"
                        [value]="filters().createdAfter || ''"
                        (change)="onDateFilter('createdAfter', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <!-- Created Before -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterCreatedBefore' | transloco }}</label>
                      <input
                        type="date"
                        [value]="filters().createdBefore || ''"
                        (change)="onDateFilter('createdBefore', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <!-- Birthday upcoming -->
                    <div>
                      <label class="text-xs text-gray-600 dark:text-gray-400">{{ 'marketing.filterBirthday' | transloco }}</label>
                      <select
                        [value]="filters().birthdayIn || ''"
                        (change)="onSelectNullableFilter('birthdayIn', $event)"
                        class="w-full mt-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{{ 'marketing.filterNoFilter' | transloco }}</option>
                        <option value="week">{{ 'marketing.filterBirthdayWeek' | transloco }}</option>
                        <option value="month">{{ 'marketing.filterBirthdayMonth' | transloco }}</option>
                        <option value="3months">{{ 'marketing.filterBirthday3months' | transloco }}</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Clear filters button -->
                @if (hasActiveFilters()) {
                  <div class="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 flex items-center justify-between">
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {{ 'marketing.filterActiveResults' | transloco }}: <strong>{{ audienceClients().length }}</strong> {{ 'marketing.filterClientsMatch' | transloco }}
                    </span>
                    <button
                      type="button"
                      (click)="clearFilters()"
                      class="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <i class="fas fa-times mr-1"></i>
                      {{ 'marketing.clearFilters' | transloco }}
                    </button>
                  </div>
                }
              </div>
            }

            <!-- Client List -->
            @if (hasActiveFilters()) {
              <div class="mb-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                <i class="fas fa-filter mr-1"></i>
                {{ audienceClients().length }} {{ 'marketing.filterClientsMatch' | transloco }}
              </div>
            }
            <div class="border border-gray-200 dark:border-slate-700 rounded-lg max-h-48 overflow-y-auto">
              @if (loadingAudience()) {
                <div class="p-4 text-center text-gray-400 text-sm">
                  <i class="fas fa-spinner fa-spin mr-2"></i> {{ 'common.loading' | transloco }}
                </div>
              } @else if (audienceClients().length === 0) {
                <div class="p-4 text-center text-gray-400 text-sm">
                  @if (includeWithoutConsent() && !legalVerified()) {
                    <i class="fas fa-lock text-amber-400 mr-1"></i>
                    {{ 'marketing.audienceLockedHint' | transloco }}
                  } @else if (includeWithoutConsent()) {
                    {{ 'marketing.noClientsFound' | transloco }}
                  } @else {
                    {{ 'marketing.noClientsWithConsent' | transloco }}
                  }
                </div>
              } @else {
                <div class="divide-y divide-gray-100 dark:divide-slate-700">
                  @for (client of audienceClients(); track client.id) {
                    <label
                      class="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      [class.bg-blue-50]="isClientSelected(client.id)"
                      [class.dark:bg-blue-900/20]="isClientSelected(client.id)"
                    >
                      <input
                        type="checkbox"
                        [checked]="isClientSelected(client.id)"
                        (change)="toggleClient(client.id)"
                        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <div class="flex-1 min-w-0 flex items-center justify-between">
                        <p class="text-sm text-gray-900 dark:text-white truncate">
                          {{ client.name }} {{ client.surname }}
                        </p>
                        <div class="flex items-center gap-2 ml-2 flex-shrink-0">
                          @if (includeWithoutConsent()) {
                            <span
                              class="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                              [class.bg-green-100]="client.marketing_consent"
                              [class.text-green-700]="client.marketing_consent"
                              [class.dark:bg-green-900/40]="client.marketing_consent"
                              [class.dark:text-green-400]="client.marketing_consent"
                              [class.bg-amber-100]="!client.marketing_consent"
                              [class.text-amber-700]="!client.marketing_consent"
                              [class.dark:bg-amber-900/40]="!client.marketing_consent"
                              [class.dark:text-amber-400]="!client.marketing_consent"
                            >
                              {{ client.marketing_consent ? ('marketing.badgeConsentYes' | transloco) : ('marketing.badgeConsentNo' | transloco) }}
                            </span>
                          }
                          <p class="text-xs text-gray-400">{{ client.email || client.phone }}</p>
                        </div>
                      </div>
                    </label>
                  }
                </div>
              }
            </div>
          </div>

          <!-- ── Onboarding Email Toggle (Email only) ── -->
          @if (form.type === 'email') {
            <div class="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800">
              <label class="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  [checked]="includeWithoutConsent()"
                  (change)="toggleIncludeWithoutConsent()"
                  class="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ 'marketing.onboardingEmailCheckbox' | transloco }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {{ 'marketing.onboardingEmailCheckboxHint' | transloco }}
                  </p>
                </div>
              </label>
            </div>
          }

          <!-- ═══════════ GDPR LEGAL WARNING ═══════════ -->
          @if (includeWithoutConsent()) {
            <div class="border-2 border-amber-400 dark:border-amber-600 rounded-lg bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
              <!-- Warning Header -->
              <div class="bg-amber-100 dark:bg-amber-900/40 px-4 py-3 flex items-center gap-3 border-b border-amber-200 dark:border-amber-800">
                <i class="fas fa-exclamation-triangle text-amber-600 dark:text-amber-400 text-xl"></i>
                <div>
                  <h3 class="text-sm font-bold text-amber-800 dark:text-amber-300">
                    {{ 'marketing.legalWarningTitle' | transloco }}
                  </h3>
                  <p class="text-xs text-amber-700 dark:text-amber-400">
                    {{ 'marketing.legalWarningSubtitle' | transloco }}
                  </p>
                </div>
              </div>

              <!-- Legal Text -->
              <div class="p-4 space-y-3 text-sm">
                <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {{ 'marketing.legalWarningIntro' | transloco }}
                </p>

                <div class="bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 p-3">
                  <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                    {{ 'marketing.legalBasisTitle' | transloco }}
                  </p>
                  <ul class="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                    <li>{{ 'marketing.legalBasis1' | transloco }}</li>
                    <li>{{ 'marketing.legalBasis2' | transloco }}</li>
                    <li>{{ 'marketing.legalBasis3' | transloco }}</li>
                  </ul>
                </div>

                <div class="bg-white dark:bg-slate-800 rounded border border-red-200 dark:border-red-800 p-3">
                  <p class="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5">
                    {{ 'marketing.requirementsTitle' | transloco }}
                  </p>
                  <ul class="text-xs text-red-700 dark:text-red-400 space-y-1 list-disc list-inside">
                    <li>{{ 'marketing.requirement1' | transloco }}</li>
                    <li>{{ 'marketing.requirement2' | transloco }}</li>
                    <li>{{ 'marketing.requirement3' | transloco }}</li>
                    <li>{{ 'marketing.requirement4' | transloco }}</li>
                  </ul>
                </div>

                <div class="bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800 p-3">
                  <p class="text-xs font-bold text-red-700 dark:text-red-400">
                    {{ 'marketing.responsibilityNotice' | transloco }}
                  </p>
                </div>
              </div>

              <!-- ══ DOUBLE CONFIRMATION ══ -->
              <div class="border-t-2 border-amber-200 dark:border-amber-800 p-4 bg-white dark:bg-slate-800 space-y-4">
                <!-- Confirmation 1: Checkbox -->
                <label class="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    [checked]="legalAcknowledged()"
                    (change)="legalAcknowledged.set(!legalAcknowledged())"
                    [disabled]="legalVerified()"
                    class="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">
                    {{ 'marketing.confirmationCheckbox' | transloco }}
                  </span>
                </label>

                <!-- Confirmation 2: Type ACCEPT + Comprobar button -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {{ 'marketing.confirmationTypeLabel' | transloco }}
                  </label>
                  <div class="flex items-center gap-2">
                    <input
                      type="text"
                      [ngModel]="legalAcceptText()"
                      (ngModelChange)="legalAcceptText.set($event)"
                      [disabled]="legalVerified()"
                      class="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-slate-800"
                      [placeholder]="'marketing.confirmationTypePlaceholder' | transloco"
                    />
                    @if (!legalVerified()) {
                      <button
                        type="button"
                        (click)="verifyLegal()"
                        [disabled]="!legalAcknowledged() || legalAcceptText() !== 'ACEPTO'"
                        class="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                      >
                        <i class="fas fa-shield-alt mr-1"></i>
                        {{ 'marketing.checkButton' | transloco }}
                      </button>
                    } @else {
                      <span class="px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium rounded-lg whitespace-nowrap flex items-center gap-1">
                        <i class="fas fa-check-circle"></i>
                        {{ 'marketing.verifiedBadge' | transloco }}
                      </span>
                    }
                  </div>
                  @if (legalAcceptText() && legalAcceptText() !== 'ACEPTO' && !legalVerified()) {
                    <p class="text-xs text-red-500 mt-1">{{ 'marketing.confirmationTypeMismatch' | transloco }}</p>
                  }
                </div>

                @if (!legalVerified()) {
                  <p class="text-xs text-amber-600 dark:text-amber-400">
                    <i class="fas fa-info-circle mr-1"></i>
                    {{ 'marketing.confirmationRequired' | transloco }}
                  </p>
                } @else {
                  <p class="text-xs text-green-700 dark:text-green-400">
                    <i class="fas fa-check-circle mr-1"></i>
                    {{ 'marketing.verificationSuccess' | transloco }}
                  </p>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Preview Modal -->
      @if (showPreview()) {
        <div
          class="fixed inset-0 bg-slate-900/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm"
          (click)="closePreview()"
        >
          <div
            class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden"
            (click)="$event.stopPropagation()"
          >
            <!-- Modal header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <div>
                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Vista previa del email</h3>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Así verán tu email los destinatarios</p>
              </div>
              <button
                class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                (click)="closePreview()"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
            <!-- Modal body — email preview -->
            <div class="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-slate-900/50">
              <div
                class="max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden"
                [innerHTML]="previewHtml()"
              ></div>
            </div>
            <!-- Modal footer -->
            <div class="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex justify-end">
              <button
                class="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                (click)="closePreview()"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class CampaignFormComponent implements OnInit {
  private marketingService = inject(SupabaseMarketingService);
  protected auth = inject(AuthService);
  private localitiesService = inject(LocalitiesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  isEditing = signal(false);
  saving = signal(false);
  loadingAudience = signal(false);
  audienceClients = signal<MarketingClient[]>([]);
  audienceSearch = '';
  selectedIds = signal<Set<string>>(new Set());

  // Preview modal
  showPreview = signal(false);
  previewHtml = signal('');

  // ── Filters ──
  showFilters = signal(false);
  filters = signal<ClientFilters>({});
  filterOptions = signal<FilterOptions>({ localities: [], tiers: [], sources: [], languages: [], tags: [] });

  hasActiveFilters = computed(() => {
    const f = this.filters();
    return Object.keys(f).some(key => {
      const val = (f as any)[key];
      if (key === 'tags') return Array.isArray(val) && val.length > 0;
      return val !== undefined && val !== null && val !== 'all';
    });
  });

  activeFilterCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.hasEmail && f.hasEmail !== 'all') count++;
    if (f.hasPhone && f.hasPhone !== 'all') count++;
    if (f.hasDni && f.hasDni !== 'all') count++;
    if (f.hasAddress && f.hasAddress !== 'all') count++;
    if (f.isActive && f.isActive !== 'all') count++;
    if (f.hasMarketingConsent && f.hasMarketingConsent !== 'all') count++;
    if (f.localityId) count++;
    if (f.ageRange) count++;
    if (f.language) count++;
    if (f.clientType && f.clientType !== 'all') count++;
    if (f.tier) count++;
    if (f.source) count++;
    if (f.tags && f.tags.length > 0) count++;
    if (f.createdAfter) count++;
    if (f.createdBefore) count++;
    if (f.birthdayIn) count++;
    return count;
  });

  // ── Onboarding email (GDPR Art. 6) ──
  includeWithoutConsent = signal(false);
  legalAcknowledged = signal(false);
  legalAcceptText = signal('');
  legalVerified = signal(false);  // True after "Comprobar" passes

  selectAll = computed(() => {
    const clients = this.audienceClients();
    return clients.length > 0 && clients.every((c) => this.selectedIds().has(c.id));
  });

  selectedClientIds = computed(() => Array.from(this.selectedIds()));

  form = {
    name: '',
    type: 'email' as 'email' | 'whatsapp' | 'sms',
    subject: '',
    content: '',
    scheduled_at: '',
  };

  private campaignId: string | null = null;

  async ngOnInit() {
    this.campaignId = this.route.snapshot.paramMap.get('id');
    this.isEditing.set(!!this.campaignId);

    // Load filter options
    try {
      const opts = await this.marketingService.getFilterOptions();
      this.filterOptions.set(opts);
    } catch (err) {
      console.warn('Could not load filter options', err);
    }

    await this.loadAudience();

    if (this.campaignId) {
      await this.loadCampaign(this.campaignId);
    }
  }

  private async loadCampaign(id: string) {
    try {
      const c = await this.marketingService.getCampaign(id);
      if (!c) {
        this.toast.error('Error', 'Campaña no encontrada');
        this.router.navigate(['/marketing']);
        return;
      }

      this.form.name = c.name;
      this.form.type = c.type;
      this.form.subject = c.subject || '';
      this.form.content = c.content;
      this.form.scheduled_at = c.scheduled_at ? c.scheduled_at.slice(0, 16) : '';

      const ids = c.target_audience?.client_ids || [];
      this.selectedIds.set(new Set(ids));

      // Restore onboarding state if it was an onboarding email
      if (c.config?.['is_onboarding_email']) {
        this.includeWithoutConsent.set(true);
        // Auto-verify since user already accepted when creating the campaign
        this.legalAcknowledged.set(true);
        this.legalAcceptText.set('ACEPTO');
        this.legalVerified.set(true);
        // Re-load with all clients to show correct audience
        await this.loadAudience();
      }
    } catch (err) {
      console.warn('Campaign form: could not load campaign', err);
    }
  }

  private async loadAudience() {
    this.loadingAudience.set(true);
    try {
      const activeFilters = this.hasActiveFilters() ? this.filters() : undefined;
      if (this.includeWithoutConsent() && this.legalVerified()) {
        this.audienceClients.set(
          await this.marketingService.getAllActiveClients(this.audienceSearch || undefined, activeFilters),
        );
      } else {
        this.audienceClients.set(
          await this.marketingService.getClientsWithConsent(this.audienceSearch || undefined, activeFilters),
        );
      }
    } finally {
      this.loadingAudience.set(false);
    }
  }

  async searchAudience() {
    this.loadingAudience.set(true);
    try {
      const activeFilters = this.hasActiveFilters() ? this.filters() : undefined;
      if (this.includeWithoutConsent() && this.legalVerified()) {
        this.audienceClients.set(
          await this.marketingService.getAllActiveClients(this.audienceSearch || undefined, activeFilters),
        );
      } else {
        this.audienceClients.set(
          await this.marketingService.getClientsWithConsent(this.audienceSearch || undefined, activeFilters),
        );
      }
    } finally {
      this.loadingAudience.set(false);
    }
  }

  clearFilters() {
    this.filters.set({});
    this.loadAudience();
  }

  updateFilter(key: keyof ClientFilters, value: any) {
    this.filters.update(f => ({ ...f, [key]: value }));
    this.loadAudience();
  }

  // ── Template-safe event handlers (Angular templates don't support TS inline) ──

  /** Handler for select filters with 'all'/'yes'/'no' enums — 'all' → null */
  onSelectEnumFilter(key: keyof ClientFilters, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter(key, value === 'all' ? null : value);
  }

  /** Handler for select filters with 'all'/'individual'/'business' enums — 'all' → null */
  onSelectTypeFilter(key: keyof ClientFilters, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter(key, value === 'all' ? null : value);
  }

  /** Handler for select filters where empty string → null (locality, tier, source, etc.) */
  onSelectNullableFilter(key: keyof ClientFilters, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter(key, value || null);
  }

  /** Handler for date input filters — empty string → null */
  onDateFilter(key: keyof ClientFilters, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateFilter(key, value || null);
  }

  /** Handler for tags chip-selector — toggles a tag in/out of the active filter set */
  toggleTagFilter(tag: string) {
    const current = this.filters().tags || [];
    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    this.updateFilter('tags', updated.length > 0 ? updated : undefined);
  }

  /** True if the given tag is currently in the active filter set */
  isTagSelected(tag: string): boolean {
    return this.filters().tags?.includes(tag) ?? false;
  }

  toggleIncludeWithoutConsent() {
    const newValue = !this.includeWithoutConsent();
    this.includeWithoutConsent.set(newValue);
    if (!newValue) {
      // Reset all legal confirmations when unchecking
      this.legalAcknowledged.set(false);
      this.legalAcceptText.set('');
      this.legalVerified.set(false);
    } else {
      // When enabling, clear verified state — must re-verify
      this.legalVerified.set(false);
    }
    this.loadAudience();
  }

  /**
   * Verify legal acceptance. Only after this passes do we fetch the full client list.
   * Requires:
   *  - Checkbox "legalAcknowledged" is checked
   *  - "ACEPTO" typed exactly (case-sensitive)
   */
  verifyLegal() {
    if (!this.legalAcknowledged()) {
      this.toast.error(
        'Confirmación requerida',
        'Debe marcar la casilla de aceptación legal antes de continuar.',
      );
      return;
    }
    if (this.legalAcceptText() !== 'ACEPTO') {
      this.toast.error(
        'Texto incorrecto',
        'Debe escribir exactamente ACEPTO (en mayúsculas) para confirmar.',
      );
      return;
    }

    this.legalVerified.set(true);
    this.loadAudience();
    this.toast.success('Verificado', 'Ahora se cargarán todos los clientes activos.');
  }

  isClientSelected(clientId: string): boolean {
    return this.selectedIds().has(clientId);
  }

  toggleClient(clientId: string) {
    const updated = new Set(this.selectedIds());
    if (updated.has(clientId)) {
      updated.delete(clientId);
    } else {
      updated.add(clientId);
    }
    this.selectedIds.set(updated);
  }

  toggleSelectAll() {
    if (this.selectAll()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.audienceClients().map((c) => c.id)));
    }
  }

  async save() {
    if (!this.form.name || !this.form.content) return;

    // If including clients without consent, must have passed legal verification
    if (this.includeWithoutConsent() && !this.legalVerified()) {
      this.toast.error(
        'Verificación legal requerida',
        'Debe completar el proceso de confirmación legal (casilla + ACEPTO + Comprobar) para continuar.',
      );
      return;
    }

    this.saving.set(true);
    try {
      const payload: any = {
        name: this.form.name,
        type: this.form.type,
        subject: this.form.subject || undefined,
        content: this.form.content,
        target_audience: { client_ids: this.selectedClientIds() },
        scheduled_at: this.form.scheduled_at || undefined,
      };

      if (this.includeWithoutConsent()) {
        payload.config = { is_onboarding_email: true };
      }

      if (this.isEditing() && this.campaignId) {
        await this.marketingService.updateCampaign(this.campaignId, payload);
        this.toast.success('Actualizada', 'Campaña actualizada correctamente');
      } else {
        await this.marketingService.createCampaign(payload);
        this.toast.success('Creada', 'Campaña creada correctamente');
      }

      this.router.navigate(['/marketing']);
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo guardar la campaña');
    } finally {
      this.saving.set(false);
    }
  }

  // Preview modal — rendered as email with sample variable substitution
  openPreview() {
    let html = this.form.content || '';
    const sampleReplacements: Record<string, string> = {
      '{{client_name}}': 'María',
      '{{client_surname}}': 'García',
      '{{client_email}}': 'maria@example.com',
      '{{client_phone}}': '+34 600 000 000',
      '{{company_name}}': 'Tu Empresa',
      '{{unsubscribe_url}}': '#',
    };
    for (const [variable, value] of Object.entries(sampleReplacements)) {
      html = html.split(variable).join(value);
    }
    this.previewHtml.set(html);
    this.showPreview.set(true);
  }

  closePreview() {
    this.showPreview.set(false);
  }
}
