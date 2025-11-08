import { Component, OnInit, OnChanges, Input, Output, EventEmitter, signal, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface FieldMapping {
  csvHeader: string;
  targetField: string | null;
}

export interface CsvMappingResult {
  mappings: FieldMapping[];
  isValid: boolean;
}

@Component({
  selector: 'app-csv-header-mapper',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="csv-mapper-modal" *ngIf="visible">
      <div class="modal-overlay" (click)="cancel()">
        <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">
            <i class="fas fa-table"></i>
            Mapear Campos del CSV
          </h3>
          <button (click)="cancel()" class="modal-close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal-body">
          <!-- CSV Preview -->
          <div class="csv-preview-section">
            <h4>Vista Previa del CSV (primeras 3 filas)</h4>
            <div class="csv-preview-table">
              <table>
                <thead>
                  <tr>
                    <th *ngFor="let header of csvHeaders" class="csv-header">
                      {{ header }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of previewRows">
                    <td *ngFor="let cell of row" class="csv-cell">
                      {{ cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Field Mapping -->
          <div class="mapping-section">
            <h4>Mapear Campos</h4>
            <p class="mapping-help">
              Asigna cada columna del CSV a un campo de destino. Los campos marcados con * son obligatorios.
            </p>

            <div class="mapping-grid">
              <div *ngFor="let mapping of fieldMappings; let i = index" class="mapping-row">
                <div class="csv-column">
                  <span class="csv-column-name">{{ mapping.csvHeader }}</span>
                  <span class="sample-data" *ngIf="getSampleData(mapping.csvHeader)">
                    Ej: "{{ getSampleData(mapping.csvHeader) }}"
                  </span>
                </div>
                
                <div class="arrow">
                  <i class="fas fa-arrow-right"></i>
                </div>

                <div class="target-field">
                  <select 
                    [(ngModel)]="mapping.targetField" 
                    (ngModelChange)="onMappingChange()"
                    class="field-select"
                    [class.required]="isRequiredField(mapping.targetField)"
                  >
                    <option value="">-- No mapear --</option>
                    <optgroup *ngIf="requiredOptionList.length" label="Campos Obligatorios">
                      <option 
                        *ngFor="let opt of requiredOptionList; let oi = index" 
                        [value]="opt.value"
                        [disabled]="isFieldDisabled(opt.value, i)"
                      >
                        {{ opt.label }}
                      </option>
                    </optgroup>
                    <optgroup *ngIf="optionalOptionList.length" label="Campos Opcionales">
                      <option 
                        *ngFor="let opt of optionalOptionList; let oi = index" 
                        [value]="opt.value"
                        [disabled]="isFieldDisabled(opt.value, i)"
                      >
                        {{ opt.label }}
                      </option>
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>

            <!-- Validation Messages -->
            <div class="validation-messages" *ngIf="validationErrors().length > 0">
              <div class="error-message" *ngFor="let error of validationErrors()">
                <i class="fas fa-exclamation-triangle"></i>
                {{ error }}
              </div>
            </div>

            <!-- Auto-mapping suggestions -->
            <div class="auto-mapping-section">
              <button 
                (click)="autoMapHeaders()" 
                class="btn btn-secondary"
                type="button"
              >
                <i class="fas fa-magic"></i>
                Mapeo Automático
              </button>
              <span class="auto-mapping-help">
                Intenta mapear automáticamente basándose en nombres comunes
              </span>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button (click)="cancel()" class="btn btn-secondary">
            <i class="fas fa-times"></i>
            Cancelar
          </button>
          <button 
            (click)="confirmMapping()" 
            class="btn btn-primary"
            [disabled]="!isValidMapping()"
          >
            <i class="fas fa-check"></i>
            Confirmar e Importar
          </button>
        </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./csv-header-mapper.component.scss']
})
export class CsvHeaderMapperComponent implements OnInit, OnChanges, OnDestroy {
  @Input() visible = false;
  @Input() csvHeaders: string[] = [];
  @Input() csvData: string[][] = [];
  // Generic configuration for consumers (services/customers/others)
  @Input() fieldOptions: { value: string; label: string; required?: boolean }[] | null = null;
  @Input() requiredFields: string[] = ['name', 'surname', 'email'];
  // Optional alias map to improve auto-mapping: { targetField: [aliases...] }
  @Input() aliasMap: Record<string, string[]> | null = null;
  
  @Output() mappingConfirmed = new EventEmitter<CsvMappingResult>();
  @Output() cancelled = new EventEmitter<void>();

  fieldMappings: FieldMapping[] = [];
  previewRows: string[][] = [];
  validationErrors = signal<string[]>([]);
  requiredOptionList: { value: string; label: string }[] = [];
  optionalOptionList: { value: string; label: string }[] = [];

  private defaultCustomerRequiredFields = ['name', 'surname', 'email'];

  ngOnInit() {
    this.initializeMappings();
    this.preparePreviewData();
    this.refreshOptionLists();
    this.autoMapHeaders();
    // Ensure body class is set if initially visible
    if (this.visible) {
      document.body.classList.add('modal-open');
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // If headers or data change after init, rebuild mappings and preview
    if ((changes['csvHeaders'] && !changes['csvHeaders'].firstChange) ||
        (changes['csvData'] && !changes['csvData'].firstChange)) {
      this.initializeMappings();
      this.preparePreviewData();
      this.refreshOptionLists();
      this.autoMapHeaders();
    }

    if (changes['visible'] && !changes['visible'].firstChange) {
      if (this.visible) {
        document.body.classList.add('modal-open');
      } else {
        document.body.classList.remove('modal-open');
      }
    }
  }

  ngOnDestroy() {
    // Clean up modal-open class if component is destroyed while open
    document.body.classList.remove('modal-open');
  }

  private initializeMappings() {
    this.fieldMappings = this.csvHeaders.map(header => ({
      csvHeader: header,
      targetField: null
    }));
  }

  private preparePreviewData() {
    // Show first 3 data rows (excluding header)
    this.previewRows = this.csvData.slice(1, 4);
  }

  getSampleData(csvHeader: string): string {
    const headerIndex = this.csvHeaders.indexOf(csvHeader);
    if (headerIndex === -1 || this.previewRows.length === 0) return '';
    
    const sampleValue = this.previewRows[0]?.[headerIndex] || '';
    return sampleValue.length > 20 ? sampleValue.substring(0, 20) + '...' : sampleValue;
  }

  private normalizeHeader(h: string): string {
    // Lowercase, trim, replace non-alphanumerics with single space, collapse spaces
    return h
      .toLowerCase()
      .trim()
      .replace(/[_:.-]+/g, ' ') // unify common separators
      .replace(/[^\p{L}\p{N} ]+/gu, ' ') // strip other punctuation
      .replace(/\s+/g, ' ');
  }

  autoMapHeaders() {
    // Choose alias map: provided by consumer or default for customers
    const autoMappings: Record<string, string[]> = this.aliasMap || {
      name: ['name', 'nombre', 'first_name', 'firstname', 'first name', 'bill_to:first_name', 'bill to first name', 'billto:first_name'],
      surname: ['surname', 'last_name', 'lastname', 'last name', 'apellidos', 'bill_to:last_name', 'bill to last name', 'billto:last_name'],
      email: ['email', 'correo', 'e-mail', 'mail', 'bill_to:email', 'bill to email', 'billto:email'],
      phone: ['phone', 'telefono', 'teléfono', 'tel', 'mobile', 'movil', 'móvil', 'bill_to:phone', 'bill to phone', 'billto:phone'],
      dni: ['dni', 'nif', 'documento', 'id', 'legal', 'bill_to:legal', 'bill to legal', 'billto:legal'],
      address: ['address', 'direccion', 'dirección', 'domicilio', 'bill_to:address', 'bill to address', 'billto:address'],
      company: ['company', 'empresa', 'bill_to:company', 'bill to company', 'billto:company']
    };

    const normalizedAliases: Record<string, string[]> = {};
    for (const [field, aliases] of Object.entries(autoMappings)) {
      normalizedAliases[field] = aliases.map(a => this.normalizeHeader(a));
    }

    this.fieldMappings.forEach(mapping => {
      const normHeader = this.normalizeHeader(mapping.csvHeader);

      // 1) Try exact normalized match
      let matchedField: string | null = null;
      for (const [targetField, aliases] of Object.entries(normalizedAliases)) {
        if (aliases.includes(normHeader)) {
          matchedField = targetField;
          break;
        }
      }

      // 2) Fallback: contains match on tokens
      if (!matchedField) {
        for (const [targetField, aliases] of Object.entries(normalizedAliases)) {
          if (aliases.some(alias => normHeader.includes(alias) || alias.includes(normHeader))) {
            matchedField = targetField;
            break;
          }
        }
      }

      if (matchedField) {
        const alreadyMapped = this.fieldMappings.some(m => m !== mapping && m.targetField === matchedField);
        if (!alreadyMapped) mapping.targetField = matchedField;
      }
    });

    this.onMappingChange();
  }

  onMappingChange() {
    this.validateMappings();
  }

  private validateMappings() {
    const errors: string[] = [];
    const mappedFields = this.fieldMappings
      .filter(m => m.targetField)
      .map(m => m.targetField!);

    // Check required fields
    const requiredList = (this.requiredFields && this.requiredFields.length)
      ? this.requiredFields
      : this.defaultCustomerRequiredFields;
    requiredList.forEach(required => {
      if (!mappedFields.includes(required)) {
        // Find label in fieldOptions if provided, else fallback to generic
        let fieldName = required;
        if (this.fieldOptions) {
          const opt = this.fieldOptions.find(o => o.value === required);
          if (opt?.label) fieldName = opt.label.replace(/\s*\*?$/, '');
        } else {
          fieldName = required === 'surname' ? 'Apellidos' : required === 'name' ? 'Nombre' : required === 'email' ? 'Email' : required;
        }
        errors.push(`El campo obligatorio "${fieldName}" debe estar mapeado`);
      }
    });

    // Check for duplicate mappings
    const duplicates = mappedFields.filter((field, index) => 
      mappedFields.indexOf(field) !== index
    );
    
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      errors.push(`Los siguientes campos están mapeados múltiples veces: ${uniqueDuplicates.join(', ')}`);
    }

    this.validationErrors.set(errors);
  }

  isValidMapping(): boolean {
    return this.validationErrors().length === 0;
  }

  isRequiredField(targetField: string | null): boolean {
    return targetField ? this.requiredFields.includes(targetField) : false;
  }

  confirmMapping() {
    if (!this.isValidMapping()) return;

    const result: CsvMappingResult = {
      mappings: [...this.fieldMappings],
      isValid: true
    };

    this.mappingConfirmed.emit(result);
  }

  cancel() {
    this.cancelled.emit();
  }

  private refreshOptionLists() {
    // Build option lists from provided fieldOptions if any, else fallback to default customer fields
    const defaults = [
      { value: 'name', label: 'Nombre *', required: true },
      { value: 'surname', label: 'Apellidos *', required: true },
      { value: 'email', label: 'Email *', required: true },
      { value: 'phone', label: 'Teléfono' },
      { value: 'dni', label: 'DNI/NIF' },
      { value: 'address', label: 'Dirección' },
      { value: 'company', label: 'Empresa' },
      { value: 'notes', label: 'Notas' },
      { value: 'metadata', label: 'Metadata (otros datos)' }
    ];

    const opts = (this.fieldOptions && this.fieldOptions.length ? this.fieldOptions : defaults).map(o => ({
      value: o.value,
      label: o.label,
      required: !!(o.required || (this.requiredFields?.includes(o.value)))
    }));

    this.requiredOptionList = opts.filter(o => o.required).map(o => ({ value: o.value, label: o.label }));
    this.optionalOptionList = opts.filter(o => !o.required).map(o => ({ value: o.value, label: o.label }));
  }

  // Disable an option if it is already mapped in another row
  isFieldDisabled(fieldValue: string, rowIndex: number): boolean {
    if (!fieldValue) return false;
    // Allow keeping the same value for the current row (do not disable its current selection)
    const selectedElsewhere = this.fieldMappings.some((m, idx) => idx !== rowIndex && m.targetField === fieldValue);
    return selectedElsewhere;
  }
}