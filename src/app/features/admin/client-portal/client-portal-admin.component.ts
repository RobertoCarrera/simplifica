import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientPortalService } from '../../../services/client-portal.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-client-portal-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="max-w-3xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Portal de clientes - Mapeos</h1>

    <form class="bg-white rounded-xl shadow p-4 mb-6" (ngSubmit)="save()">
      <div class="grid md:grid-cols-3 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1">Cliente (client_id)</label>
          <input class="w-full border rounded px-3 py-2" [(ngModel)]="form.client_id" name="client_id" placeholder="UUID" required />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <input class="w-full border rounded px-3 py-2" [(ngModel)]="form.email" name="email" placeholder="cliente@correo.com" required />
        </div>
        <div class="flex items-end">
          <button class="px-4 py-2 bg-indigo-600 text-white rounded" type="submit">Guardar</button>
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-2">La empresa se toma de tu sesión actual.</p>
    </form>

    <div class="bg-white rounded-xl shadow p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold">Mapeos existentes</h2>
        <button class="text-sm text-indigo-600" (click)="reload()">Recargar</button>
      </div>
      <div *ngIf="loading" class="text-gray-600">Cargando…</div>
      <table *ngIf="!loading" class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-600">
            <th class="py-2">Email</th>
            <th class="py-2">Client ID</th>
            <th class="py-2">Activo</th>
            <th class="py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let m of mappings" class="border-t">
            <td class="py-2">{{ m.email }}</td>
            <td class="py-2">{{ m.client_id }}</td>
            <td class="py-2">{{ m.is_active ? 'Sí' : 'No' }}</td>
            <td class="py-2 text-right">
              <button class="text-red-600" (click)="remove(m.id)">Eliminar</button>
            </td>
          </tr>
          <tr *ngIf="mappings.length === 0">
            <td colspan="4" class="py-3 text-gray-500">Sin mapeos</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  `
})
export class ClientPortalAdminComponent implements OnInit {
  private portal = inject(ClientPortalService);
  private auth = inject(AuthService);

  mappings: any[] = [];
  loading = false;
  form = { client_id: '', email: '' };

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading = true;
    const { data } = await this.portal.listMappings();
    this.mappings = data;
    this.loading = false;
  }

  async save() {
    const cid = this.auth.companyId();
    if (!cid) return;
    const res = await this.portal.upsertMapping({ company_id: cid, client_id: this.form.client_id, email: this.form.email });
    if (res.success) {
      this.form = { client_id: '', email: '' };
      await this.reload();
    }
  }

  async remove(id: string) {
    await this.portal.deleteMapping(id);
    await this.reload();
  }
}
