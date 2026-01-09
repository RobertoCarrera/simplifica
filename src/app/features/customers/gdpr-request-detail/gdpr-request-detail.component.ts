import { Component, Input, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GdprComplianceService, GdprAccessRequest } from '../../../services/gdpr-compliance.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { Customer } from '../../../models/customer';
import { SupabaseNotificationsService } from '../../../services/supabase-notifications.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
    selector: 'app-gdpr-request-detail',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './gdpr-request-detail.component.html'
})
export class GdprRequestDetailComponent {
    private gdprService = inject(GdprComplianceService);
    private customersService = inject(SupabaseCustomersService);
    private notificationsService = inject(SupabaseNotificationsService);
    private toastService = inject(ToastService);

    @Input() set inputRequestId(id: string | null) {
        if (id) {
            this.loadRequest(id);
        }
    }

    request = signal<GdprAccessRequest | null>(null);
    customer = signal<Customer | null>(null);
    isLoading = signal<boolean>(false);

    // Auto Apply Modal State
    showAutoApplyModal = false;
    autoApplyChangesList: { field: string, newValue: string }[] = [];

    constructor() { }

    loadRequest(id: string) {
        this.isLoading.set(true);
        this.gdprService.getAccessRequests().subscribe((reqs: GdprAccessRequest[]) => {
            const found = reqs.find((r: GdprAccessRequest) => r.id === id);
            if (found) {
                this.request.set(found);
                this.loadCustomer(found.subject_email);
            } else {
                this.isLoading.set(false);
                this.toastService.error('Error', 'Solicitud no encontrada');
            }
        });
    }

    loadCustomer(email: string) {
        this.customersService.getCustomers().subscribe((customers: Customer[]) => {
            const found = customers.find((c: Customer) => c.email === email);
            if (found) {
                this.customer.set(found);
            }
            this.isLoading.set(false);
        });
    }

    formatDate(date: string | undefined): string {
        if (!date) return '';
        return new Date(date).toLocaleDateString('es-ES', {
            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    // --- Actions ---

    openAutoApplyModal() {
        const req = this.request();
        if (!req) return;

        if (!req.request_details?.description) {
            this.toastService.error('Error', 'La solicitud no tiene detalles para procesar.');
            return;
        }

        const updates = this.parseRectificationRequests(req.request_details.description);
        if (Object.keys(updates).length === 0) {
            this.toastService.warning('Aviso', 'No se detectaron cambios procesables.');
            return;
        }

        const fieldMap: Record<string, string> = {
            'name': 'Nombre',
            'apellidos': 'Apellidos',
            'email': 'Email',
            'phone': 'Teléfono',
            'dni': 'DNI / NIF',
            'address': 'Dirección'
        };

        this.autoApplyChangesList = Object.entries(updates).map(([k, v]) => ({
            field: fieldMap[k] || k,
            newValue: String(v)
        }));

        this.showAutoApplyModal = true;
    }

    closeAutoApplyModal() {
        this.showAutoApplyModal = false;
    }

    confirmAutoApply() {
        const req = this.request();
        const cust = this.customer();
        if (!req || !cust) return;

        const updates = this.parseRectificationRequests(req.request_details?.description || '');

        this.isLoading.set(true);
        this.customersService.updateCustomer(cust.id, updates).subscribe({
            next: () => {
                this.toastService.success('Éxito', 'Datos actualizados correctamente.');
                this.markRequestCompleted();
                this.closeAutoApplyModal();
                this.isLoading.set(false);
                // Refresh customer data
                this.loadCustomer(cust.email);
            },
            error: (err: any) => {
                console.error('Error updating customer:', err);
                this.toastService.error('Error', 'Fallo al actualizar los datos.');
                this.isLoading.set(false);
                this.closeAutoApplyModal();
            }
        });
    }

    markRequestCompleted() {
        const req = this.request();
        if (!req) return;

        this.gdprService.updateAccessRequestStatus(req.id!, 'completed').subscribe({
            next: (updatedReq: any) => {
                this.toastService.success('Éxito', 'Solicitud marcada como completada');

                // Notify user
                const cust = this.customer();
                if (cust && cust.usuario_id) {
                    this.notificationsService.sendNotification(
                        cust.usuario_id,
                        'Solicitud RGPD Completada',
                        `Su solicitud de ${req.request_type} ha sido procesada y completada.`,
                        'success',
                        req.id
                    );
                }

                // Reload request
                this.loadRequest(req.id!);
            },
            error: (err: any) => this.toastService.error('Error', 'No se pudo actualizar la solicitud')
        });
    }

    parseRectificationRequests(description: string): Partial<Customer> {
        const updates: Partial<Customer> = {};
        const lines = description.split('\n');

        lines.forEach(line => {
            const match = line.match(/- (.*?): Valor actual ".*?" => Nuevo valor "(.*?)"/);
            if (match && match[2]) {
                const fieldLabel = match[1].trim();
                const newValue = match[2].trim();

                switch (fieldLabel) {
                    case 'Nombre Completo':
                        const parts = newValue.split(' ');
                        if (parts.length > 1) {
                            updates.name = parts[0];
                            updates.apellidos = parts.slice(1).join(' ');
                        } else {
                            updates.name = newValue;
                        }
                        break;
                    case 'Email': updates.email = newValue; break;
                    case 'Teléfono': updates.phone = newValue; break;
                    case 'DNI / NIF': updates.dni = newValue; break;
                    case 'Dirección': updates.address = newValue; break;
                }
            }
        });
        return updates;
    }

    isRectificationCompleted(): boolean {
        const req = this.request();
        if (!req) return true;
        if (req.request_type !== 'rectification') return true;
        if (req.processing_status === 'completed') return true;

        if (!req.request_details?.description) return false;

        const cust = this.customer();
        if (!cust) return false;

        const updates = this.parseRectificationRequests(req.request_details.description);
        if (Object.keys(updates).length === 0) return true;

        for (const [key, value] of Object.entries(updates)) {
            const currentVal = (cust as any)[key];
            const v1 = String(currentVal || '').trim();
            const v2 = String(value || '').trim();
            if (v1 !== v2) return false;
        }
        return true;
    }
}
