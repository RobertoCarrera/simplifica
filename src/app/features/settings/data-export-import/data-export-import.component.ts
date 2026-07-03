import { Component, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CsvHeaderMapperComponent, CsvMappingResult } from '../../../shared/ui/csv-header-mapper/csv-header-mapper.component';
import { ClinicalImportWizardComponent } from './clinical-import-wizard/clinical-import-wizard.component';
import { DoctoraliaBookingsWizardComponent } from './doctoralia-bookings-wizard/doctoralia-bookings-wizard.component';
import { SupabaseCustomersService, CustomerFilters } from '../../../services/supabase-customers.service';
import { SupabaseServicesService } from '../../../services/supabase-services.service';
import { ToastService } from '../../../services/toast.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';

type DataType = 'customers' | 'services' | 'clinical-history' | 'doctoralia-bookings';

@Component({
    selector: 'app-data-export-import',
    standalone: true,
    imports: [CommonModule, FormsModule, CsvHeaderMapperComponent, ClinicalImportWizardComponent, DoctoraliaBookingsWizardComponent],
    templateUrl: './data-export-import.component.html'
})
export class DataExportImportComponent {
    private customersService = inject(SupabaseCustomersService);
    private servicesService = inject(SupabaseServicesService);
    private toastService = inject(ToastService);
    private simpleSupabase = inject(SimpleSupabaseService);
    modulesService = inject(SupabaseModulesService);

    activeSection = signal<'export' | 'import'>('export');
    selectedDataType = signal<DataType>('customers');

    /** Show the clinical-history wizard child instead of the generic CSV flow */
    showClinicalWizard = signal(false);

    /** Show the doctoralia-bookings wizard child */
    showDoctoraliaWizard = signal(false);

    /** Pre-parsed headers + rows for the doctoralia wizard */
    doctoraliaHeaders = signal<string[]>([]);
    doctoraliaRows = signal<string[][]>([]);

    // CSV Mapper State
    showCsvMapper = signal(false);
    csvHeaders = signal<string[]>([]);
    csvData = signal<string[][]>([]); // Preview data
    fullCsvData = signal<string[][]>([]); // Full dataset for customers
    pendingCsvFile: File | null = null;

    // Loading & Progress
    loading = signal(false);
    importToastId: string | null = null;

    // --- Configuration for Customers ---
    customerFieldOptions = [
        { value: 'email', label: 'Email', required: false },
        { value: 'phone', label: 'Teléfono', required: false },
        { value: 'name', label: 'Nombre (persona física)', required: false },
        { value: 'surname', label: 'Apellidos (persona física)', required: false },
        { value: 'dni', label: 'DNI (persona física)', required: false },
        { value: 'client_type', label: 'Tipo de Cliente (individual/business)', required: false },
        { value: 'business_name', label: 'Razón Social (empresa)', required: false },
        { value: 'cif_nif', label: 'CIF/NIF (empresa)', required: false },
        { value: 'trade_name', label: 'Nombre Comercial (empresa)', required: false },
        { value: 'legal_representative_name', label: 'Representante Legal - Nombre', required: false },
        { value: 'legal_representative_dni', label: 'Representante Legal - DNI', required: false },
        { value: 'mercantile_registry_data', label: 'Datos Registro Mercantil', required: false },
        { value: 'address', label: 'Dirección Completa', required: false },
        { value: 'addressTipoVia', label: 'Tipo Vía', required: false },
        { value: 'addressNombre', label: 'Nombre Vía', required: false },
        { value: 'addressNumero', label: 'Número', required: false },
        { value: 'notes', label: 'Notas', required: false },
        { value: 'metadata', label: 'Metadata (otros datos)', required: false }
    ];
    customerAliasMap: Record<string, string[]> = {
        email: ['email', 'correo', 'e-mail', 'mail'],
        phone: ['phone', 'telefono', 'teléfono', 'tel', 'mobile', 'movil'],
        name: ['name', 'nombre', 'first_name', 'firstname'],
        surname: ['surname', 'last_name', 'lastname', 'apellidos'],
        dni: ['dni', 'nif', 'documento', 'id'],
        client_type: ['client_type', 'tipo_cliente', 'type'],
        business_name: ['business_name', 'razon_social', 'company_name', 'empresa'],
        cif_nif: ['cif_nif', 'cif', 'tax_id', 'vat'],
        trade_name: ['trade_name', 'nombre_comercial'],
        address: ['address', 'direccion', 'dirección', 'domicilio'],
        addressTipoVia: ['addressTipoVia', 'tipo_via', 'via'],
        addressNombre: ['addressNombre', 'nombre_via', 'calle'],
        addressNumero: ['addressNumero', 'numero', 'number']
    };

    // --- Configuration for Services ---
    serviceFieldOptions = [
        { value: 'name', label: 'Nombre *', required: true },
        { value: 'description', label: 'Descripción' },
        { value: 'base_price', label: 'Precio base (€)' },
        { value: 'estimated_hours', label: 'Horas estimadas' },
        { value: 'category', label: 'Categoría' },
        { value: 'tags', label: 'Tags (separados por |)' }
    ];
    serviceRequiredFields = ['name'];
    serviceAliasMap: Record<string, string[]> = {
        name: ['name', 'nombre', 'service', 'servicio'],
        description: ['description', 'descripcion', 'descripción', 'detalle', 'notes'],
        base_price: ['base_price', 'precio', 'price', 'importe'],
        estimated_hours: ['estimated_hours', 'horas', 'duracion', 'duración', 'tiempo'],
        category: ['category', 'categoria', 'categoría'],
        tags: ['tags', 'etiquetas']
    };

    // --- Getters for current selection ---
    get currentFieldOptions() {
        return this.selectedDataType() === 'customers' ? this.customerFieldOptions : this.serviceFieldOptions;
    }

    get currentRequiredFields() {
        return this.selectedDataType() === 'customers' ? [] : this.serviceRequiredFields;
    }

    get currentAliasMap() {
        return this.selectedDataType() === 'customers' ? this.customerAliasMap : this.serviceAliasMap;
    }

    // --- Export Logic ---
    exportData() {
        if (this.selectedDataType() === 'customers') {
            this.exportCustomers();
        } else {
            // Services export not yet implemented/requested
            this.toastService.info('Exportación de servicios no disponible aún.', 'Próximamente');
        }
    }

    private exportCustomers() {
        this.loading.set(true);
        // Export ALL customers (empty filters)
        const filters: CustomerFilters = {
            sortOrder: 'asc',
            sortBy: 'name'
        };

        this.customersService.exportToCSV(filters).subscribe({
            next: (blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `clientes_export_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
                this.toastService.success('¡Éxito!', 'Clientes exportados correctamente');
                this.loading.set(false);
            },
            error: (error) => {
                console.error('Error exporting customers:', error);
                this.toastService.error('Error exportando clientes', error.message || String(error));
                this.loading.set(false);
            }
        });
    }

    // --- Import Logic ---
    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement | null;
        if (!input?.files || input.files.length === 0) {
            return;
        }
        const file = input.files[0];
        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.toastService.error('Error', 'Por favor selecciona un archivo CSV válido');
            return;
        }

        this.pendingCsvFile = file;
        this.loading.set(true);

        if (this.selectedDataType() === 'clinical-history') {
            // Pre-parse the CSV here (parent component) so the child wizard
            // doesn't need to touch the File or re-trigger change detection
            // (which previously caused an infinite ngOnChanges loop).
            this.loading.set(true);
            this.parseCsvInParent(file).then(({ headers, rows }) => {
                this.clinicalHeaders.set(headers);
                this.clinicalRows.set(rows);
                this.csvHeaders.set([]);
                this.fullCsvData.set([]);
                this.csvData.set([]);
                this.showCsvMapper.set(false);
                this.loading.set(false);
                this.showClinicalWizard.set(true);
                input.value = '';
            }).catch((e: any) => {
                this.toastService.error('Error leyendo CSV', e?.message ?? String(e));
                this.loading.set(false);
                input.value = '';
            });
            return;
        }

        if (this.selectedDataType() === 'doctoralia-bookings') {
            this.loading.set(true);
            this.parseCsvInParent(file).then(({ headers, rows }) => {
                this.doctoraliaHeaders.set(headers);
                this.doctoraliaRows.set(rows);
                this.csvHeaders.set([]);
                this.fullCsvData.set([]);
                this.csvData.set([]);
                this.showCsvMapper.set(false);
                this.loading.set(false);
                this.showDoctoraliaWizard.set(true);
                input.value = '';
            }).catch((e: any) => {
                this.toastService.error('Error leyendo CSV', e?.message ?? String(e));
                this.loading.set(false);
                input.value = '';
            });
            return;
        }

        if (this.selectedDataType() === 'customers') {
            this.customersService.parseCSVForMapping(file).subscribe({
                next: ({ headers, data }) => {
                    this.csvHeaders.set(headers);
                    this.fullCsvData.set(data);
                    this.csvData.set(data.slice(0, Math.min(10, data.length)));
                    this.showCsvMapper.set(true);
                    this.loading.set(false);
                    input.value = ''; // reset
                },
                error: (err) => {
                    this.toastService.error('Error leyendo CSV', err.message || String(err));
                    this.loading.set(false);
                    input.value = '';
                }
            });
        } else {
            // Services
            this.servicesService.parseCSVFileForServices(file).then(({ headers, data }) => {
                this.csvHeaders.set(headers);
                this.csvData.set(data.slice(0, 11)); // header + 10 rows
                this.showCsvMapper.set(true);
                this.loading.set(false);
                input.value = '';
            }).catch(err => {
                this.toastService.error('Error leyendo CSV', err.message || String(err));
                this.loading.set(false);
                input.value = '';
            });
        }
    }

    onMappingConfirmed(result: CsvMappingResult) {
        this.showCsvMapper.set(false);
        if (!this.pendingCsvFile) return;

        // Convert FieldMapping[] to Record<string, string>
        const mappingsRecord: Record<string, string> = {};
        result.mappings.forEach(m => {
            if (m.targetField) {
                mappingsRecord[m.csvHeader] = m.targetField;
            }
        });

        if (this.selectedDataType() === 'customers') {
            this.importCustomers(mappingsRecord);
        } else if (this.selectedDataType() === 'services') {
            this.importServices(mappingsRecord);
        }
        // 'clinical-history' is handled inside the ClinicalImportWizardComponent
        // via its own dialog flow, not via the generic CsvHeaderMapperComponent.
    }

    onMappingCancelled() {
        this.showCsvMapper.set(false);
        this.pendingCsvFile = null;
        this.fullCsvData.set([]);
    }

    /** Called by the clinical wizard child when it finishes (or is cancelled). */
    onClinicalWizardClose() {
        this.showClinicalWizard.set(false);
        this.pendingCsvFile = null;
        this.clinicalHeaders.set([]);
        this.clinicalRows.set([]);
    }

    /** Called by the doctoralia wizard child when it finishes (or is cancelled). */
    onDoctoraliaWizardClose() {
        this.showDoctoraliaWizard.set(false);
        this.pendingCsvFile = null;
        this.doctoraliaHeaders.set([]);
        this.doctoraliaRows.set([]);
    }

    private importCustomers(mappings: Record<string, string>) {
        this.importToastId = this.toastService.info('Importación iniciada', 'Procesando clientes...', 8000, true);

        // Build rows from full dataset
        const mappedCustomers = this.customersService.buildPayloadRowsFromMapping(
            this.csvHeaders(),
            this.fullCsvData().slice(1), // skip header
            mappings as any
        );

        if (!mappedCustomers.length) {
            this.toastService.error('Error', 'No se encontraron datos válidos');
            return;
        }

        const total = mappedCustomers.length;
        let importedCount = 0;

        this.customersService.importCustomersInBatches(mappedCustomers, 5).subscribe({
            next: (p) => {
                importedCount = p.importedCount;
                if (this.importToastId) {
                    const progress = p.totalCount > 0 ? p.importedCount / p.totalCount : 0;
                    this.toastService.updateToast(this.importToastId, {
                        title: 'Importando Clientes...',
                        message: `${p.importedCount} de ${p.totalCount}`,
                        progress
                    });
                }
            },
            complete: () => {
                if (this.importToastId) {
                    this.toastService.updateToast(this.importToastId, { type: 'success', title: 'Importación Completada', message: `Se importaron ${importedCount} clientes.`, duration: 5000 });
                }
                this.pendingCsvFile = null;
                this.fullCsvData.set([]);
            },
            error: (err) => {
                if (this.importToastId) {
                    this.toastService.updateToast(this.importToastId, { type: 'error', title: 'Error', message: err.message || String(err) });
                }
                this.pendingCsvFile = null;
            }
        });
    }

    private async importServices(mappings: Record<string, string>) {
        if (!this.pendingCsvFile) return;
        this.loading.set(true);

        // Get active company ID from service or elsewhere? 
        // The service usually needs a companyId. SupabaseServicesComponent gets it from a selector or defaults.
        // Here centralized, we assume the CURRENT USER'S active company.
        // SimpleSupabaseService.getCompanies() returns user's companies.

        // Quick fetch of default company
        let targetCompanyId = '';
        try {
            const res = await this.simpleSupabase.getCompanies();
            if (res.success && res.data && res.data.length > 0) {
                // Prefer the one that looks like a UUID
                const valid = res.data.find(c => /[0-9a-fA-F]{8}-/.test(c.id));
                targetCompanyId = valid ? valid.id : res.data[0].id;
            }
        } catch (e) {
            console.warn("Could not determine company for service import", e);
        }

        this.servicesService.mapAndUploadServicesCsv(this.pendingCsvFile, mappings, targetCompanyId)
            .then((count) => {
                this.toastService.success('Éxito', `Se han importado ${count} servicios.`);
            })
            .catch((err) => {
                this.toastService.error('Error', err.message || 'Error importando servicios');
            })
            .finally(() => {
                this.loading.set(false);
                this.pendingCsvFile = null;
            });
    }

    // ── Clinical-history pre-parse ─────────────────────────────────
    /**
     * Pre-parsed headers + rows for the clinical-history wizard. Computed
     * once in the parent so the child never touches the File and never
     * triggers a re-init (which caused an infinite ngOnChanges loop).
     */
    clinicalHeaders = signal<string[]>([]);
    clinicalRows = signal<string[][]>([]);

    private async parseCsvInParent(file: File): Promise<{ headers: string[]; rows: string[][] }> {
        const text = await file.text();
        if (text.length === 0) {
            throw new Error('El archivo CSV está vacío');
        }

        // Auto-detect the separator on the FIRST non-empty line that doesn't
        // start with a quote. Sample up to 200 chars to count candidates.
        const detectSeparator = (text: string): string => {
            // Look at the first ~500 chars, count occurrences
            const sample = text.slice(0, 500);
            const candidates: string[] = [',', ';', '\t', '|'];
            const counts = candidates.map((sep) => {
                let count = 0;
                for (let i = 0; i < sample.length; i++) {
                    if (sample[i] === sep) count++;
                }
                return { sep, count };
            });
            counts.sort((a, b) => b.count - a.count);
            return counts[0].count > 0 ? counts[0].sep : ',';
        };

        const separator = detectSeparator(text);

        // RFC 4180-ish CSV parser: walk char-by-char, respect quoted fields,
        // handle escaped quotes (""), and — crucially — newlines INSIDE quoted
        // fields are kept as part of the field, NOT used as row separators.
        const records: string[][] = [];
        let cur = '';
        let field: string[] = [];
        let inQuotes = false;

        const pushField = () => {
            field.push(cur);
            cur = '';
        };
        const pushRecord = () => {
            pushField();
            records.push(field);
            field = [];
        };

        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inQuotes) {
                if (c === '"') {
                    if (text[i + 1] === '"') { cur += '"'; i++; }
                    else { inQuotes = false; }
                } else {
                    cur += c;
                }
            } else {
                if (c === '"') {
                    inQuotes = true;
                } else if (c === separator) {
                    pushField();
                } else if (c === '\n' || c === '\r') {
                    // End of record. Normalize \r\n to a single boundary.
                    if (c === '\r' && text[i + 1] === '\n') i++;
                    // Only push the record if it has at least one non-empty field,
                    // or if the field buffer already has content (avoids dropping
                    // rows that consist of a single empty cell).
                    if (field.length > 0 || cur.length > 0) {
                        pushRecord();
                    } else {
                        // Pure-empty line; skip.
                    }
                } else {
                    cur += c;
                }
            }
        }
        // Flush trailing field/record if any
        if (cur.length > 0 || field.length > 0) {
            pushRecord();
        }

        if (records.length === 0) {
            throw new Error('El archivo CSV está vacío o no tiene filas');
        }

        const headers = records[0].map((s) => s.trim());
        const expectedCols = headers.length;

        // Post-parse normalization: pad short rows, rejoin overflow rows.
        const rows = records.slice(1).map((rawFields) => {
            const fields = rawFields.map((s) => s.trim());
            if (expectedCols <= 0) return fields;
            if (fields.length < expectedCols) {
                const padded = fields.slice();
                while (padded.length < expectedCols) padded.push('');
                return padded;
            }
            if (fields.length > expectedCols) {
                const head = fields.slice(0, expectedCols - 1);
                const tail = fields.slice(expectedCols - 1).join(separator);
                return [...head, tail];
            }
            return fields;
        });

        return { headers, rows };
    }
}


