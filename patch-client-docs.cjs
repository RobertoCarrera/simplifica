const fs = require('fs');
const path = require('path');
const p = path.join('src', 'app', 'features', 'customers', 'profile', 'components', 'client-documents', 'client-documents.component.ts');
let content = fs.readFileSync(p, 'utf8');

// We replace `sendContractToWebmail` with `shareContract`
// Wait, we need to inject NotificationService and AuditLoggerService.
if (!content.includes('SupabaseNotificationsService')) {
  content = content.replace("import { ToastService } from '../../../../../services/toast.service';", "import { ToastService } from '../../../../../services/toast.service';\nimport { SupabaseNotificationsService } from '../../../../../services/supabase-notifications.service';\nimport { AuditLoggerService } from '../../../../../services/audit-logger.service';");
}

if (!content.includes('notifications = inject(SupabaseNotificationsService);')) {
  content = content.replace("toast = inject(ToastService);", "toast = inject(ToastService);\n  notifications = inject(SupabaseNotificationsService);\n  auditLogger = inject(AuditLoggerService);");
}

// 1. In HTML template, replace `sendContractToWebmail(contract)` with `shareContract(contract)`
content = content.replace(/sendContractToWebmail\(contract\)/g, "shareContract(contract)");
content = content.replace(/title="Enviar por Webmail"/g, 'title="Compartir en el Portal (Solicitar Firma)"');
content = content.replace(/fa-paper-plane/g, 'fa-share-nodes');

// 2. Add the method logic 
const shareContractCode = `
  shareContract(contract: Contract) {
    if (contract.status !== 'draft') {
      this.toast.info('Info', 'El contrato ya ha sido compartido o firmado.');
      return;
    }
    
    if (!confirm('¿Deseas hacer visible este documento en el portal del cliente para su firma?')) return;
    
    this.contractsService.updateContract(contract.id, { status: 'sent' }).subscribe({
      next: () => {
        this.toast.success('Compartido', 'El documento ahora es visible para el cliente.');
        this.auditLogger.logAction('share_document', 'contracts', contract.id, { client_id: this.clientId });
        this.notifications.sendNotification(
          this.clientId,
          'Nuevo Documento',
          'Tienes un nuevo documento pendiente de revisión y firma.',
          'document',
          contract.id,
          true
        );
        this.loadContracts();
      },
      error: () => this.toast.error('Error', 'No se pudo compartir el documento')
    });
  }
`;

// Replace `sendContractToWebmail(contract: Contract) { ... }` with `shareContract`
// Regex to replace the whole `sendContractToWebmail` function
content = content.replace(/sendContractToWebmail\(contract: Contract\) \{[\s\S]*?\}\s*editContract/m, shareContractCode + '\n  editContract');

fs.writeFileSync(p, content);
console.log("Client docs sharing updated.");
