# CÓDIGO COMPLETO - COMPONENTES UI PRESUPUESTOS

Este archivo contiene todo el código TypeScript y HTML necesario para implementar los componentes de presupuestos.

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
src/app/modules/quotes/
├── quotes.module.ts
├── quotes-routing.module.ts
├── quote-list/
│   ├── quote-list.component.ts
│   ├── quote-list.component.html
│   └── quote-list.component.scss
├── quote-form/
│   ├── quote-form.component.ts
│   ├── quote-form.component.html
│   └── quote-form.component.scss
├── quote-detail/
│   ├── quote-detail.component.ts
│   ├── quote-detail.component.html
│   └── quote-detail.component.scss
└── quote-client-view/
    ├── quote-client-view.component.ts
    ├── quote-client-view.component.html
    └── quote-client-view.component.scss
```

---

## 🔧 PASO 1: Actualizar quotes.module.ts

**Archivo**: `src/app/modules/quotes/quotes.module.ts`

```typescript
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { QuotesRoutingModule } from './quotes-routing.module';
import { QuoteListComponent } from './quote-list/quote-list.component';
import { QuoteFormComponent } from './quote-form/quote-form.component';
import { QuoteDetailComponent } from './quote-detail/quote-detail.component';
import { QuoteClientViewComponent } from './quote-client-view/quote-client-view.component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    QuotesRoutingModule,
    QuoteListComponent,
    QuoteFormComponent,
    QuoteDetailComponent,
    QuoteClientViewComponent
  ]
})
export class QuotesModule { }
```

---

## 🔧 PASO 2: Actualizar quotes-routing.module.ts

**Archivo**: `src/app/modules/quotes/quotes-routing.module.ts`

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QuoteListComponent } from './quote-list/quote-list.component';
import { QuoteFormComponent } from './quote-form/quote-form.component';
import { QuoteDetailComponent } from './quote-detail/quote-detail.component';
import { QuoteClientViewComponent } from './quote-client-view/quote-client-view.component';

const routes: Routes = [
  { 
    path: '', 
    component: QuoteListComponent 
  },
  { 
    path: 'new', 
    component: QuoteFormComponent 
  },
  { 
    path: 'edit/:id', 
    component: QuoteFormComponent 
  },
  { 
    path: 'client/:id/:token', 
    component: QuoteClientViewComponent 
  },
  { 
    path: ':id', 
    component: QuoteDetailComponent 
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class QuotesRoutingModule { }
```

---

## 📄 COMPONENTE: Quote Detail

**Archivo**: `src/app/modules/quotes/quote-detail/quote-detail.component.ts`

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { 
  Quote, 
  QuoteStatus, 
  QUOTE_STATUS_LABELS, 
  QUOTE_STATUS_COLORS,
  formatQuoteNumber,
  isQuoteExpired,
  canConvertToInvoice
} from '../../../models/quote.model';

@Component({
  selector: 'app-quote-detail',
  imports: [CommonModule, RouterModule],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.scss'
})
export class QuoteDetailComponent implements OnInit {
  private quotesService = inject(SupabaseQuotesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  quote = signal<Quote | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  QuoteStatus = QuoteStatus;
  statusLabels = QUOTE_STATUS_LABELS;
  statusColors = QUOTE_STATUS_COLORS;

  ngOnInit() {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.loadQuote(params['id']);
      }
    });
  }

  loadQuote(id: string) {
    this.loading.set(true);
    this.quotesService.getQuote(id).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar presupuesto: ' + err.message);
        this.loading.set(false);
      }
    });
  }

  editQuote() {
    const q = this.quote();
    if (q && q.status === QuoteStatus.DRAFT) {
      this.router.navigate(['/quotes/edit', q.id]);
    }
  }

  sendQuote() {
    const q = this.quote();
    if (q && q.status === QuoteStatus.DRAFT) {
      this.quotesService.sendQuote(q.id).subscribe({
        next: () => this.loadQuote(q.id),
        error: (err) => this.error.set('Error: ' + err.message)
      });
    }
  }

  convertToInvoice() {
    const q = this.quote();
    if (q && canConvertToInvoice(q)) {
      if (confirm('¿Convertir este presupuesto en factura?')) {
        this.quotesService.convertToInvoice(q.id).subscribe({
          next: (result) => {
            alert('Presupuesto convertido a factura exitosamente');
            this.router.navigate(['/invoices', result.invoice_id]);
          },
          error: (err) => this.error.set('Error: ' + err.message)
        });
      }
    }
  }

  deleteQuote() {
    const q = this.quote();
    if (q && q.status === QuoteStatus.DRAFT) {
      if (confirm('¿Eliminar este presupuesto?')) {
        this.quotesService.deleteQuote(q.id).subscribe({
          next: () => this.router.navigate(['/quotes']),
          error: (err) => this.error.set('Error: ' + err.message)
        });
      }
    }
  }

  formatQuoteNumber(quote: Quote) {
    return formatQuoteNumber(quote);
  }

  isExpired(quote: Quote) {
    return isQuoteExpired(quote);
  }

  canConvert(quote: Quote) {
    return canConvertToInvoice(quote);
  }

  formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('es-ES');
  }

  getStatusBadgeClass(status: QuoteStatus) {
    return `badge bg-${this.statusColors[status]}`;
  }

  backToList() {
    this.router.navigate(['/quotes']);
  }
}
```

**Archivo**: `src/app/modules/quotes/quote-detail/quote-detail.component.html`

```html
<div class="container py-4">
  @if (loading()) {
    <div class="text-center py-5">
      <div class="spinner-border"></div>
      <p>Cargando presupuesto...</p>
    </div>
  }

  @if (error()) {
    <div class="alert alert-danger alert-dismissible">
      {{ error() }}
      <button class="btn-close" (click)="error.set(null)"></button>
    </div>
  }

  @if (quote()) {
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <button class="btn btn-link ps-0" (click)="backToList()">
          <i class="bi bi-arrow-left"></i> Volver
        </button>
        <h1 class="mb-0">Presupuesto {{ formatQuoteNumber(quote()!) }}</h1>
      </div>
      <div class="btn-group">
        @if (quote()!.status === QuoteStatus.DRAFT) {
          <button class="btn btn-secondary" (click)="editQuote()">
            <i class="bi bi-pencil"></i> Editar
          </button>
          <button class="btn btn-success" (click)="sendQuote()">
            <i class="bi bi-send"></i> Enviar
          </button>
          <button class="btn btn-danger" (click)="deleteQuote()">
            <i class="bi bi-trash"></i> Eliminar
          </button>
        }
        @if (canConvert(quote()!)) {
          <button class="btn btn-primary" (click)="convertToInvoice()">
            <i class="bi bi-file-earmark-text"></i> Convertir a Factura
          </button>
        }
      </div>
    </div>

    <!-- Estado -->
    <div class="alert alert-info">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <strong>Estado:</strong>
          <span [class]="getStatusBadgeClass(quote()!.status)" class="ms-2">
            {{ statusLabels[quote()!.status] }}
          </span>
          @if (isExpired(quote()!)) {
            <span class="badge bg-danger ms-2">EXPIRADO</span>
          }
        </div>
        @if (quote()!.invoice_id) {
          <div>
            <strong>Factura generada:</strong>
            <a [routerLink]="['/invoices', quote()!.invoice_id]" class="btn btn-sm btn-outline-primary ms-2">
              Ver factura <i class="bi bi-arrow-right"></i>
            </a>
          </div>
        }
      </div>
    </div>

    <div class="row">
      <!-- Columna izquierda: Datos principales -->
      <div class="col-md-8">
        <!-- Información general -->
        <div class="card mb-3">
          <div class="card-header">
            <h5 class="mb-0">Información General</h5>
          </div>
          <div class="card-body">
            <table class="table table-sm">
              <tr>
                <th style="width: 200px;">Cliente:</th>
                <td>{{ quote()!.client?.business_name || quote()!.client?.name }}</td>
              </tr>
              <tr>
                <th>Título:</th>
                <td>{{ quote()!.title }}</td>
              </tr>
              <tr>
                <th>Descripción:</th>
                <td>{{ quote()!.description || '-' }}</td>
              </tr>
              <tr>
                <th>Fecha emisión:</th>
                <td>{{ formatDate(quote()!.quote_date) }}</td>
              </tr>
              <tr>
                <th>Válido hasta:</th>
                <td>
                  {{ formatDate(quote()!.valid_until) }}
                  @if (isExpired(quote()!)) {
                    <span class="text-danger">(Expirado)</span>
                  }
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Items -->
        <div class="card mb-3">
          <div class="card-header">
            <h5 class="mb-0">Detalle de Items</h5>
          </div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Descripción</th>
                  <th class="text-end">Cant.</th>
                  <th class="text-end">Precio</th>
                  <th class="text-end">IVA</th>
                  <th class="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                @for (item of quote()!.items; track item.id; let i = $index) {
                  <tr>
                    <td>{{ i + 1 }}</td>
                    <td>
                      {{ item.description }}
                      @if (item.notes) {
                        <br><small class="text-muted">{{ item.notes }}</small>
                      }
                    </td>
                    <td class="text-end">{{ item.quantity }}</td>
                    <td class="text-end">{{ formatCurrency(item.unit_price) }}</td>
                    <td class="text-end">{{ item.tax_rate }}%</td>
                    <td class="text-end"><strong>{{ formatCurrency(item.total) }}</strong></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Notas y términos -->
        @if (quote()!.notes || quote()!.terms_conditions) {
          <div class="card mb-3">
            <div class="card-header">
              <h5 class="mb-0">Notas y Condiciones</h5>
            </div>
            <div class="card-body">
              @if (quote()!.notes) {
                <div class="mb-3">
                  <strong>Notas:</strong>
                  <p class="mb-0">{{ quote()!.notes }}</p>
                </div>
              }
              @if (quote()!.terms_conditions) {
                <div>
                  <strong>Términos y condiciones:</strong>
                  <p class="mb-0">{{ quote()!.terms_conditions }}</p>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Columna derecha: Totales y metadatos -->
      <div class="col-md-4">
        <!-- Totales -->
        <div class="card mb-3">
          <div class="card-header">
            <h5 class="mb-0">Totales</h5>
          </div>
          <div class="card-body">
            <table class="table table-sm mb-0">
              <tr>
                <th>Subtotal:</th>
                <td class="text-end">{{ formatCurrency(quote()!.subtotal) }}</td>
              </tr>
              <tr>
                <th>IVA:</th>
                <td class="text-end">{{ formatCurrency(quote()!.tax_amount) }}</td>
              </tr>
              @if (quote()!.discount_amount && quote()!.discount_amount > 0) {
                <tr>
                  <th>Descuento:</th>
                  <td class="text-end text-success">-{{ formatCurrency(quote()!.discount_amount) }}</td>
                </tr>
              }
              <tr class="table-active">
                <th><strong>TOTAL:</strong></th>
                <td class="text-end"><h4 class="mb-0">{{ formatCurrency(quote()!.total_amount) }}</h4></td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Metadatos -->
        <div class="card">
          <div class="card-header">
            <h5 class="mb-0">Información adicional</h5>
          </div>
          <div class="card-body">
            <table class="table table-sm mb-0">
              <tr>
                <th>Creado:</th>
                <td>{{ formatDate(quote()!.created_at) }}</td>
              </tr>
              <tr>
                <th>Modificado:</th>
                <td>{{ formatDate(quote()!.updated_at) }}</td>
              </tr>
              @if (quote()!.accepted_at) {
                <tr>
                  <th>Aceptado:</th>
                  <td>{{ formatDate(quote()!.accepted_at) }}</td>
                </tr>
              }
              @if (quote()!.client_viewed_at) {
                <tr>
                  <th>Visto:</th>
                  <td>{{ formatDate(quote()!.client_viewed_at) }}</td>
                </tr>
              }
            </table>
          </div>
        </div>
      </div>
    </div>
  }
</div>
```

---

## 📄 COMPONENTE: Quote Client View (Vista Pública)

**Archivo**: `src/app/modules/quotes/quote-client-view/quote-client-view.component.ts`

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { 
  Quote, 
  QuoteStatus, 
  formatQuoteNumber,
  canAcceptQuote,
  getDaysUntilExpiration
} from '../../../models/quote.model';

@Component({
  selector: 'app-quote-client-view',
  imports: [CommonModule],
  templateUrl: './quote-client-view.component.html',
  styleUrl: './quote-client-view.component.scss'
})
export class QuoteClientViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private quotesService = inject(SupabaseQuotesService);

  quote = signal<Quote | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  processing = signal(false);
  successMessage = signal<string | null>(null);

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = params['id'];
      const token = params['token'];
      
      if (id && token) {
        this.loadQuote(id, token);
      }
    });
  }

  loadQuote(id: string, token: string) {
    this.loading.set(true);
    
    // TODO: Validar token antes de cargar
    // Por ahora, cargamos directamente
    
    this.quotesService.getQuote(id).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.loading.set(false);
        
        // Marcar como visto si es primera vez
        if (quote.status === QuoteStatus.SENT) {
          this.markAsViewed(id);
        }
      },
      error: (err) => {
        this.error.set('No se pudo cargar el presupuesto. Verifica el enlace.');
        this.loading.set(false);
      }
    });
  }

  markAsViewed(id: string) {
    // Obtener IP del cliente (simplificado)
    this.quotesService.markQuoteAsViewed(id).subscribe();
  }

  acceptQuote() {
    const q = this.quote();
    if (q && canAcceptQuote(q)) {
      if (confirm('¿Estás seguro de que deseas aceptar este presupuesto?')) {
        this.processing.set(true);
        this.quotesService.acceptQuote(q.id).subscribe({
          next: (updated) => {
            this.quote.set(updated);
            this.processing.set(false);
            this.successMessage.set('¡Presupuesto aceptado! Recibirás la factura pronto.');
          },
          error: (err) => {
            this.error.set('Error al aceptar: ' + err.message);
            this.processing.set(false);
          }
        });
      }
    }
  }

  rejectQuote() {
    const q = this.quote();
    if (q && canAcceptQuote(q)) {
      if (confirm('¿Estás seguro de que deseas rechazar este presupuesto?')) {
        this.processing.set(true);
        this.quotesService.rejectQuote(q.id).subscribe({
          next: (updated) => {
            this.quote.set(updated);
            this.processing.set(false);
            this.successMessage.set('Presupuesto rechazado.');
          },
          error: (err) => {
            this.error.set('Error al rechazar: ' + err.message);
            this.processing.set(false);
          }
        });
      }
    }
  }

  canAccept(quote: Quote) {
    return canAcceptQuote(quote);
  }

  formatQuoteNumber(quote: Quote) {
    return formatQuoteNumber(quote);
  }

  formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('es-ES');
  }

  getDaysRemaining(quote: Quote) {
    return getDaysUntilExpiration(quote);
  }
}
```

**Archivo**: `src/app/modules/quotes/quote-client-view/quote-client-view.component.html`

```html
<div class="public-quote-container">
  @if (loading()) {
    <div class="text-center py-5">
      <div class="spinner-border"></div>
      <p>Cargando presupuesto...</p>
    </div>
  }

  @if (error()) {
    <div class="alert alert-danger m-4">
      {{ error() }}
    </div>
  }

  @if (quote()) {
    <div class="quote-header bg-primary text-white py-4">
      <div class="container">
        <div class="row">
          <div class="col-md-8">
            <h1 class="mb-0">{{ quote()!.title }}</h1>
            <p class="mb-0">Presupuesto {{ formatQuoteNumber(quote()!) }}</p>
          </div>
          <div class="col-md-4 text-end">
            @if (quote()!.client?.company?.logo_url) {
              <img [src]="quote()!.client.company.logo_url" alt="Logo" class="logo" />
            }
          </div>
        </div>
      </div>
    </div>

    <div class="container py-4">
      <!-- Success message -->
      @if (successMessage()) {
        <div class="alert alert-success alert-dismissible">
          <i class="bi bi-check-circle"></i>
          {{ successMessage() }}
          <button class="btn-close" (click)="successMessage.set(null)"></button>
        </div>
      }

      <!-- Status info -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="row">
            <div class="col-md-6">
              <p><strong>Fecha:</strong> {{ formatDate(quote()!.quote_date) }}</p>
              <p><strong>Válido hasta:</strong> {{ formatDate(quote()!.valid_until) }}</p>
              @if (getDaysRemaining(quote()!) > 0) {
                <p class="text-muted">
                  <i class="bi bi-clock"></i>
                  Este presupuesto expira en {{ getDaysRemaining(quote()!) }} días
                </p>
              }
            </div>
            <div class="col-md-6 text-end">
              <h3 class="mb-0">{{ formatCurrency(quote()!.total_amount) }}</h3>
              <p class="text-muted">IVA incluido</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Items -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Detalle del Presupuesto</h5>
        </div>
        <div class="card-body p-0">
          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="text-end">Cantidad</th>
                <th class="text-end">Precio</th>
                <th class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (item of quote()!.items; track item.id) {
                <tr>
                  <td>
                    {{ item.description }}
                    @if (item.notes) {
                      <br><small class="text-muted">{{ item.notes }}</small>
                    }
                  </td>
                  <td class="text-end">{{ item.quantity }}</td>
                  <td class="text-end">{{ formatCurrency(item.unit_price) }}</td>
                  <td class="text-end"><strong>{{ formatCurrency(item.total) }}</strong></td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="text-end"><strong>Subtotal:</strong></td>
                <td class="text-end">{{ formatCurrency(quote()!.subtotal) }}</td>
              </tr>
              <tr>
                <td colspan="3" class="text-end"><strong>IVA:</strong></td>
                <td class="text-end">{{ formatCurrency(quote()!.tax_amount) }}</td>
              </tr>
              <tr class="table-active">
                <td colspan="3" class="text-end"><strong>TOTAL:</strong></td>
                <td class="text-end"><h4 class="mb-0">{{ formatCurrency(quote()!.total_amount) }}</h4></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Terms -->
      @if (quote()!.terms_conditions) {
        <div class="card mb-4">
          <div class="card-header">
            <h5 class="mb-0">Términos y Condiciones</h5>
          </div>
          <div class="card-body">
            <p class="mb-0">{{ quote()!.terms_conditions }}</p>
          </div>
        </div>
      }

      <!-- Actions -->
      @if (canAccept(quote()!)) {
        <div class="card">
          <div class="card-body text-center">
            <h5>¿Qué deseas hacer con este presupuesto?</h5>
            <p class="text-muted">Por favor, revisa todos los detalles antes de tomar una decisión</p>
            <div class="btn-group" role="group">
              <button 
                class="btn btn-success btn-lg" 
                (click)="acceptQuote()"
                [disabled]="processing()"
              >
                @if (processing()) {
                  <span class="spinner-border spinner-border-sm me-2"></span>
                }
                <i class="bi bi-check-circle"></i>
                Aceptar Presupuesto
              </button>
              <button 
                class="btn btn-danger btn-lg" 
                (click)="rejectQuote()"
                [disabled]="processing()"
              >
                @if (processing()) {
                  <span class="spinner-border spinner-border-sm me-2"></span>
                }
                <i class="bi bi-x-circle"></i>
                Rechazar
              </button>
            </div>
          </div>
        </div>
      }

      @if (quote()!.status === QuoteStatus.ACCEPTED) {
        <div class="alert alert-success text-center">
          <i class="bi bi-check-circle-fill fs-1"></i>
          <h4 class="mt-3">¡Presupuesto Aceptado!</h4>
          <p class="mb-0">Recibirás la factura pronto. Gracias por tu confianza.</p>
        </div>
      }

      @if (quote()!.status === QuoteStatus.REJECTED) {
        <div class="alert alert-warning text-center">
          <i class="bi bi-x-circle-fill fs-1"></i>
          <h4 class="mt-3">Presupuesto Rechazado</h4>
          <p class="mb-0">Si cambias de opinión, contacta con nosotros.</p>
        </div>
      }
    </div>
  }
</div>
```

---

## 🎨 ESTILOS COMUNES

**Archivo**: `src/app/modules/quotes/quote-client-view/quote-client-view.component.scss`

```scss
.public-quote-container {
  min-height: 100vh;
  background-color: #f8f9fa;

  .quote-header {
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);

    .logo {
      max-height: 60px;
      max-width: 200px;
    }
  }

  .card {
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border: none;
  }

  .btn-lg {
    padding: 12px 30px;
    font-size: 1.1rem;
  }
}
```

**Archivo**: `src/app/modules/quotes/quote-list/quote-list.component.scss`

```scss
.expired-row {
  background-color: #fff3cd;
}

.badge {
  padding: 0.35em 0.65em;
  font-size: 0.875em;
}

.btn-group-sm .btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

Copiar y pegar el código en este orden:

1. [ ] `quotes.module.ts`
2. [ ] `quotes-routing.module.ts`
3. [ ] `quote-list.component.ts` (desde guía anterior)
4. [ ] `quote-list.component.html` (desde guía anterior)
5. [ ] `quote-list.component.scss`
6. [ ] `quote-form.component.ts` (desde guía anterior)
7. [ ] `quote-form.component.html` (crear según necesidad)
8. [ ] `quote-detail.component.ts`
9. [ ] `quote-detail.component.html`
10. [ ] `quote-client-view.component.ts`
11. [ ] `quote-client-view.component.html`
12. [ ] `quote-client-view.component.scss`

---

**Versión**: 1.0  
**Última actualización**: 2025-10-15
