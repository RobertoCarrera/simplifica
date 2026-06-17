import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, LUCIDE_ICONS, LucideIconProvider, CheckCircle, AlertCircle, RefreshCw, Search } from 'lucide-angular';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { DocplannerReconciliationService, ReconciliationAudit } from './docplanner-reconciliation.service';

@Component({
  selector: 'app-reconciliation-widget',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ CheckCircle, AlertCircle, RefreshCw, Search }),
    },
  ],
  templateUrl: './reconciliation-widget.component.html',
  styleUrls: ['./reconciliation-widget.component.scss'],
})
export class ReconciliationWidgetComponent implements OnInit {
  private reconciliationService = inject(DocplannerReconciliationService);
  private bookingsService = inject(SupabaseBookingsService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  isCollapsed = signal(false);
  isRunningAudit = signal(false);
  auditData = signal<ReconciliationAudit[]>([]);
  private companyId = signal<string | null>(null);
  rangeStart = signal('');
  rangeEnd = signal('');
  auditingDay = signal<string | null>(null);
  expandedDay = signal<string | null>(null);
  dayBookings = signal<any[]>([]);
  loadingBookings = signal(false);
  lastAudit = computed(() => this.auditData()[0] ?? null);
  hasDiscrepancies = computed(() =>
    this.auditData().some(a => a.discrepancy > 0)
  );
  totalDiscrepancy = computed(() =>
    this.auditData()
      .filter(a => a.discrepancy > 0)
      .reduce((sum, a) => sum + a.discrepancy, 0)
  );
  errorMessage = signal<string | null>(null);
  // Global KPI: future bookings (start_time > now) split by Google Calendar sync.
  // Loaded once on init. Refreshes when the user collapses/expands is irrelevant
  // (data doesn't change frame-to-frame). Null = query failed or not yet loaded.
  calendarStats = signal<{ total: number; synced: number; notSynced: number } | null>(null);

  ngOnInit() {
    this.companyId.set(this.authService.currentCompanyId());
    const cid = this.companyId();
    if (cid) {
      this.loadAuditData();
      this.loadCalendarStats();
    }
  }

  private loadCalendarStats() {
    const cid = this.companyId();
    if (!cid) return;
    this.bookingsService.getFutureBookingsSyncStats(cid).subscribe({
      next: (stats) => this.calendarStats.set(stats),
      error: (err: unknown) => {
        console.error('[reconciliation-widget] Failed to load calendar stats:', err);
        // Leave calendarStats as null so the UI shows nothing.
      },
    });
  }

  loadAuditData() {
    const cid = this.companyId();
    if (!cid) return;
    this.reconciliationService.getReconciliationAudit(cid).subscribe({
      next: (data: ReconciliationAudit[]) => this.auditData.set(data),
      error: (err: unknown) => {
        console.error('[reconciliation-widget] Failed to load audit data:', err);
        this.errorMessage.set('No se pudo cargar el estado de auditoría');
      },
    });
  }

  runAudit() {
    if (this.isRunningAudit()) return;
    this.isRunningAudit.set(true);
    this.errorMessage.set(null);
    this.toast.info('Auditoría', 'Consultando Doctoralia...', 0, false, 'reconciliation-audit');

    this.reconciliationService.triggerAudit().subscribe({
      next: (result: { processed: number; scope: string; results: { dates_processed: number }[] }) => {
        setTimeout(() => this.loadAuditData(), 30000);
        this.isRunningAudit.set(false);
        const processed = result.results?.[0]?.dates_processed ?? 0;
        this.toast.success('Auditoría completa', `${processed} fechas procesadas`, 5000, false, 'reconciliation-audit');
      },
      error: (err: unknown) => {
        console.error('[reconciliation-widget] Failed to trigger audit:', err);
        this.errorMessage.set('Error al iniciar auditoría. Intenta de nuevo.');
        this.isRunningAudit.set(false);
        this.toast.error('Error', 'No se pudo iniciar la auditoría', 5000, false, 'reconciliation-audit');
      },
    });
  }

  runRangeAudit() {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    if (!start || !end || this.isRunningAudit()) return;
    this.isRunningAudit.set(true);
    this.errorMessage.set(null);
    this.toast.info('Auditoría', `Consultando ${start} → ${end}...`, 0, false, 'reconciliation-audit');

    this.reconciliationService.triggerAuditRange(start, end).subscribe({
      next: (result: { processed: number; scope: string; results: { dates_processed: number }[] }) => {
        setTimeout(() => this.loadAuditData(), 30000);
        this.isRunningAudit.set(false);
        const processed = result.results?.[0]?.dates_processed ?? 0;
        this.toast.success('Auditoría completa', `${processed} fechas procesadas en el rango`, 5000, false, 'reconciliation-audit');
      },
      error: (err: unknown) => {
        console.error('[reconciliation-widget] Failed to trigger range audit:', err);
        this.errorMessage.set('Error al iniciar auditoría. Intenta de nuevo.');
        this.isRunningAudit.set(false);
        this.toast.error('Error', 'No se pudo auditar el rango', 5000, false, 'reconciliation-audit');
      },
    });
  }

  auditSingleDay(dateStr: string) {
    if (this.isRunningAudit()) return;
    // Compute next day in UTC to avoid timezone issues
    const [y, m, d] = dateStr.split('-').map(Number);
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
    const endStr = nextDay.toISOString().slice(0, 10);

    this.isRunningAudit.set(true);
    this.auditingDay.set(dateStr);
    this.dayBookings.set([]);
    this.errorMessage.set(null);
    this.toast.info('Sincronizando', `Consultando y sincronizando ${this.formatDate(dateStr)}...`, 0, false, 'reconciliation-audit');

    this.reconciliationService.triggerSyncDay(dateStr, endStr).subscribe({
      next: (result: any) => {
        setTimeout(() => this.loadAuditData(), 30000);
        this.isRunningAudit.set(false);
        this.auditingDay.set(null);
        const bks = result.results?.[0]?.bookings || [];
        this.dayBookings.set(bks);
        const synced = result.results?.[0]?.synced_count ?? 0;
        this.toast.success('Sincronizado', `${synced} nuevos · ${bks.length} totales en Doctoralia`, 4000, false, 'reconciliation-audit');
      },
      error: (err: unknown) => {
        console.error('[reconciliation-widget] Failed to audit day:', err);
        this.errorMessage.set('Error al auditar el día. Intenta de nuevo.');
        this.isRunningAudit.set(false);
        this.auditingDay.set(null);
        this.toast.error('Error', `No se pudo sincronizar ${this.formatDate(dateStr)}`, 5000, false, 'reconciliation-audit');
      },
    });
  }

  runSync() {
    if (this.isRunningAudit()) return;
    this.isRunningAudit.set(true);
    this.errorMessage.set(null);
    this.toast.info('Sincronización', 'Forzando sync de bookings con Doctoralia...', 0, false, 'reconciliation-sync');

    this.reconciliationService.triggerSync().subscribe({
      next: (result: any) => {
        this.isRunningAudit.set(false);
        const synced = result?.bookings_synced ?? result?.synced ?? '?';
        this.toast.success('Sync completado', `Bookings sincronizados: ${synced}. Refrescando datos...`, 6000, false, 'reconciliation-sync');
        setTimeout(() => this.loadAuditData(), 30000);
      },
      error: (err: unknown) => {
        console.error('[reconciliation-widget] Sync failed:', err);
        this.isRunningAudit.set(false);
        this.toast.error('Error', 'Falló la sincronización. Revisá los logs.', 6000, false, 'reconciliation-sync');
      },
    });
  }

  toggleCollapse() {
    this.isCollapsed.update(v => !v);
  }

  toggleDay(date: string) {
    const current = this.expandedDay();
    if (current === date) {
      this.expandedDay.set(null);
      return;
    }
    this.expandedDay.set(date);
    this.loadingBookings.set(true);
    this.dayBookings.set([]);
    this.reconciliationService.getDayBookings(date).subscribe({
      next: (result: any) => {
        this.dayBookings.set(result.results?.[0]?.bookings || []);
        this.loadingBookings.set(false);
      },
      error: (err: unknown) => {
        console.error('[reconciliation-widget] Failed to load day bookings:', err);
        this.loadingBookings.set(false);
      },
    });
  }

  getDoctorBreakdown(audit: ReconciliationAudit): { id: string; count: number }[] {
    if (!audit.dp_breakdown) return [];
    return Object.entries(audit.dp_breakdown)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }

  formatDiscrepancy(d: number): string {
    if (d === 0) return '✓';
    return String(d);
  }

  getDiscrepancyClass(discrepancy: number): string {
    if (discrepancy <= 0) return 'text-green-600 dark:text-green-400';
    return 'text-red-600 dark:text-red-400';
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  formatSyncedAt(dateStr: string | null): string {
    if (!dateStr) return 'Nunca';
    const d = new Date(dateStr);
    return d.toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
