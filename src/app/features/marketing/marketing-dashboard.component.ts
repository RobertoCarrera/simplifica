import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-marketing-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="marketing-dashboard">
      <header class="dashboard-header">
        <h1>Marketing</h1>
        <p class="subtitle">Panel de control de campañas de marketing</p>
      </header>

      <div class="stats-grid" *ngIf="!loading()">
        <div class="stat-card">
          <div class="stat-value">{{ campaignCount() }}</div>
          <div class="stat-label">Campañas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ activeCount() }}</div>
          <div class="stat-label">Activas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ sentCount() }}</div>
          <div class="stat-label">Enviadas</div>
        </div>
      </div>

      <div class="loading" *ngIf="loading()">
        Cargando datos de marketing...
      </div>
    </div>
  `,
  styles: [`
    .marketing-dashboard {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .dashboard-header {
      margin-bottom: 2rem;
    }
    .dashboard-header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 0.25rem;
    }
    .subtitle {
      color: #6b7280;
      margin: 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .stat-card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #3b82f6;
    }
    .stat-label {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }
    .loading {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    :host-context(.dark) .stat-card {
      background: #1f2937;
      border-color: #374151;
    }
    :host-context(.dark) .dashboard-header h1 {
      color: #f3f4f6;
    }
  `],
})
export class MarketingDashboardComponent implements OnInit {
  private sb: SupabaseClient = inject(SupabaseClientService).instance;
  private auth = inject(AuthService);

  loading = signal(true);
  campaignCount = signal(0);
  activeCount = signal(0);
  sentCount = signal(0);

  async ngOnInit() {
    try {
      const companyId = this.auth.currentCompanyId();
      if (!companyId) {
        this.loading.set(false);
        return;
      }

      const { count: total } = await this.sb
        .from('marketing_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      const { count: active } = await this.sb
        .from('marketing_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true);

      const { count: sent } = await this.sb
        .from('marketing_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'sent');

      this.campaignCount.set(total ?? 0);
      this.activeCount.set(active ?? 0);
      this.sentCount.set(sent ?? 0);
    } catch (err) {
      console.warn('Marketing dashboard: could not load campaign stats', err);
    } finally {
      this.loading.set(false);
    }
  }
}
