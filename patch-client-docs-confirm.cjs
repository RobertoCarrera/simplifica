const fs = require('fs');
const path = require('path');
const filePath = 'src/app/features/customers/profile/components/client-documents/client-documents.component.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Add import
if (!content.includes('ConfirmModalComponent')) {
  content = content.replace(
    "import { ContractsService, Contract } from '../../../../../core/services/contracts.service';",
    "import { ContractsService, Contract } from '../../../../../core/services/contracts.service';\nimport { ConfirmModalComponent } from '../../../../../shared/ui/confirm-modal/confirm-modal.component';\nimport { ViewChild } from '@angular/core';"
  );
}

// Add to imports array
content = content.replace(
  /imports: \[CommonModule, ContractCreationDialogComponent, FormsModule\],/,
  "imports: [CommonModule, ContractCreationDialogComponent, FormsModule, ConfirmModalComponent],"
);

// Add modal to template
if (!content.includes('confirmModal')) {
  content = content.replace(
    '<div class="space-y-6">',
    '<app-confirm-modal #confirmModal></app-confirm-modal>\n    <div class="space-y-6">'
  );
  
  content = content.replace(
    "export class ClientDocumentsComponent implements OnInit {",
    "export class ClientDocumentsComponent implements OnInit {\n  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;"
  );
}

// Replace delete document confirm
content = content.replace(
  /async delete\(doc: ClientDocument\) \{[\s\S]*?if \(!confirm\(`¿Eliminar \${doc\.name}\?\`\)\) return;/,
  `async delete(doc: ClientDocument) {
    const confirmed = await this.confirmModal.open({
      title: 'Eliminar Documento',
      message: \`¿Estás seguro de que deseas eliminar el documento "\${doc.name}"? Esta acción no se puede deshacer.\`,
      icon: 'fas fa-trash-alt',
      iconColor: 'red',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

// Replace share contract confirm
content = content.replace(
  /shareContract\(contract: Contract\) \{[\s\S]*?if \(!confirm\('¿Deseas hacer visible este documento en el portal del cliente para su firma\?'\)\) return;/,
  `async shareContract(contract: Contract) {
    if (contract.status !== 'draft') {
      this.toast.info('Info', 'El contrato ya ha sido compartido o firmado.');
      return;
    }
    
    const confirmed = await this.confirmModal.open({
      title: 'Compartir Documento',
      message: '¿Deseas hacer visible este documento en el portal del cliente para su revisión y firma?',
      icon: 'fas fa-share-nodes',
      iconColor: 'blue',
      confirmText: 'Compartir',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

// Replace delete contract confirm
content = content.replace(
  /deleteContractAction\(contract: Contract\) \{[\s\S]*?if \(!confirm\('¿Eliminar el contrato generado "' \+ contract\.title \+ '"\?'\)\) return;/,
  `async deleteContractAction(contract: Contract) {
    const confirmed = await this.confirmModal.open({
      title: 'Eliminar Contrato',
      message: \`¿Estás seguro de que quieres eliminar el contrato generado "\${contract.title}"?\`,
      icon: 'fas fa-trash-alt',
      iconColor: 'red',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;`
);

fs.writeFileSync(filePath, content);
console.log('Client documents component patched with custom modal.');
