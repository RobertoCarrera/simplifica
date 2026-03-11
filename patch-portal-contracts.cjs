const fs = require('fs');
const path = require('path');
const p = path.join('src', 'app', 'features', 'client-portal', 'pages', 'contracts', 'client-contracts.component.ts');
let content = fs.readFileSync(p, 'utf8');

// Needs:
// 1. Import ContractSignDialogComponent, AuditLoggerService, SupabaseNotificationsService
if (!content.includes('ContractSignDialogComponent')) {
  // CommonModule is imported somewhere, let's insert it around there
  content = content.replace("import { CommonModule } from '@angular/common';", 
    "import { CommonModule } from '@angular/common';\nimport { ViewChild } from '@angular/core';\nimport { ContractSignDialogComponent } from '../../components/contract-sign-dialog/contract-sign-dialog.component';\nimport { AuditLoggerService } from '../../../../services/audit-logger.service';\nimport { SupabaseNotificationsService } from '../../../../services/supabase-notifications.service';\nimport { SimpleSupabaseService } from '../../../../services/simple-supabase.service';");
}

if (!content.includes('ContractSignDialogComponent')) {
  content = content.replace('imports: [CommonModule]', 'imports: [CommonModule, ContractSignDialogComponent]');
}

// 2. Add the dialog to the HTML template
const dialogHtml = `
    </div>

    <!-- The Sign Dialog -->
    <app-contract-sign-dialog #signDialog (signed)="onContractSigned($event)"></app-contract-sign-dialog>
  \`,
`;
content = content.replace(/<\/div>\n\s*`,\n/g, dialogHtml);

// 3. Update the component logic
let importsAndVars = `
export class ClientContractsComponent {
  @ViewChild('signDialog') signDialog!: ContractSignDialogComponent;
  
  private contractsService = inject(ContractsService);
  private authService = inject(AuthService);
  private auditLogger = inject(AuditLoggerService);
  private notificationsService = inject(SupabaseNotificationsService);
  private supabase = inject(SimpleSupabaseService);

  loading = signal(true);
  contracts = signal<Contract[]>([]);

  // to hold client info
  currentClient: any = null;
`;

content = content.replace(/export class ClientContractsComponent \{[\s\S]*?loading = signal\(true\);\s*contracts = signal<Contract\[\]>\(\[\]\);/m, importsAndVars);

// update loadContracts to store currentClient
const loadContractsReplacement = `
      const { data: clientData } = await this.authService.supabase.client
        .from('customers')
        .select('id, company_id, name, assigned_to')
        .eq('auth_user_id', user?.id)
        .single();

      if (clientData) {
        this.currentClient = clientData;
        this.contractsService.getClientContracts(clientData.id).subscribe({
`;
content = content.replace(/const \{ data: clientData \} = await this\.authService\.supabase\.client[\s\S]*?\.select\('id'\)[\s\S]*?\.single\(\);\s*if \(clientData\) \{[\s\S]*?this\.contractsService\.getClientContracts\(clientData\.id\)\.subscribe\(\{/m, loadContractsReplacement);

// 4. Update signContract and add onContractSigned
const logicUpdates = `
  async signContract(contract: Contract) {
    this.auditLogger.logAction('view_contract', 'contracts', contract.id, { client_id: contract.client_id });
    
    // Notify owner and professional
    if (this.currentClient) {
      if (this.currentClient.assigned_to) {
        this.notificationsService.sendNotification(
          this.currentClient.assigned_to, 
          'Contrato Leído', 
          'El cliente ' + this.currentClient.name + ' ha abierto el contrato: ' + contract.title, 
          'info', 
          contract.id
        );
      }
      // Also to the company owner? Usually there is a standard way or we just send it to assigned_to.
      // Easiest is to send to the assigned professional.
    }
    
    // open dialog
    if (this.signDialog) {
      this.signDialog.open(contract);
    }
  }

  async onContractSigned(contract: Contract) {
    this.auditLogger.logAction('sign_contract', 'contracts', contract.id, { client_id: contract.client_id });
    
    if (this.currentClient && this.currentClient.assigned_to) {
      this.notificationsService.sendNotification(
        this.currentClient.assigned_to, 
        'Contrato Firmado', 
        'El cliente ' + this.currentClient.name + ' ha firmado el contrato: ' + contract.title, 
        'success', 
        contract.id
      );
    }

    // reload
    this.loadContracts();
  }

  async downloadContract(contract: Contract) {
`;

content = content.replace(/signContract\(contract: Contract\) \{[\s\S]*?\}[\s\S]*?async downloadContract\(contract: Contract\) \{/m, logicUpdates);

// Add missing quotes for standalone component
if (!content.includes('standalone: true')) {
  // Need to ensure imports is valid
  // It is standalone if imports exist or not?
  // Let's replace CommonModule injection if missing standalone
}

fs.writeFileSync(p, content);
console.log('Client dashboard patched');
