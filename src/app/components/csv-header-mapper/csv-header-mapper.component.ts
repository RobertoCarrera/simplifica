import { Component, OnInit, OnChanges, Input, Output, EventEmitter, signal, SimpleChanges } from '@angular/core';
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
      <div class="modal-overlay" (click)="cancel()"></div>
      <div class="modal-content">
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
              Asigna cada columna del CSV a un campo del cliente. Los campos marcados con * son obligatorios.
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
                    <optgroup label="Campos Obligatorios">
                      <option value="name">Nombre *</option>
                      <option value="surname">Apellidos *</option>
                      <option value="email">Email *</option>
                    </optgroup>
                    <optgroup label="Campos Opcionales">
                      <option value="phone">Teléfono</option>
                      <option value="dni">DNI/NIF</option>
                      <option value="address">Dirección</option>
                      <option value="company">Empresa</option>
                      <option value="notes">Notas</option>
                      <option value="metadata">Metadata (otros datos)</option>
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
  `,
  styleUrls: ['./csv-header-mapper.component.scss']
})
export class CsvHeaderMapperComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() csvHeaders: string[] = [];
  @Input() csvData: string[][] = [];
  
  @Output() mappingConfirmed = new EventEmitter<CsvMappingResult>();
  @Output() cancelled = new EventEmitter<void>();

  fieldMappings: FieldMapping[] = [];
  previewRows: string[][] = [];
  validationErrors = signal<string[]>([]);

  private requiredFields = ['name', 'surname', 'email'];

  ngOnInit() {
    this.initializeMappings();
    this.preparePreviewData();
    this.autoMapHeaders();
  }

  ngOnChanges(changes: SimpleChanges) {
    // If headers or data change after init, rebuild mappings and preview
    if ((changes['csvHeaders'] && !changes['csvHeaders'].firstChange) ||
        (changes['csvData'] && !changes['csvData'].firstChange)) {
      this.initializeMappings();
      this.preparePreviewData();
      this.autoMapHeaders();
    }
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
    // Aliases list expanded and normalized variants included
    const autoMappings: Record<string, string[]> = {
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
    this.requiredFields.forEach(required => {
      if (!mappedFields.includes(required)) {
        const fieldName = required === 'surname' ? 'Apellidos' : 
                         required === 'name' ? 'Nombre' : 'Email';
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
}