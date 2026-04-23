import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseBookingsService } from '../../../../../services/supabase-bookings.service';
import { SupabaseResourcesService, Resource } from '../../../../../services/supabase-resources.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

interface UnlinkedSummary {
  professional_id: string;
  display_name: string;
  default_resource_id: string | null;
  unlinked_count: number;
  has_resources: boolean;
}

@Component({
  selector: 'app-unlinked-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './unlinked-bookings.component.html',
  styleUrls: ['./unlinked-bookings.component.scss'],
})
export class UnlinkedBookingsComponent implements OnInit {
  private bookingsService = inject(SupabaseBookingsService);
  private resourcesService = inject(SupabaseResourcesService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  summary = signal<UnlinkedSummary[]>([]);
  allResources = signal<Resource[]>([]);
  loading = signal(true);
  assigning = signal<string | null>(null); // professional_id of row being assigned
  selectedResourceId = signal<Map<string, string>>(new Map()); // professional_id → resource_id

  currentPage = signal(1);
  pageSize = 50;

  totalPages = computed(() => Math.ceil(this.summary().length / this.pageSize));
  paginatedSummary = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.summary().slice(start, start + this.pageSize);
  });

  async ngOnInit() {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) {
      this.loading.set(false);
      return;
    }

    try {
      const [summaryData, resources] = await Promise.all([
        this.bookingsService.getUnlinkedBookingsSummary(companyId),
        this.resourcesService.getResourcesForCompany(companyId).toPromise() ?? [],
      ]);

      this.summary.set(summaryData);
      this.allResources.set(resources ?? []);

      // Pre-select default_resource_id for each professional
      const preSelected = new Map<string, string>();
      for (const s of summaryData) {
        if (s.default_resource_id) {
          preSelected.set(s.professional_id, s.default_resource_id);
        }
      }
      this.selectedResourceId.set(preSelected);
    } catch (err) {
      console.error('[UnlinkedBookingsComponent] Error loading:', err);
      this.toast.error('Error', 'No se pudieron cargar los bookings sin asignar');
    } finally {
      this.loading.set(false);
    }
  }

  getResourcesForProfessional(professionalId: string): Resource[] {
    return this.allResources();
  }

  getSelectedResource(professionalId: string): string {
    return this.selectedResourceId().get(professionalId) ?? '';
  }

  setSelectedResource(professionalId: string, resourceId: string) {
    const current = new Map(this.selectedResourceId());
    current.set(professionalId, resourceId);
    this.selectedResourceId.set(current);
  }

  async assignRooms(professional: UnlinkedSummary) {
    const resourceId = this.getSelectedResource(professional.professional_id);
    if (!resourceId) {
      this.toast.error('Error', 'Selecciona una sala antes de asignar');
      return;
    }

    this.assigning.set(professional.professional_id);
    try {
      const result = await this.bookingsService.bulkAssignUnlinkedBookings(
        professional.professional_id,
        resourceId
      );

      // Fire-and-forget sync (don't await)
      this.bookingsService.syncRoomCalendars().catch(err => {
        console.warn('[UnlinkedBookings] Sync after assignment failed:', err);
      });

      // Update local state: remove professional from list if now 0 unlinked
      const updated = this.summary().map(s =>
        s.professional_id === professional.professional_id
          ? { ...s, unlinked_count: 0 }
          : s
      ).filter(s => s.unlinked_count > 0);
      this.summary.set(updated);

      this.toast.success('Sala asignada', `${result.updated} bookings actualizados`);
    } catch (err) {
      console.error('[UnlinkedBookings] Assignment failed:', err);
      this.toast.error('Error', 'La asignación falló. Por favor intenta de nuevo.');
    } finally {
      this.assigning.set(null);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }
}
