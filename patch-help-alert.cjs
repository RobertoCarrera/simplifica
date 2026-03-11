const fs = require('fs');
const path = require('path');
const filePath = 'src/app/features/help/help.component.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Add import
if (!content.includes('ConfirmModalComponent')) {
  content = content.replace(
    "import { CommonModule } from '@angular/common';",
    "import { CommonModule } from '@angular/common';\nimport { ConfirmModalComponent } from '../../shared/ui/confirm-modal/confirm-modal.component';\nimport { ViewChild } from '@angular/core';"
  );
}

// Add to imports array
if (!content.includes('ConfirmModalComponent')) {
    content = content.replace(
      "imports: [CommonModule],",
      "imports: [CommonModule, ConfirmModalComponent],"
    );
}

// Add modal to template
if (!content.includes('confirmModal')) {
  // Find the end of the root div or just prepend to template
  content = content.replace(
    "template: `",
    "template: `\n    <app-confirm-modal #confirmModal></app-confirm-modal>"
  );
  
  content = content.replace(
    "export class HelpComponent {",
    "export class HelpComponent {\n  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;"
  );
}

// Replace alert
content = content.replace(
  "alert('Chat en vivo próximamente disponible');",
  `this.confirmModal.open({
      title: 'Próximamente',
      message: 'El chat en vivo estará disponible muy pronto para ayudarte con todas tus dudas.',
      icon: 'fas fa-comments',
      iconColor: 'blue',
      confirmText: 'Entendido',
      showCancel: false
    });`
);

fs.writeFileSync(filePath, content);
console.log('Help component patched with custom modal.');
