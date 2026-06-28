import { Component, Input, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GdprComplianceService, GdprAccessRequest } from '../../../services/gdpr-compliance.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { Customer } from '../../../models/customer';
import { SupabaseNotificationsService } from '../../../services/supabase-notifications.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Structured breakdown of a single-string Spanish postal address.
 * Used to render the parsed components in the GDPR auto-apply modal
 * and (when successful) to populate the structured Customer columns.
 */
interface ParsedAddress {
    tipoVia: string;
    nombre: string;
    numero: string;
    piso: string;
    puerta: string;
}

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
    autoApplyChangesList: { field: string, fieldKey?: string, newValue: string }[] = [];

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
        // Use exact email match — `getCustomers({ search })` routes through
        // `search_customers_dev` which does fuzzy matching on name/CIF and is
        // unreliable for an exact email hit. The GDPR rectification flow needs
        // the *one* client whose email is the request's `subject_email`.
        this.isLoading.set(true);
        this.customersService.getCustomerByEmail(email).subscribe((found: Customer | null) => {
            if (found) {
                this.customer.set(found);
            } else {
                console.warn('Customer not found for GDPR request email:', email);
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
            'surname': 'Apellidos',
            'email': 'Email',
            'phone': 'Teléfono',
            'dni': 'DNI / NIF',
            'address': 'Dirección',
            'website': 'Sitio Web',
            'client_type': 'Tipo de Cliente',
            'cif_nif': 'CIF / NIF',
            'addressTipoVia': 'Tipo de Vía',
            'addressNombre': 'Calle',
            'addressNumero': 'Número'
        };

        this.autoApplyChangesList = Object.entries(updates).map(([k, v]) => ({
            field: fieldMap[k] || k,
            fieldKey: k,
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

        console.log('Attempting auto-apply:', { req, cust });

        if (!req) {
            this.toastService.error('Error', 'No se ha cargado la solicitud.');
            return;
        }
        if (!cust) {
            this.toastService.error('Error', 'No se ha encontrado el cliente asociado al email: ' + req.subject_email);
            return;
        }

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
            // Format used by both the CRM GdprRequestModalComponent and the
            // portal PortalGdprRectifyModalComponent:
            //   - Label: "oldValue" => "newValue"
            // Optional [DATA:...] tag on the address line for structured fields.
            const match = line.match(/- (.*?): "(.*?)" => "(.*?)"/);
            if (match && match[3]) {
                const fieldLabel = match[1].trim();
                const newValue = match[3].trim();

                switch (fieldLabel) {
                    case 'Nombre Completo':
                        const parts = newValue.split(' ');
                        // If it's a personal name, we try to split.
                        // Ideally we should have separate fields or detect based on current data.
                        if (parts.length > 1) {
                            updates.name = parts[0];
                            updates.surname = parts.slice(1).join(' ');
                        } else {
                            updates.name = newValue;
                        }
                        break;
                    case 'Razón Social':
                        updates.business_name = newValue;
                        break;
                    case 'Nombre Comercial':
                        updates.trade_name = newValue;
                        break;
                    case 'Email': 
                        updates.email = newValue; 
                        break;
                    case 'Email Facturación':
                        updates.billing_email = newValue;
                        break;
                    case 'Teléfono': updates.phone = newValue; break;
                    case 'IBAN / Cuenta':
                        updates.iban = newValue;
                        break;
                    case 'DNI / NIF': 
                    case 'DNI / CIF':
                    case 'CIF / NIF':
                        // Update both for safety if not sure which one is used
                        updates.dni = newValue; 
                        updates.cif_nif = newValue;
                        break;
                    case 'Dirección':
                    case 'Dirección Física':
                    case 'Dirección Fiscal':
                        // The `clients` table only has a single `address` text column —
                        // it does NOT have structured `addressTipoVia` / `addressNombre` /
                        // `addressNumero` / `addressPiso` / `addressPuerta` / ... columns.
                        // Persist the raw string verbatim. The modal still renders the
                        // parsed breakdown (tipo de vía, nombre, número, piso, puerta)
                        // via `getAddressBreakdown`, which parses the value on the fly.
                        updates.address = newValue;
                        break;
                    case 'Sitio Web':
                        updates.website = newValue;
                        break;
                    case 'Tipo de Cliente':
                        if (newValue.toLowerCase().includes('empresa')) {
                            updates.client_type = 'business';
                        } else {
                            updates.client_type = 'individual';
                        }
                        break;
                }
            }
        });
        return updates;
    }

    // ─── Spanish single-string address parsing ────────────────────────────────────

    /**
     * Map of recognised "tipo de vía" prefixes used at the start of a Spanish
     * postal address (e.g. "C/Segre 13" → Calle + Segre 13). Add more as needed.
     */
    private readonly TIPO_VIA_MAP: Record<string, string> = {
        'C/': 'Calle',
        'Cl/': 'Calle',
        'Av/': 'Avenida',
        'Avda/': 'Avenida',
        'Pz/': 'Plaza',
        'Pl/': 'Plaza',
        'Plza/': 'Plaza',
        'Ps/': 'Paseo',
        'Pseo/': 'Paseo',
        'Cr/': 'Carretera',
        'Ctra/': 'Carretera',
        'Tr/': 'Travesía',
        'Gv/': 'Gran Vía',
        'Rd/': 'Ronda',
        'Cm/': 'Camino',
        'Po/': 'Poblado'
    };

    /**
     * Splits a single-string Spanish address into its main components.
     *
     * Examples:
     *   "C/Segre 13, 3º3ª"  → { tipoVia: 'Calle',    nombre: 'Segre', numero: '13', piso: '3º', puerta: '3ª' }
     *   "Av/Mayor 5, 2ºA"   → { tipoVia: 'Avenida',  nombre: 'Mayor', numero: '5',  piso: '2º', puerta: 'A' }
     *   "C/Sol 10"          → { tipoVia: 'Calle',    nombre: 'Sol',   numero: '10', piso: '',    puerta: '' }
     *
     * Returns null when the value doesn't start with a recognised prefix or
     * doesn't yield a usable "nombre" — callers must fall back to the raw string.
     */
    parseSpanishAddress(value: string): ParsedAddress | null {
        if (!value || typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;

        let tipoVia = '';
        let remainder = trimmed;

        // Match the longest prefix first so "Avda/" wins over "Av/".
        const prefixes = Object.keys(this.TIPO_VIA_MAP)
            .sort((a, b) => b.length - a.length);

        for (const prefix of prefixes) {
            if (trimmed.startsWith(prefix)) {
                tipoVia = this.TIPO_VIA_MAP[prefix];
                remainder = trimmed.substring(prefix.length).trim();
                break;
            }
        }

        if (!tipoVia) return null;

        // Split on comma to separate "Nombre Número" from "Piso Puerta".
        const parts = remainder
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        let nombre = '';
        let numero = '';
        let piso = '';
        let puerta = '';

        if (parts.length >= 1) {
            const head = parts[0];
            // "Segre 13" → nombre="Segre", numero="13"
            const numMatch = head.match(/^(.+?)\s+(\d+\S?)\s*$/);
            if (numMatch) {
                nombre = numMatch[1].trim();
                numero = numMatch[2].trim();
            } else {
                nombre = head;
            }
        }

        if (parts.length >= 2) {
            const tail = parts.slice(1).join(',');
            // Floor marker (3º, 2°) plus optional door suffix (3ª, A, B, Izq…).
            const floorMatch = tail.match(/(\d+)\s*([º°])\s*([A-Za-z0-9ªº°-]*)/);
            if (floorMatch) {
                piso = floorMatch[1] + 'º';
                if (floorMatch[3]) {
                    puerta = floorMatch[3];
                }
            } else {
                // No floor marker — treat a bare token like "B" or "3ª" as door.
                const bareDoor = tail.match(/^([A-Za-z0-9ªº°-]+)$/);
                if (bareDoor) {
                    puerta = bareDoor[1];
                }
            }
        }

        if (!nombre) return null;
        return { tipoVia, nombre, numero, piso, puerta };
    }

    /**
     * True when the auto-apply change row holds the raw "Dirección" string
     * (the catch-all `address` field) — only this row benefits from the
     * single-string parser. Rows for individual structured columns
     * (`addressTipoVia`, `addressNombre`, …) are already atomic and are
     * rendered as-is.
     */
    private isAddressCatchAll(fieldKey: string | undefined): boolean {
        return fieldKey === 'address';
    }

    /**
     * For the auto-apply modal: returns a list of parsed address rows
     * (label/value) when the change can be desglosed, otherwise null so the
     * template falls back to the raw `newValue`.
     */
    getAddressBreakdown(change: { fieldKey?: string, field: string, newValue: string }):
        { label: string, value: string }[] | null {
        if (!change || !this.isAddressCatchAll(change.fieldKey)) return null;
        if (!change.newValue || typeof change.newValue !== 'string') return null;

        const parsed = this.parseSpanishAddress(change.newValue);
        if (!parsed) return null;

        const rows: { label: string, value: string }[] = [];
        if (parsed.tipoVia) rows.push({ label: 'Tipo de vía', value: parsed.tipoVia });
        if (parsed.nombre)  rows.push({ label: 'Nombre',      value: parsed.nombre });
        if (parsed.numero)  rows.push({ label: 'Número',      value: parsed.numero });
        if (parsed.piso)    rows.push({ label: 'Piso',        value: parsed.piso });
        if (parsed.puerta)  rows.push({ label: 'Puerta',      value: parsed.puerta });
        return rows.length > 0 ? rows : null;
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

    // ─── Deadline helpers (GDPR compliance) ───────────────────────────────────────

    /** Returns true if deadline has passed */
    isOverdue(deadlineDate: string): boolean {
        return new Date(deadlineDate) < new Date();
    }

    /** Days remaining until deadline (positive = future, negative = past) */
    getDaysRemaining(deadlineDate: string): number {
        return Math.ceil(
            (new Date(deadlineDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
    }

    /** Days overdue (positive number) */
    getDaysOverdue(deadlineDate: string): number {
        return Math.abs(this.getDaysRemaining(deadlineDate));
    }

    /**
     * Returns deadline status:
     * 'safe'     : > 15 days remaining
     * 'caution'  : 5-15 days remaining
     * 'warning'  : 2-5 days remaining
     * 'critical' : 1 day remaining
     * 'overdue'  : deadline passed
     */
    getDeadlineStatus(deadlineDate: string): 'safe' | 'caution' | 'warning' | 'critical' | 'overdue' {
        if (this.isOverdue(deadlineDate)) return 'overdue';
        const days = this.getDaysRemaining(deadlineDate);
        if (days <= 1) return 'critical';
        if (days <= 5) return 'warning';
        if (days <= 15) return 'caution';
        return 'safe';
    }

    /** CSS badge class based on deadline urgency */
    getDeadlineBadgeClass(deadlineDate: string): string {
        const status = this.getDeadlineStatus(deadlineDate);
        switch (status) {
            case 'overdue':  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700 animate-pulse';
            case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700';
            case 'warning':  return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-300 dark:border-orange-700';
            case 'caution': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700';
            default:         return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700';
        }
    }

    /** Escalate an overdue request: notifies owner/DPO and logs the escalation */
    escalateRequest(): void {
        const req = this.request();
        if (!req) return;

        const subjectEmail = req.subject_email;
        const daysOverdue = this.getDaysOverdue(req.deadline_date!);

        // Log the escalation
        this.gdprService.logGdprEvent(
            'escalation',
            'gdpr_access_requests',
            req.id,
            subjectEmail,
            `Solicitud vencida hace ${daysOverdue} días. Solicitud de ${req.request_type}.`
        );

        this.toastService.error(
            '🔴 Solicitud VENCIDA',
            `Solicitud ${req.request_type} de ${subjectEmail} lleva ${daysOverdue} día${daysOverdue !== 1 ? 's' : ''} vencida. Notifica al DPO o responsable de protección de datos.`
        );
    }
}
