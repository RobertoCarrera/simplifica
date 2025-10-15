# SISTEMA DE PRESUPUESTOS - IMPLEMENTACIÓN COMPLETA

## 📋 RESUMEN EJECUTIVO

Sistema completo de gestión de presupuestos con:
- ✅ **Base de datos SQL** con 3 tablas (quotes, quote_items, quote_templates)
- ✅ **Modelos TypeScript** con interfaces y utilidades
- ✅ **Servicio Angular** con 25+ métodos
- ✅ **Componentes UI** generados (pendiente código)
- ✅ **Conversión automática a facturas** compatible con Veri*Factu
- ✅ **Vista pública para clientes** (aceptar/rechazar)
- ✅ **GDPR compliance** (anonimización automática)

---

## 🗂️ ARCHIVOS CREADOS

### 1. Base de Datos
- **Archivo**: `supabase/migrations/20251015_quotes_system.sql` ✅ CREADO
- **Contenido**: 
  - 3 tablas (quotes, quote_items, quote_templates)
  - 1 enum (quote_status)
  - 12 RLS policies
  - 8 funciones (numeración, cálculos, conversión a factura, expiración)
  - 9 triggers automáticos

### 2. Modelos TypeScript
- **Archivo**: `src/app/models/quote.model.ts` ✅ CREADO
- **Contenido**:
  - 8 interfaces (Quote, QuoteItem, QuoteTemplate, DTOs)
  - 1 enum (QuoteStatus)
  - 10 funciones utilidad
  - Diccionarios de labels y colores

### 3. Servicio Angular
- **Archivo**: `src/app/services/supabase-quotes.service.ts` ✅ CREADO
- **Métodos**: 28 métodos totales
  - CRUD presupuestos (get, create, update, delete)
  - CRUD items (add, update, delete)
  - Acciones (send, accept, reject, convert)
  - Plantillas (get, create from template)
  - Estadísticas

### 4. Componentes Angular
- **Módulo**: `src/app/modules/quotes/` ✅ CREADO
- **Componentes generados**:
  - `quote-list/` - Lista de presupuestos
  - `quote-form/` - Formulario crear/editar
  - `quote-detail/` - Detalle completo
  - `quote-client-view/` - Vista pública para clientes

---

## 🚀 PASOS DE IMPLEMENTACIÓN

### PASO 1: Ejecutar migración SQL ✅ PENDIENTE

```bash
# 1. Abrir Supabase Dashboard
# 2. Ir a SQL Editor
# 3. Copiar contenido de: supabase/migrations/20251015_quotes_system.sql
# 4. Ejecutar
# 5. Verificar tablas creadas
```

**Verificación**:
```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE 'quote%';
-- Debe mostrar: quotes, quote_items, quote_templates
```

### PASO 2: Implementar componentes UI ⏳ PENDIENTE

#### A. Quote List Component

**Archivo**: `src/app/modules/quotes/quote-list/quote-list.component.ts`

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import {
  Quote,
  QuoteStatus,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_COLORS,
  QuoteFilters,
  formatQuoteNumber,
  isQuoteExpired,
  getDaysUntilExpiration
} from '../../../models/quote.model';

@Component({
  selector: 'app-quote-list',
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.scss'
})
export class QuoteListComponent implements OnInit {
  private quotesService = inject(SupabaseQuotesService);
  private router = inject(Router);

  // Signals
  quotes = signal<Quote[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  totalCount = signal(0);
  searchTerm = signal('');
  selectedStatus = signal<QuoteStatus | 'all'>('all');

  // Paginación
  currentPage = signal(1);
  pageSize = 50;

  // UI
  QuoteStatus = QuoteStatus;
  statusLabels = QUOTE_STATUS_LABELS;
  statusColors = QUOTE_STATUS_COLORS;
  Math = Math;

  ngOnInit() {
    this.loadQuotes();
  }

  loadQuotes() {
    this.loading.set(true);
    const filters: QuoteFilters = {};
    
    if (this.searchTerm()) filters.search = this.searchTerm();
    if (this.selectedStatus() !== 'all') filters.status = this.selectedStatus() as QuoteStatus;

    this.quotesService.getQuotes(filters, { field: 'quote_date', direction: 'desc' }, this.currentPage(), this.pageSize)
      .subscribe({
        next: (result) => {
          this.quotes.set(result.data);
          this.totalCount.set(result.count);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Error: ' + err.message);
          this.loading.set(false);
        }
      });
  }

  createQuote() { this.router.navigate(['/quotes/new']); }
  viewQuote(quote: Quote) { this.router.navigate(['/quotes', quote.id]); }
  
  sendQuote(quote: Quote) {
    this.quotesService.sendQuote(quote.id).subscribe(() => this.loadQuotes());
  }

  convertToInvoice(quote: Quote) {
    if (confirm('¿Convertir a factura?')) {
      this.quotesService.convertToInvoice(quote.id).subscribe({
        next: (result) => this.router.navigate(['/invoices', result.invoice_id]),
        error: (err) => this.error.set('Error: ' + err.message)
      });
    }
  }

  deleteQuote(quote: Quote) {
    if (confirm('¿Eliminar presupuesto?')) {
      this.quotesService.deleteQuote(quote.id).subscribe(() => this.loadQuotes());
    }
  }

  formatQuoteNumber = formatQuoteNumber;
  isExpired = isQuoteExpired;
  getDaysRemaining = getDaysUntilExpiration;

  formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('es-ES');
  }

  getStatusBadgeClass(status: QuoteStatus) {
    return `badge badge-${this.statusColors[status]}`;
  }

  canConvert(quote: Quote) { return quote.status === QuoteStatus.ACCEPTED && !quote.invoice_id; }
  canEdit(quote: Quote) { return quote.status === QuoteStatus.DRAFT; }
  canSend(quote: Quote) { return quote.status === QuoteStatus.DRAFT; }
  canDelete(quote: Quote) { return quote.status === QuoteStatus.DRAFT; }
}
```

**Archivo**: `src/app/modules/quotes/quote-list/quote-list.component.html`

```html
<div class="container py-4">
  <div class="d-flex justify-content-between align-items-center mb-4">
    <h1><i class="bi bi-file-text"></i> Presupuestos</h1>
    <button class="btn btn-primary" (click)="createQuote()">
      <i class="bi bi-plus"></i> Nuevo Presupuesto
    </button>
  </div>

  <!-- Filtros -->
  <div class="card mb-4">
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-6">
          <input type="text" class="form-control" placeholder="Buscar..." 
            [(ngModel)]="searchTerm" (keyup.enter)="loadQuotes()" />
        </div>
        <div class="col-md-4">
          <select class="form-select" [(ngModel)]="selectedStatus" (change)="loadQuotes()">
            <option value="all">Todos los estados</option>
            @for (status of Object.keys(QuoteStatus); track status) {
              <option [value]="QuoteStatus[status]">{{ statusLabels[QuoteStatus[status]] }}</option>
            }
          </select>
        </div>
        <div class="col-md-2">
          <button class="btn btn-secondary w-100" (click)="loadQuotes()">
            <i class="bi bi-search"></i> Buscar
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Error -->
  @if (error()) {
    <div class="alert alert-danger alert-dismissible">
      {{ error() }}
      <button class="btn-close" (click)="error.set(null)"></button>
    </div>
  }

  <!-- Loading -->
  @if (loading()) {
    <div class="text-center py-5">
      <div class="spinner-border"></div>
      <p>Cargando...</p>
    </div>
  }

  <!-- Tabla -->
  @if (!loading() && quotes().length > 0) {
    <div class="table-responsive">
      <table class="table table-hover">
        <thead>
          <tr>
            <th>Número</th>
            <th>Cliente</th>
            <th>Título</th>
            <th>Fecha</th>
            <th>Válido hasta</th>
            <th>Estado</th>
            <th class="text-end">Total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          @for (quote of quotes(); track quote.id) {
            <tr [class.table-warning]="isExpired(quote)">
              <td><strong>{{ formatQuoteNumber(quote) }}</strong></td>
              <td>{{ quote.client?.business_name || quote.client?.name }}</td>
              <td>{{ quote.title }}</td>
              <td>{{ formatDate(quote.quote_date) }}</td>
              <td>
                {{ formatDate(quote.valid_until) }}
                @if (getDaysRemaining(quote) > 0 && getDaysRemaining(quote) <= 7) {
                  <small class="text-warning">({{ getDaysRemaining(quote) }}d)</small>
                }
                @if (isExpired(quote)) {
                  <span class="badge bg-danger">EXPIRADO</span>
                }
              </td>
              <td>
                <span [class]="getStatusBadgeClass(quote.status)">
                  {{ statusLabels[quote.status] }}
                </span>
              </td>
              <td class="text-end"><strong>{{ formatCurrency(quote.total_amount) }}</strong></td>
              <td>
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" (click)="viewQuote(quote)" title="Ver">
                    <i class="bi bi-eye"></i>
                  </button>
                  @if (canSend(quote)) {
                    <button class="btn btn-outline-success" (click)="sendQuote(quote)" title="Enviar">
                      <i class="bi bi-send"></i>
                    </button>
                  }
                  @if (canConvert(quote)) {
                    <button class="btn btn-outline-info" (click)="convertToInvoice(quote)" title="Convertir a factura">
                      <i class="bi bi-file-earmark-text"></i>
                    </button>
                  }
                  @if (canDelete(quote)) {
                    <button class="btn btn-outline-danger" (click)="deleteQuote(quote)" title="Eliminar">
                      <i class="bi bi-trash"></i>
                    </button>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="d-flex justify-content-between align-items-center mt-3">
      <div>
        Mostrando {{ (currentPage() - 1) * pageSize + 1 }} - 
        {{ Math.min(currentPage() * pageSize, totalCount()) }} de {{ totalCount() }}
      </div>
      <div class="btn-group">
        <button class="btn btn-outline-secondary" [disabled]="currentPage() === 1" 
          (click)="currentPage.set(currentPage() - 1); loadQuotes()">
          <i class="bi bi-chevron-left"></i> Anterior
        </button>
        <button class="btn btn-outline-secondary" [disabled]="currentPage() * pageSize >= totalCount()"
          (click)="currentPage.set(currentPage() + 1); loadQuotes()">
          Siguiente <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  }

  <!-- Empty state -->
  @if (!loading() && quotes().length === 0) {
    <div class="text-center py-5">
      <i class="bi bi-file-text" style="font-size: 4rem; opacity: 0.3;"></i>
      <h3 class="mt-3">No hay presupuestos</h3>
      <p class="text-muted">Crea tu primer presupuesto</p>
      <button class="btn btn-primary" (click)="createQuote()">
        <i class="bi bi-plus"></i> Crear Presupuesto
      </button>
    </div>
  }
</div>
```

#### B. Quote Form Component (Crear/Editar)

**Archivo**: `src/app/modules/quotes/quote-form/quote-form.component.ts`

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseClientsService } from '../../../services/supabase-clients.service';
import { CreateQuoteDTO, CreateQuoteItemDTO, getDefaultValidUntil } from '../../../models/quote.model';

@Component({
  selector: 'app-quote-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './quote-form.component.html',
  styleUrl: './quote-form.component.scss'
})
export class QuoteFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private quotesService = inject(SupabaseQuotesService);
  private clientsService = inject(SupabaseClientsService);

  quoteForm!: FormGroup;
  loading = signal(false);
  error = signal<string | null>(null);
  clients = signal<any[]>([]);
  isEditMode = signal(false);
  quoteId = signal<string | null>(null);

  ngOnInit() {
    this.initForm();
    this.loadClients();
    
    // Check if edit mode
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode.set(true);
        this.quoteId.set(params['id']);
        this.loadQuote(params['id']);
      }
    });
  }

  initForm() {
    const today = new Date().toISOString().split('T')[0];
    const validUntil = getDefaultValidUntil();

    this.quoteForm = this.fb.group({
      client_id: ['', Validators.required],
      title: ['', Validators.required],
      description: [''],
      notes: [''],
      terms_conditions: ['Este presupuesto es válido por 30 días. Precios incluyen IVA.'],
      quote_date: [today, Validators.required],
      valid_until: [validUntil, Validators.required],
      items: this.fb.array([])
    });

    // Add one default item
    this.addItem();
  }

  get items(): FormArray {
    return this.quoteForm.get('items') as FormArray;
  }

  addItem() {
    const itemForm = this.fb.group({
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      tax_rate: [21, [Validators.required, Validators.min(0)]],
      discount_percent: [0, [Validators.min(0), Validators.max(100)]],
      notes: ['']
    });

    this.items.push(itemForm);
  }

  removeItem(index: number) {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  loadClients() {
    this.clientsService.getClients().subscribe({
      next: (result) => this.clients.set(result.data),
      error: (err) => this.error.set('Error al cargar clientes: ' + err.message)
    });
  }

  loadQuote(id: string) {
    this.quotesService.getQuote(id).subscribe({
      next: (quote) => {
        this.quoteForm.patchValue({
          client_id: quote.client_id,
          title: quote.title,
          description: quote.description,
          notes: quote.notes,
          terms_conditions: quote.terms_conditions,
          quote_date: quote.quote_date,
          valid_until: quote.valid_until
        });

        // Load items
        this.items.clear();
        quote.items?.forEach(item => {
          const itemForm = this.fb.group({
            description: [item.description, Validators.required],
            quantity: [item.quantity, Validators.required],
            unit_price: [item.unit_price, Validators.required],
            tax_rate: [item.tax_rate, Validators.required],
            discount_percent: [item.discount_percent || 0],
            notes: [item.notes || '']
          });
          this.items.push(itemForm);
        });
      },
      error: (err) => this.error.set('Error al cargar presupuesto: ' + err.message)
    });
  }

  calculateItemTotal(item: any): number {
    const qty = item.get('quantity')?.value || 0;
    const price = item.get('unit_price')?.value || 0;
    const discount = item.get('discount_percent')?.value || 0;
    const tax = item.get('tax_rate')?.value || 0;

    let subtotal = qty * price;
    subtotal -= subtotal * (discount / 100);
    const taxAmount = subtotal * (tax / 100);
    return subtotal + taxAmount;
  }

  calculateTotal(): number {
    let total = 0;
    this.items.controls.forEach(item => {
      total += this.calculateItemTotal(item);
    });
    return total;
  }

  onSubmit() {
    if (this.quoteForm.valid) {
      this.loading.set(true);
      this.error.set(null);

      const formValue = this.quoteForm.value;
      const dto: CreateQuoteDTO = {
        ...formValue,
        items: formValue.items as CreateQuoteItemDTO[]
      };

      this.quotesService.createQuote(dto).subscribe({
        next: (quote) => {
          this.router.navigate(['/quotes', quote.id]);
        },
        error: (err) => {
          this.error.set('Error al guardar: ' + err.message);
          this.loading.set(false);
        }
      });
    }
  }

  cancel() {
    this.router.navigate(['/quotes']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }
}
```

### PASO 3: Configurar routing

**Archivo**: `src/app/modules/quotes/quotes-routing.module.ts`

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QuoteListComponent } from './quote-list/quote-list.component';
import { QuoteFormComponent } from './quote-form/quote-form.component';
import { QuoteDetailComponent } from './quote-detail/quote-detail.component';
import { QuoteClientViewComponent } from './quote-client-view/quote-client-view.component';

const routes: Routes = [
  { path: '', component: QuoteListComponent },
  { path: 'new', component: QuoteFormComponent },
  { path: 'edit/:id', component: QuoteFormComponent },
  { path: ':id', component: QuoteDetailComponent },
  { path: 'client/:id/:token', component: QuoteClientViewComponent } // Vista pública
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class QuotesRoutingModule { }
```

### PASO 4: Añadir al app routing

**Archivo**: Editar `src/app/app.routes.ts`

```typescript
// Añadir esta ruta
{
  path: 'quotes',
  loadChildren: () => import('./modules/quotes/quotes.module').then(m => m.QuotesModule)
}
```

---

## 🔄 FLUJO DE CONVERSIÓN A FACTURA

### Proceso según Veri*Factu

1. **Cliente acepta presupuesto** → `QuoteStatus.ACCEPTED`
2. **Usuario convierte a factura** → Se llama `convertToInvoice()`
3. **Función SQL ejecuta**:
   - Crea nueva factura con datos del presupuesto
   - Copia todos los items con precios/cantidades
   - Marca presupuesto como `INVOICED`
   - Guarda referencia `invoice_id` en presupuesto
4. **Factura entra en ciclo Veri*Factu**:
   - Se genera hash SHA-256 (trigger automático)
   - Se añade a blockchain de facturas
   - Se puede generar QR y XML
   - Pendiente firma digital cuando llegue certificado

### Compatibilidad Veri*Factu

✅ **Presupuestos NO son registrables en Veri*Factu** (no son facturas)
✅ **Solo las facturas** generadas desde presupuestos aceptados se registran
✅ **La conversión** mantiene trazabilidad completa
✅ **Cumple normativa**: Presupuesto → Aceptación → Factura → Veri*Factu

---

## 📊 FUNCIONALIDADES CLAVE

### 1. Numeración Automática
- Formato: `2025-Q-00001`
- Secuencia por año y empresa
- Función SQL: `get_next_quote_number()`

### 2. Cálculos Automáticos
- Subtotales por item
- Descuentos por línea
- IVA configurable
- Total automático
- Triggers: `calculate_quote_item_totals()`, `calculate_quote_totals()`

### 3. Estados del Ciclo de Vida
1. **DRAFT** → Borrador editable
2. **SENT** → Enviado al cliente
3. **VIEWED** → Cliente lo vio (tracking)
4. **ACCEPTED** → Cliente aceptó (puede convertir)
5. **REJECTED** → Cliente rechazó
6. **EXPIRED** → Pasó `valid_until` (auto)
7. **INVOICED** → Convertido a factura
8. **CANCELLED** → Cancelado manualmente

### 4. Expiración Automática
- Job diario: `mark_expired_quotes()`
- Cambia `DRAFT/SENT/VIEWED` → `EXPIRED`
- Solo si `valid_until < CURRENT_DATE`

### 5. Seguimiento de Cliente
Cuando el cliente ve el presupuesto:
```typescript
markQuoteAsViewed(id, ipAddress, userAgent)
```
Guarda:
- `client_viewed_at`
- `client_ip_address`
- `client_user_agent`

### 6. GDPR Compliance
- **Retención**: 7 años desde `quote_date`
- **Anonimización automática**: Trigger `anonymize_quote_data()`
- **Campos anonimizados**:
  - description → `[ANONIMIZADO]`
  - notes → NULL
  - client_ip_address → NULL
  - digital_signature → NULL

---

## 🎨 COMPONENTES UI - RESUMEN

### Quote List (Lista)
- ✅ Tabla con filtros (estado, búsqueda)
- ✅ Badges de estado con colores
- ✅ Indicador de expiración
- ✅ Acciones contextuales (enviar, convertir, eliminar)
- ✅ Paginación

### Quote Form (Formulario)
- ✅ Selector de cliente
- ✅ Fechas (emisión, validez)
- ✅ Items dinámicos (añadir/eliminar)
- ✅ Cálculo en tiempo real de totales
- ✅ Descuentos por línea
- ✅ IVA configurable

### Quote Detail (Detalle)
- ⏳ Vista completa del presupuesto
- ⏳ Histórico de cambios de estado
- ⏳ Botón "Convertir a Factura"
- ⏳ Generar PDF
- ⏳ Enviar por email

### Quote Client View (Vista Pública)
- ⏳ URL pública sin login: `/quotes/client/:id/:token`
- ⏳ Botones: Aceptar / Rechazar
- ⏳ Tracking automático de visualización
- ⏳ Logo y datos de la empresa
- ⏳ Branding personalizable

---

## 📝 TAREAS PENDIENTES

### Prioridad ALTA
- [ ] **Copiar código de componentes** desde esta guía
- [ ] **Ejecutar migración SQL** en Supabase
- [ ] **Probar crear presupuesto** básico
- [ ] **Probar conversión a factura**

### Prioridad MEDIA
- [ ] Implementar generación de PDF
- [ ] Sistema de envío de emails
- [ ] Plantillas personalizables
- [ ] Dashboard de estadísticas

### Prioridad BAJA
- [ ] Firma digital de presupuestos
- [ ] Versioning de presupuestos
- [ ] Comparador de presupuestos
- [ ] Exportar a Excel/CSV

---

## 🔧 COMANDOS ÚTILES

```bash
# Generar servicios/componentes adicionales
ng generate service services/quote-pdf
ng generate component modules/quotes/quote-stats

# Instalar dependencias si se necesitan
npm install jspdf html2canvas  # Para PDFs
npm install @sendgrid/mail     # Para emails
```

---

## 📚 DOCUMENTACIÓN RELACIONADA

1. **FACTURACION_PLAN_COMPLETO.md** - Sistema de facturación
2. **FACTURACION_GDPR_COMPLIANCE.md** - Compliance legal
3. **VERIFACTU_INTEGRATION.md** - Integración Veri*Factu

---

## ✅ CHECKLIST FINAL

- [x] Migración SQL creada
- [x] Modelos TypeScript creados
- [x] Servicio Angular creado
- [ ] Componentes UI implementados
- [ ] Routing configurado
- [ ] SQL ejecutado en Supabase
- [ ] Pruebas básicas realizadas
- [ ] Conversión a factura probada
- [ ] Documentación completa

---

**Fecha**: 2025-10-15  
**Versión**: 1.0  
**Estado**: 🚧 Backend completo, UI pendiente implementación

