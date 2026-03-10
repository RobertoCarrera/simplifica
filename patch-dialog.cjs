const fs = require('fs');
const path = require('path');

const p = path.join('src', 'app', 'features', 'customers', 'profile', 'components', 'contract-creation-dialog', 'contract-creation-dialog.component.ts');
let content = fs.readFileSync(p, 'utf8');

// Add import Contract
if (!content.includes('import { Contract }')) {
    content = content.replace("ContractsService,", "ContractsService,\n  Contract,");
}

// Add Input
if (!content.includes('contractToEdit: Contract | null')) {
    content = content.replace("@Input() clientEmail: string = '';", "@Input() clientEmail: string = '';\n  @Input() contractToEdit: Contract | null = null;");
}

// Modify ngOnInit and loadTemplates logic to populate if editing
const ngInitCode = `
  ngOnInit() {
    this.loadTemplates();
    if (this.contractToEdit) {
      this.contractTitle = this.contractToEdit.title;
      this.contractContent = this.contractToEdit.content_html;
      setTimeout(() => {
        if (this.editorRef) {
          this.editorRef.nativeElement.innerHTML = this.contractContent;
        }
      }, 0);
    }
  }
`;

content = content.replace(/ngOnInit\(\) \{\s*this\.loadTemplates\(\);\s*\}/, ngInitCode);

// Modify createContract logic to use updateContract if editing
// Wait, createContract is doing createContract. Let's modify it safely.
const saveCode = `
  createContract() {
    if (!this.isValid()) return;

    this.isSaving.set(true);
    const finalContent = this.replacePlaceholders(this.contractContent);

    if (this.contractToEdit) {
      this.contractsService.updateContract(this.contractToEdit.id, {
        title: this.contractTitle,
        content_html: finalContent
      }).subscribe({
        next: () => {
          this.toast.success('Éxito', 'Contrato actualizado correctamente');
          this.created.emit();
          this.close.emit();
        },
        error: (err) => {
          console.error('Error updating contract', err);
          this.toast.error('Error', 'No se pudo actualizar el contrato');
          this.isSaving.set(false);
        }
      });
    } else {
      this.contractsService
        .createContract({
          company_id: this.companyId,
          client_id: this.clientId,
          title: this.contractTitle,
          content_html: finalContent,
          status: 'draft',
        })
        .subscribe({
          next: () => {
            this.toast.success('Éxito', 'Contrato creado y guardado como borrador');
            this.created.emit();
            this.close.emit();
          },
          error: (err) => {
            console.error('Error creating contract', err);
            this.toast.error('Error', 'No se pudo crear el contrato');
            this.isSaving.set(false);
          },
        });
    }
  }
`;

let startIdx = content.indexOf('createContract() {');
if (startIdx !== -1) {
  content = content.substring(0, startIdx) + saveCode + '\n}';
}

fs.writeFileSync(p, content);
console.log('Dialog patched');
