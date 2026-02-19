import { Component, Input, Output, EventEmitter, inject, ElementRef, OnInit, OnDestroy, HostListener } from "@angular/core";
import { CommonModule, DOCUMENT } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { GdprComplianceService, GdprAccessRequest } from "../../../../services/gdpr-compliance.service";
import { ToastService } from "../../../../services/toast.service";
import { LocalitiesService } from "../../../../services/localities.service";
import { Locality } from "../../../../models/locality";

@Component({
    selector: "app-gdpr-request-modal",
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div *ngIf="showModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-[99999] flex items-center justify-center modal-backdrop">
      <div class="relative p-6 border w-11/12 md:w-1/2 lg:w-2/5 rounded-xl bg-white dark:bg-slate-800 dark:border-slate-600 modal-content-box" (click)="$event.stopPropagation()">
        
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ config.title }}</h3>
            <button (click)="close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <i class="fas fa-times text-xl"></i>
            </button>
        </div>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
            {{ config.description }}
        </p>

        <div *ngIf="config.type === 'rectification'" class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r text-sm text-blue-800 dark:text-blue-300">
           Para rectificar, selecciona los campos erróneos e introduce el valor correcto.
        </div>
        
        <div class="mb-6" *ngIf="config.type !== 'rectification'">
            <label class="block text-sm font-medium mb-2">Motivo de la solicitud</label>
            <textarea [(ngModel)]="config.reason" rows="3" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600" placeholder="Explique su motivo aquí..."></textarea>
        </div>

        <div class="mb-6" *ngIf="config.type === 'rectification'">
            <div class="space-y-4">
                <div *ngFor="let field of rectificationFields" class="p-4 border rounded-xl dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 transition-all shadow-sm">
                    <div class="flex items-center mb-3">
                        <input type="checkbox" [id]="'f-' + field.key" [(ngModel)]="field.selected" class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500">
                        <label [for]="'f-' + field.key" class="ml-3 text-sm font-semibold cursor-pointer select-none">{{ field.label }}</label>
                    </div>
                    
                    <div *ngIf="field.selected" class="ml-7 mt-3 space-y-4 animate-fadeIn">
                        <div class="text-[10px] text-gray-500 italic flex items-center gap-1.5" *ngIf="field.currentValue">
                            <i class="fas fa-info-circle text-blue-400"></i>
                            Valor registrado: {{ field.currentValue }}
                        </div>

                        <div *ngIf="field.key !== 'address'">
                            <input [(ngModel)]="field.newValue" [placeholder]="'Nuevo ' + field.label" 
                                class="w-full px-3 py-2 text-sm border rounded-lg dark:bg-slate-900 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>

                        <!-- Address Form: Single Column with Search -->
                        <div *ngIf="field.key === 'address'" class="space-y-3 bg-white dark:bg-slate-900/50 p-4 rounded-xl border dark:border-slate-700 shadow-inner">
                            <div class="relative">
                                <label class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tipo de Vía</label>
                                <input [(ngModel)]="addressFields.tipoVia" (input)="onAddressViaInput($event)" (focus)="viaDropdownOpen = true" 
                                    autocomplete="off" placeholder="Calle, Avenida, Plaza..." 
                                    class="w-full text-sm p-2.5 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                                
                                <div *ngIf="viaDropdownOpen" class="absolute z-50 top-full left-0 w-full bg-white dark:bg-gray-800 border dark:border-slate-700 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto ring-1 ring-black/5">
                                    <div *ngFor="let via of filteredVias" (click)="selectVia(via)" 
                                        class="px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer text-sm border-b dark:border-slate-700 last:border-0 transition-colors">
                                        {{ via }}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Nombre de la Vía</label>
                                <input [(ngModel)]="addressFields.nombre" placeholder="Nombre completo" 
                                    class="w-full text-sm p-2.5 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>

                            <div class="grid grid-cols-3 gap-3">
                                <div>
                                    <label class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Núm.</label>
                                    <input [(ngModel)]="addressFields.numero" placeholder="Ej: 12" 
                                        class="w-full text-sm p-2.5 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                                </div>
                                <div>
                                    <label class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Piso</label>
                                    <input [(ngModel)]="addressFields.piso" placeholder="Ej: 2º" 
                                        class="w-full text-sm p-2.5 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                                </div>
                                <div>
                                    <label class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Pta.</label>
                                    <input [(ngModel)]="addressFields.puerta" placeholder="Ej: B" 
                                        class="w-full text-sm p-2.5 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                                </div>
                            </div>

                            <div class="relative">
                                <label class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Localidad / Código Postal</label>
                                <input [(ngModel)]="addressLocalityName" (input)="onLocalityInput($event)" (focus)="localityDropdownOpen = true" 
                                    autocomplete="off" placeholder="Buscar por nombre o CP..." 
                                    class="w-full text-sm p-2.5 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    [class.border-blue-500]="formData.addressLocalidadId">
                                
                                <div *ngIf="localityDropdownOpen" class="absolute z-50 top-full left-0 w-full bg-white dark:bg-gray-800 border dark:border-slate-700 rounded-lg shadow-xl mt-1 max-h-56 overflow-y-auto ring-1 ring-black/5">
                                    <div *ngFor="let loc of filteredLocalities" (click)="selectLocality(loc)" 
                                        class="px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer border-b last:border-0 dark:border-slate-700 transition-colors group">
                                        <div class="flex flex-col">
                                            <span class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{{ loc.nombre }}</span>
                                            <span class="text-[10px] text-gray-500">{{ loc.provincia }} • <b class="text-gray-700 dark:text-gray-300">CP: {{ loc.CP }}</b></span>
                                        </div>
                                    </div>
                                    <div *ngIf="filteredLocalities.length === 0" class="p-4 text-center text-xs text-gray-500 italic">
                                        No se encontraron resultados
                                    </div>
                                </div>
                            </div>

                            <!-- Selected locality badge -->
                            <div *ngIf="formData.addressLocalidadId && !localityDropdownOpen" class="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800 text-[10px] text-blue-700 dark:text-blue-300">
                                <i class="fas fa-check-circle"></i>
                                Localidad seleccionada: {{ addressFields.poblacion }} ({{ addressFields.cp }})
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <p *ngIf="!hasSelectedFields()" class="text-xs text-red-500 mt-6 text-center italic">Seleccione al menos un campo para rectificar.</p>
        </div>

        <div class="flex justify-end gap-3 pt-6 border-t dark:border-slate-700">
            <button (click)="close()" class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors shadow-sm">Cancelar</button>
            <button (click)="submit()" [disabled]="submitting || !isValid()" class="px-5 py-2.5 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 transition-all flex items-center gap-2">
                <span *ngIf="submitting" class="animate-spin inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full font-bold"></span>
                Enviar Solicitud Rectificación
            </button>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .modal-backdrop { background-color: rgba(0, 0, 0, 0.7); backdrop-filter: blur(2px); }
    .modal-content-box { max-height: 95vh; display: flex; flex-direction: column; overflow-y: auto; }
    .animate-fadeIn { animation: fadeIn 0.2s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class GdprRequestModalComponent implements OnInit, OnDestroy {
    @Input() clientId!: string;
    @Input() clientEmail!: string;
    @Input() clientName!: string;
    @Input() clientPhone?: string;
    @Input() clientDni?: string;
    @Input() clientAddress?: string;
    @Input() clientWeb?: string;

    @Input() billingData?: {
        business_name?: string;
        trade_name?: string;
        cif_nif?: string;
        billing_email?: string;
        iban?: string;
        address?: string;
    };

    @Input() context: "personal" | "billing" = "personal";
    @Output() requestCreated = new EventEmitter<void>();

    showModal = false;
    submitting = false;

    config = {
        type: "rectification" as "rectification" | "restriction" | "objection",
        title: "",
        description: "",
        reason: ""
    };

    addressFields = {
        tipoVia: "",
        nombre: "",
        numero: "",
        piso: "",
        puerta: "",
        cp: "",
        poblacion: "",
        provincia: ""
    };

    // New logic for autocomplete
    addressVias: string[] = ['Calle', 'Avenida', 'Plaza', 'Paseo', 'Camino', 'Carretera', 'Barrio', 'Ronda'];
    filteredVias: string[] = [...this.addressVias];
    filteredLocalities: Locality[] = [];
    addressLocalityName: string = '';
    viaDropdownOpen: boolean = false;
    localityDropdownOpen: boolean = false;
    
    // Internal state for selected locality
    formData = {
        addressLocalidadId: ''
    };

    rectificationFields: Array<{
        key: string;
        label: string;
        currentValue: string;
        newValue: string;
        selected: boolean;
    }> = [];

    private gdprService = inject(GdprComplianceService);
    private toastService = inject(ToastService);
    private localitiesService = inject(LocalitiesService);
    private el = inject(ElementRef);
    private document = inject(DOCUMENT);

    @HostListener('document:click', ['$event'])
    closeAllDropdowns(event: MouseEvent) {
        this.viaDropdownOpen = false;
        this.localityDropdownOpen = false;
    }

    ngOnInit() {
        this.document.body.appendChild(this.el.nativeElement);
        this.loadLocalities();
    }

    ngOnDestroy() {
        if (this.el.nativeElement.parentNode) {
            this.el.nativeElement.parentNode.removeChild(this.el.nativeElement);
        }
    }

    loadLocalities() {
        this.localitiesService.getLocalities().subscribe(locs => {
            this.filteredLocalities = locs.slice(0, 10);
        });
    }

    onAddressViaInput(event: Event) {
        const v = (event.target as HTMLInputElement).value || '';
        this.addressFields.tipoVia = v;
        if (!v) {
            this.filteredVias = [...this.addressVias];
        } else {
            this.filteredVias = this.addressVias.filter(v_str => v_str.toLowerCase().includes(v.toLowerCase()));
        }
        this.viaDropdownOpen = true;
    }

    selectVia(via: string) {
        this.addressFields.tipoVia = via;
        this.viaDropdownOpen = false;
    }

    onLocalityInput(event: Event) {
        const v = (event.target as HTMLInputElement).value || '';
        this.addressLocalityName = v;
        
        if (v.length < 2) {
            this.filteredLocalities = [];
            return;
        }

        this.localitiesService.searchLocalities(v).subscribe(locs => {
            this.filteredLocalities = locs;
            this.localityDropdownOpen = true;
        });
    }

    selectLocality(loc: Locality) {
        this.addressFields.poblacion = loc.nombre;
        this.addressFields.cp = loc.CP;
        this.addressFields.provincia = loc.provincia;
        this.addressLocalityName = `${loc.nombre} (${loc.CP})`;
        this.formData.addressLocalidadId = loc._id;
        this.localityDropdownOpen = false;
    }

    open(type: "rectification" | "restriction" | "objection") {
        let title = "";
        let description = "";

        switch (type) {
            case "rectification":
                title = this.context === "billing" ? "Rectificar Datos de Facturación" : "Rectificar Datos Personales";
                description = "Indica qué datos son incorrectos y proporciona el valor real.";
                this.initRectificationForm();
                break;
            case "restriction":
                title = "Limitar Tratamiento";
                description = "Solicita la limitación del tratamiento de tus datos.";
                break;
            case "objection":
                title = "Oposición al Tratamiento";
                description = "Solicita dejar de tratar tus datos por motivos específicos.";
                break;
        }

        this.config = { type, title, description, reason: "" };
        this.showModal = true;
    }

    close() {
        this.showModal = false;
    }

    initRectificationForm() {
        if (this.context === "billing") {
            this.rectificationFields = [
                { key: "business_name", label: "Razón Social", currentValue: this.billingData?.business_name || "", newValue: "", selected: false },
                { key: "trade_name", label: "Nombre Comercial", currentValue: this.billingData?.trade_name || "", newValue: "", selected: false },
                { key: "cif_nif", label: "CIF / NIF", currentValue: this.billingData?.cif_nif || "", newValue: "", selected: false },
                { key: "billing_email", label: "Email Facturación", currentValue: this.billingData?.billing_email || "", newValue: "", selected: false },
                { key: "iban", label: "IBAN / Cuenta", currentValue: this.billingData?.iban || "***", newValue: "", selected: false },
                { key: "address", label: "Dirección Fiscal", currentValue: this.billingData?.address || "", newValue: "", selected: false }
            ];
        } else {
            this.rectificationFields = [
                { key: "name", label: "Nombre Completo", currentValue: this.clientName || "", newValue: "", selected: false },
                { key: "email", label: "Email", currentValue: this.clientEmail || "", newValue: "", selected: false },
                { key: "dni", label: "DNI / CIF", currentValue: this.clientDni || "No registrado", newValue: "", selected: false },
                { key: "phone", label: "Teléfono", currentValue: this.clientPhone || "No registrado", newValue: "", selected: false },
                { key: "web", label: "Sitio Web", currentValue: this.clientWeb || "No registrado", newValue: "", selected: false },
                { key: "address", label: "Dirección Física", currentValue: this.clientAddress || "No registrado", newValue: "", selected: false }
            ];
        }
    }

    hasSelectedFields(): boolean {
        return this.rectificationFields.some(f => f.selected);
    }

    isValid(): boolean {
        if (this.config.type === "rectification") {
            const selected = this.rectificationFields.filter(f => f.selected);
            if (selected.length === 0) return false;
            return selected.every(f => {
                if (f.key === "address") return this.addressFields.nombre && this.addressFields.poblacion;
                return f.newValue && f.newValue.trim().length > 0;
            });
        }
        return this.config.reason.trim().length >= 10;
    }

    submit() {
        let finalReason = this.config.reason;

        if (this.config.type === "rectification") {
            const addrField = this.rectificationFields.find(f => f.key === "address");
            if (addrField && addrField.selected) {
                addrField.newValue = `${this.addressFields.tipoVia || "CALLE"}|${this.addressFields.nombre}|${this.addressFields.numero || ""}|${this.addressFields.piso || ""}|${this.addressFields.puerta || ""}|${this.addressFields.cp || ""}|${this.addressFields.poblacion}|${this.addressFields.provincia || ""}`;
            }

            const changes = this.rectificationFields
                .filter(f => f.selected)
                .map(f => {
                    if (f.key === "address") {
                        const readable = `${this.addressFields.tipoVia || "CALLE"} ${this.addressFields.nombre}, ${this.addressFields.numero || "S/N"} ${this.addressFields.piso} ${this.addressFields.puerta}. ${this.addressFields.cp} ${this.addressFields.poblacion}`;
                        return `- ${f.label}: "${f.currentValue}" => "${readable}" [DATA:${f.newValue}]`;
                    }
                    return `- ${f.label}: "${f.currentValue}" => "${f.newValue}"`;
                })
                .join("\n");

            finalReason = "RECTIFICACIÓN:\n" + changes;
        }

        this.submitting = true;
        const request: GdprAccessRequest = {
            request_type: this.config.type,
            subject_email: this.clientEmail,
            subject_name: this.clientName || this.clientEmail.split("@")[0],
            subject_identifier: this.clientId,
            request_details: { description: finalReason }
        };

        this.gdprService.createAccessRequest(request).subscribe({
            next: () => {
                this.toastService.success("Solicitud enviada", "El responsable ha sido notificado.");
                this.submitting = false;
                this.requestCreated.emit();
                this.close();
            },
            error: (err) => {
                this.toastService.error("Error", err.message || "No se pudo enviar la solicitud");
                this.submitting = false;
            }
        });
    }
}