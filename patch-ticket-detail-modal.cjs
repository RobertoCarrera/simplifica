const fs = require('fs');
const path = require('path');
const filePath = 'src/app/features/tickets/detail/ticket-detail.component.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Add import
if (!content.includes('ConfirmModalComponent')) {
  content = content.replace(
    "import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';",
    "import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';\nimport { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';"
  );
}

// Add to imports array
content = content.replace(
  /imports: \[\s*CommonModule,\s*FormsModule,\s*ClientDevicesModalComponent,\s*SkeletonLoaderComponent,\s*TagManagerComponent,\s*\]/,
  "imports: [\n    CommonModule,\n    FormsModule,\n    ClientDevicesModalComponent,\n    SkeletonLoaderComponent,\n    TagManagerComponent,\n    ConfirmModalComponent,\n  ]"
);

// Add modal to template
if (!content.includes('confirmModal')) {
  content = content.replace(
    '<div class="min-h-0 bg-gray-50 dark:bg-gray-900">',
    '<app-confirm-modal #confirmModal></app-confirm-modal>\n    <div class="min-h-0 bg-gray-50 dark:bg-gray-900">'
  );
  
  // ViewChild is already imported in this file
  content = content.replace(
    "@ViewChild('tagManager') tagManager?: TagManagerComponent;",
    "@ViewChild('tagManager') tagManager?: TagManagerComponent;\n  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;"
  );
}

// Replace confirm calls
content = content.replace(
  /async deleteComment\(comment: TicketComment\) \{[\s\S]*?if \(!confirm\('¿Estás seguro de eliminar este comentario\?'\)\) return;/,
  `async deleteComment(comment: TicketComment) {
    const confirmed = await this.confirmModal.open({
      title: 'Eliminar Comentario',
      message: '¿Estás seguro de que deseas eliminar este comentario? Esta acción no se puede deshacer.',
      icon: 'fas fa-trash-alt',
      iconColor: 'red',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

content = content.replace(
  /async markAsResolved\(\) \{[\s\S]*?if \(!confirm\('¿Estás seguro de que quieres marcar este ticket como solucionado\?'\)\) return;/,
  `async markAsResolved() {
    const confirmed = await this.confirmModal.open({
      title: 'Resolver Ticket',
      message: '¿Quieres marcar este ticket como solucionado?',
      icon: 'fas fa-check-circle',
      iconColor: 'green',
      confirmText: 'Marcar Solucionado',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

content = content.replace(
  /async deleteTicket\(\) \{[\s\S]*?if \(!confirm\('¿Estás seguro de que deseas eliminar este ticket\?'\)\) return;/,
  `async deleteTicket() {
    const confirmed = await this.confirmModal.open({
      title: 'Eliminar Ticket',
      message: '¿Estás seguro de que deseas eliminar este ticket permanentemente?',
      icon: 'fas fa-trash-alt',
      iconColor: 'red',
      confirmText: 'Eliminar Ticket',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

content = content.replace(
  /async removeProduct\(part: any\) \{[\s\S]*?if \(!this.ticket \|\| !confirm\('¿Eliminar este producto del ticket\?'\)\) return;/,
  `async removeProduct(part: any) {
    if (!this.ticket) return;
    const confirmed = await this.confirmModal.open({
      title: 'Quitar Producto',
      message: '¿Deseas eliminar este producto de la lista del ticket?',
      icon: 'fas fa-times-circle',
      iconColor: 'amber',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

fs.writeFileSync(filePath, content);
console.log('Ticket detail component patched with custom modal.');
