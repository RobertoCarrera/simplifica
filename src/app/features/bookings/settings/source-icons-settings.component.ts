import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseBookingsService, DEFAULT_ICONS, SourceKey, BookingSourceIcon } from '../../../services/supabase-bookings.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

interface SourceRow {
  source: SourceKey;
  icon: string;
  label: string;
  isCustom: boolean; // true if user has explicitly saved
}

@Component({
  selector: 'app-source-icons-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './source-icons-settings.component.html',
  styleUrls: ['./source-icons-settings.component.scss'],
})
export class SourceIconsSettingsComponent implements OnInit {
  private sbClient = inject(SupabaseClientService);
  private bookingsService = inject(SupabaseBookingsService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  loading = signal(true);
  saving = signal(false);
  rows: SourceRow[] = [];

  private readonly sourceKeys: SourceKey[] = ['public_portal', 'admin', 'professional'];

  ngOnInit() {
    this.loadIcons();
  }

  private async loadIcons() {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) {
      // No company context — use defaults
      this.initRows([]);
      this.loading.set(false);
      return;
    }

    try {
      const customIcons = await this.bookingsService.getBookingSourceIcons(companyId);
      this.initRows(customIcons);
    } catch (err) {
      console.error('[SourceIconsSettings] Error loading icons:', err);
      // Fall back to defaults
      this.initRows([]);
    } finally {
      this.loading.set(false);
    }
  }

  private initRows(customIcons: BookingSourceIcon[]) {
    const customMap = new Map(customIcons.map(c => [c.source, c]));

    this.rows = this.sourceKeys.map(source => {
      const defaultIcon = DEFAULT_ICONS[source];
      const custom = customMap.get(source);
      return {
        source,
        icon: custom?.icon ?? defaultIcon.icon,
        label: custom?.label ?? defaultIcon.label,
        isCustom: !!custom,
      } as SourceRow;
    });
  }

  async save() {
    this.saving.set(true);
    const companyId = this.authService.currentCompanyId();

    try {
      const supabase = this.sbClient.instance;

      // Build upsert payload — 3 rows (public_portal, admin, professional) always saved; docplanner is not configurable
      const iconsToUpsert = this.rows.map(row => ({
        company_id: companyId,
        source: row.source,
        icon: row.icon,
        label: row.label,
        is_active: true,
      }));

      const { error } = await supabase
        .from('booking_source_icons')
        .upsert(iconsToUpsert, { onConflict: 'company_id,source' });

      if (error) throw error;

      this.toast.success('Configuración guardada', 'Los iconos de origen se han actualizado correctamente.');

      // Refresh rows to reflect isCustom state
      await this.loadIcons();
    } catch (err: any) {
      console.error('[SourceIconsSettings] Error saving:', err);
      this.toast.error('Error', err.message || 'No se pudieron guardar los iconos.');
    } finally {
      this.saving.set(false);
    }
  }

  resetToDefault(source: SourceKey) {
    const defaultIcon = DEFAULT_ICONS[source];
    const row = this.rows.find(r => r.source === source);
    if (row) {
      row.icon = defaultIcon.icon;
      row.label = defaultIcon.label;
      row.isCustom = false;
    }
  }

  getDefaultIcon(source: SourceKey): string {
    return DEFAULT_ICONS[source].icon;
  }

  getDefaultLabel(source: SourceKey): string {
    return DEFAULT_ICONS[source].label;
  }
}