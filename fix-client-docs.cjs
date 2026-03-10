const fs = require('fs');
const path = require('path');
const p = path.join('src', 'app', 'features', 'customers', 'profile', 'components', 'client-documents', 'client-documents.component.ts');

let content = fs.readFileSync(p, 'utf8');

// Fix Router inject issue and add the import to the top
if (!content.includes("import { Router } from '@angular/router';")) {
  content = content.replace("import { CommonModule } from '@angular/common';", "import { CommonModule } from '@angular/common';\nimport { Router } from '@angular/router';");
}
content = content.replace("router = inject(import('@angular/router').Router);", "router = inject(Router);");

// ensure the functions are added at the END of class ClientDocumentsComponent
if (!content.includes('sendContractToWebmail(contract: Contract)')) {
  // Let's remove the old failed append if any, but since the errors showed they were missing, they are truly missing.
  // Wait, the regex `}\s*$` might have failed if there were blank lines or didn't match. 
  // Let's just do:
  const splitStr = "onContractCreated() {\n    this.loadContracts();\n  }";
  if (content.includes(splitStr)) {
    const replacement = splitStr + `

  sendContractToWebmail(contract: Contract) {
    this.router.navigate(['/webmail/composer'], {
      state: {
        to: this.clientEmail,
        subject: contract.title,
        body: contract.content_html
      }
    });
  }

  editContract(contract: Contract) {
    this.contractToEdit.set(contract);
    this.showCreateContract.set(true);
  }

  deleteContractAction(contract: Contract) {
    if (!confirm('¿Eliminar el contrato generado "' + contract.title + '"?')) return;
    
    this.contractsService.deleteContract(contract.id).subscribe({
      next: () => {
        this.contracts.update(prev => prev.filter(c => c.id !== contract.id));
        this.toast.success('Eliminado', 'Contrato eliminado');
      },
      error: () => {
        this.toast.error('Error', 'No se pudo eliminar el contrato');
      }
    });
  }
`;
    content = content.replace(splitStr, replacement);
  }
}

fs.writeFileSync(p, content);
console.log('Fixed router and functions');
