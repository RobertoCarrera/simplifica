const fs = require('fs');
const path = require('path');
const filePath = 'src/app/features/invoices/invoice-detail/invoice-detail.component.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Add import
if (!content.includes('ConfirmModalComponent')) {
  content = content.replace(
    "import { firstValueFrom } from 'rxjs';",
    "import { firstValueFrom } from 'rxjs';\nimport { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';\nimport { ViewChild } from '@angular/core';"
  );
}

// Add to imports array
content = content.replace(
  /imports: \[\s*CommonModule,\s*RouterModule,\s*FormsModule,\s*IssueVerifactuButtonComponent,\s*VerifactuBadgeComponent,\s*\]/,
  "imports: [\n    CommonModule,\n    RouterModule,\n    FormsModule,\n    IssueVerifactuButtonComponent,\n    VerifactuBadgeComponent,\n    ConfirmModalComponent,\n  ]"
);

// Add @ViewChild and modal to template
if (!content.includes('confirmModal')) {
  content = content.replace(
    "@if (invoice(); as inv) {",
    "@if (invoice(); as inv) {\n      <app-confirm-modal #confirmModal></app-confirm-modal>"
  );
  
  content = content.replace(
    "export class InvoiceDetailComponent implements OnInit {",
    "export class InvoiceDetailComponent implements OnInit {\n  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;"
  );
}

// Replace confirm calls
content = content.replace(
  /async cancelInvoice\(invoiceId: string\) \{[\s\S]*?if \(!confirm\('¿Anular esta factura\? Se enviará anulación a AEAT\.'\)\) return;/,
  `async cancelInvoice(invoiceId: string) {
    const confirmed = await this.confirmModal.open({
      title: 'Anular Factura',
      message: '¿Estás seguro de que deseas anular esta factura? Se enviará la solicitud de anulación a la AEAT y este proceso es irreversible.',
      icon: 'fas fa-exclamation-triangle',
      iconColor: 'red',
      confirmText: 'Anular Factura',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

content = content.replace(
  /async markAsPaid\(inv: Invoice\) \{[\s\S]*?if \(!confirm\('¿Marcar esta factura como pagada en local\/efectivo\?'\)\) return;/,
  `async markAsPaid(inv: Invoice) {
    const confirmed = await this.confirmModal.open({
      title: 'Marcar como Pagada',
      message: '¿Confirmas que esta factura ha sido pagada en local o efectivo?',
      icon: 'fas fa-check-circle',
      iconColor: 'green',
      confirmText: 'Confirmar Pago',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

fs.writeFileSync(filePath, content);
console.log('Invoice detail component patched with custom modal.');
