import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-company-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="container py-4">
    <h2 class="mb-3">Empresa</h2>
    <div class="mb-4 text-muted">
      <div>Nombre: <strong>{{ (auth.userProfile$ | async)?.company?.name }}</strong></div>
      <div>Rol: <strong>{{ (auth.userProfile$ | async)?.role }}</strong></div>
    </div>

    <ng-container *ngIf="(auth.userProfile$ | async)?.role === 'owner' || (auth.userProfile$ | async)?.role === 'admin'; else noAccess">
      <div class="mb-3 border-b">
        <nav class="flex gap-4">
          <button class="px-3 py-2" [class.border-b-2]="tab==='users'" (click)="tab='users'">Usuarios</button>
          <button class="px-3 py-2" [class.border-b-2]="tab==='invites'" (click)="tab='invites'">Invitaciones</button>
        </nav>
      </div>

      <!-- Usuarios de la empresa -->
      <section *ngIf="tab==='users'">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h4 class="mb-0">Usuarios</h4>
          <button class="btn btn-sm btn-outline-secondary" (click)="loadUsers()" [disabled]="loadingUsers">Recargar</button>
        </div>
        <div *ngIf="loadingUsers" class="text-muted">Cargando usuarios…</div>
        <div *ngIf="!loadingUsers && users.length===0" class="text-muted">No hay usuarios en la empresa.</div>
        <div class="table-responsive" *ngIf="!loadingUsers && users.length>0">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Activo</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let u of users">
                <td>{{ u.name || '-' }}</td>
                <td>{{ u.email }}</td>
                <td>
                  <select class="form-select form-select-sm" [(ngModel)]="u.role" (ngModelChange)="changeRole(u)" [disabled]="busy">
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                  </select>
                </td>
                <td>
                  <span class="badge" [class.text-bg-success]="u.active" [class.text-bg-secondary]="!u.active">{{ u.active ? 'Sí' : 'No' }}</span>
                </td>
                <td class="text-end">
                  <button class="btn btn-sm" [class.btn-outline-danger]="u.active" [class.btn-outline-success]="!u.active" (click)="toggleActive(u)" [disabled]="busy">
                    {{ u.active ? 'Desactivar' : 'Activar' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Invitaciones -->
      <section *ngIf="tab==='invites'">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h4 class="mb-0">Invitaciones</h4>
          <button class="btn btn-sm btn-outline-secondary" (click)="loadInvitations()" [disabled]="loadingInvitations">Recargar</button>
        </div>

        <form class="row g-2 mb-3" (ngSubmit)="sendInvite()">
          <div class="col-5 col-md-4">
            <input class="form-control" placeholder="email@cliente.com" [(ngModel)]="inviteForm.email" name="email" required />
          </div>
          <div class="col-4 col-md-3">
            <select class="form-select" [(ngModel)]="inviteForm.role" name="role">
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div class="col">
            <input class="form-control" placeholder="Mensaje (opcional)" [(ngModel)]="inviteForm.message" name="message" />
          </div>
          <div class="col-auto">
            <button class="btn btn-primary" type="submit" [disabled]="busy">Invitar</button>
          </div>
        </form>

        <div *ngIf="loadingInvitations" class="text-muted">Cargando invitaciones…</div>
        <div *ngIf="!loadingInvitations && invitations.length === 0" class="text-muted">No hay invitaciones.</div>

        <div class="list-group" *ngIf="!loadingInvitations && invitations.length > 0">
          <div class="list-group-item d-flex align-items-center justify-content-between" *ngFor="let inv of invitations">
            <div class="me-3">
              <div><strong>{{ inv.email }}</strong> — {{ inv.role }}</div>
              <div class="small text-muted">Creada: {{ inv.created_at | date:'short' }} · Estado: {{ inv.effective_status || inv.status }}</div>
            </div>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" (click)="resend(inv)" [disabled]="busy">Reenviar</button>
              <button class="btn btn-sm btn-outline-secondary" (click)="copyLink(inv)" [disabled]="busy">Copiar enlace</button>
              <button class="btn btn-sm btn-success" (click)="approve(inv.id)" [disabled]="busy">Aprobar</button>
              <button class="btn btn-sm btn-outline-danger" (click)="reject(inv.id)" [disabled]="busy">Cancelar</button>
            </div>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #noAccess>
      <div class="alert alert-warning">Solo el owner o admin puede gestionar la empresa.</div>
    </ng-template>
  </div>
  `
})
export class CompanyAdminComponent implements OnInit {
  auth = inject(AuthService);
  // Tabs
  tab: 'users' | 'invites' = 'users';

  // Users state
  users: any[] = [];
  loadingUsers = false;

  // Invitations state
  invitations: any[] = [];
  loadingInvitations = false;
  inviteForm = { email: '', role: 'member', message: '' };

  // Busy flag for actions
  busy = false;

  async ngOnInit() {
    await Promise.all([this.loadUsers(), this.loadInvitations()]);
  }

  async loadUsers() {
    this.loadingUsers = true;
    try {
      const res = await this.auth.listCompanyUsers();
      if (res.success) this.users = res.users || [];
    } finally {
      this.loadingUsers = false;
    }
  }

  async loadInvitations() {
    this.loadingInvitations = true;
    try {
      const res = await this.auth.getCompanyInvitations();
      if (res.success) {
        this.invitations = res.invitations || [];
      }
    } finally {
      this.loadingInvitations = false;
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

  async changeRole(user: any) {
    this.busy = true;
    try {
      const res = await this.auth.updateCompanyUser(user.id, { role: user.role });
      if (!res.success) throw new Error(res.error || 'No se pudo actualizar el rol');
    } catch (e) {
      console.error('changeRole error', e);
    } finally {
      this.busy = false;
    }
  }

  async toggleActive(user: any) {
    this.busy = true;
    try {
      const res = await this.auth.updateCompanyUser(user.id, { active: !user.active });
      if (res.success) {
        user.active = !user.active;
      } else {
        throw new Error(res.error || 'No se pudo cambiar estado');
      }
    } catch (e) {
      console.error('toggleActive error', e);
    } finally {
      this.busy = false;
    }
  }

  async sendInvite() {
    if (!this.inviteForm.email) return;
    this.busy = true;
    try {
      const res = await this.auth.sendCompanyInvite({
        email: this.inviteForm.email,
        role: this.inviteForm.role,
        message: this.inviteForm.message || undefined,
      });
      if (!res.success) throw new Error(res.error || 'No se pudo enviar la invitación');
      this.inviteForm = { email: '', role: 'member', message: '' };
      await this.loadInvitations();
    } catch (e) {
      console.error('sendInvite error', e);
    } finally {
      this.busy = false;
    }
  }

  async resend(inv: any) {
    this.busy = true;
    try {
      const res = await this.auth.sendCompanyInvite({ email: inv.email, role: inv.role });
      if (!res.success) throw new Error(res.error || 'No se pudo reenviar');
    } catch (e) {
      console.error('resend error', e);
    } finally {
      this.busy = false;
    }
  }

  async copyLink(inv: any) {
    this.busy = true;
    try {
      const res = await this.auth.getInvitationLink(inv.id);
      if (!res.success || !res.url) throw new Error(res.error || 'No se pudo obtener enlace');
      await navigator.clipboard.writeText(res.url);
    } catch (e) {
      console.error('copyLink error', e);
    } finally {
      this.busy = false;
    }
  }
}
