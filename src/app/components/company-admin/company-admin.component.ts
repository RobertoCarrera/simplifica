import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-company-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="container py-4">
    <h2 class="mb-3">Empresa</h2>
    <div class="mb-4 text-muted">
      <div>Nombre: <strong>{{ (auth.userProfile$ | async)?.company?.name }}</strong></div>
      <div>Rol: <strong>{{ (auth.userProfile$ | async)?.role }}</strong></div>
    </div>

    <ng-container *ngIf="(auth.userProfile$ | async)?.role === 'owner' || (auth.userProfile$ | async)?.role === 'admin'; else noAccess">
      <h4 class="mb-3">Invitaciones pendientes</h4>
      <div *ngIf="loading" class="text-muted">Cargando...</div>
      <div *ngIf="!loading && invitations.length === 0" class="text-muted">No hay invitaciones pendientes.</div>

      <div class="list-group" *ngIf="!loading && invitations.length > 0">
        <div class="list-group-item d-flex align-items-center justify-content-between" *ngFor="let inv of invitations">
          <div>
            <div><strong>{{ inv.email }}</strong> — {{ inv.role }}</div>
            <div class="small text-muted">Creada: {{ inv.created_at | date:'short' }} · Estado: {{ inv.effective_status || inv.status }}</div>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-success" (click)="approve(inv.id)" [disabled]="busy">✔</button>
            <button class="btn btn-sm btn-outline-danger" (click)="reject(inv.id)" [disabled]="busy">✖</button>
          </div>
        </div>
      </div>
    </ng-container>

    <ng-template #noAccess>
      <div class="alert alert-warning">Solo el owner o admin puede gestionar invitaciones.</div>
    </ng-template>
  </div>
  `
})
export class CompanyAdminComponent implements OnInit {
  auth = inject(AuthService);
  invitations: any[] = [];
  loading = false;
  busy = false;

  async ngOnInit() {
    await this.loadInvitations();
  }

  private async loadInvitations() {
    this.loading = true;
    try {
      const res = await this.auth.getCompanyInvitations();
      if (res.success) {
        this.invitations = (res.invitations || []).filter(i => (i.effective_status || i.status) === 'pending');
      }
    } finally {
      this.loading = false;
    }
  }

  async approve(id: string) {
    this.busy = true;
    try {
      const { data, error } = await this.auth.client.rpc('approve_company_invitation', { p_invitation_id: id });
      if (error) throw error;
  // Optimistic update: remove from list immediately
  this.invitations = this.invitations.filter(inv => inv.id !== id);
  // Background refresh to keep in sync
  await this.loadInvitations();
    } catch (e) {
      console.error('approve error', e);
    } finally {
      this.busy = false;
    }
  }

  async reject(id: string) {
    this.busy = true;
    try {
      const { data, error } = await this.auth.client.rpc('reject_company_invitation', { p_invitation_id: id });
      if (error) throw error;
  // Optimistic update: remove from list immediately
  this.invitations = this.invitations.filter(inv => inv.id !== id);
  // Background refresh to keep in sync
  await this.loadInvitations();
    } catch (e) {
      console.error('reject error', e);
    } finally {
      this.busy = false;
    }
  }
}
