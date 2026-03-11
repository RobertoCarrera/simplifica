const fs = require('fs');
const path = require('path');
const p = path.join('src', 'app', 'features', 'customers', 'profile', 'components', 'client-documents', 'client-documents.component.ts');
let content = fs.readFileSync(p, 'utf8');

// 1. Add sendContractToWebmail back to logic if missing
if (!content.includes('sendContractToWebmail(contract: Contract)')) {
    const fn = `
  sendContractToWebmail(contract: Contract) {
    this.router.navigate(['/webmail/composer'], {
      state: {
        to: this.clientEmail,
        subject: contract.title,
        body: contract.content_html
      }
    });
  }
`;
    content = content.replace('editContract(contract: Contract)', fn + '\n  editContract(contract: Contract)');
}

// 2. Add the button back to the template
const shareBtn = `title="Compartir en el Portal (Solicitar Firma)">
                    <i class="fas fa-share-nodes"></i>
                  </button>`;
if (!content.includes('title="Enviar por Correo"')) {
    const addition = `title="Compartir en el Portal (Solicitar Firma)">
                    <i class="fas fa-share-nodes"></i>
                  </button>
                  <button (click)="sendContractToWebmail(contract)" class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="Enviar por Correo">
                    <i class="fas fa-envelope"></i>
                  </button>`;
    content = content.replace(shareBtn, addition);
}

// 3. Add folder state and functions
if (!content.includes('currentPath = signal(')) {
    content = content.replace('documents = signal<ClientDocument[]>([]);', 'documents = signal<ClientDocument[]>([]);\n  currentPath = signal("");');
}

if (!content.includes('createFolder() {')) {
    // Actually, we'll insert it at the end of class
    const folderVarsAndMethods = `
  // FOLDERS Logic
  get filteredDocuments() {
    return this.documents().filter(d => (d.folder_path || '') === this.currentPath());
  }

  async createFolder() {
    const folderName = prompt('Nombre de la nueva carpeta:');
    if (!folderName) return;
    try {
      this.isUploading.set(true);
      await this.docsService.createFolder(this.clientId, folderName, this.currentPath());
      this.toast.success('Éxito', 'Carpeta creada');
      this.loadDocuments();
    } catch (e) {
      this.toast.error('Error', 'No se pudo crear la carpeta');
    } finally {
      this.isUploading.set(false);
    }
  }

  openFolder(folder: ClientDocument) {
    this.currentPath.set(folder.file_path);
  }

  goUpFolder() {
    const parts = this.currentPath().split('/');
    parts.pop();
    this.currentPath.set(parts.join('/'));
  }
`;
    // replace `onContractCreated() {`
    content = content.replace(/onContractCreated\(\) \{/, folderVarsAndMethods + '\n  onContractCreated() {');
}

// 4. Update the template of files rendering to use `filteredDocuments` instead of `documents()`
content = content.replace(/@if \(!isLoading\(\) && documents\(\)\.length > 0\) \{/, "@if (!isLoading()) {"); // remove the length check from IF statement, we will handle empty state inside
content = content.replace(/@for \(doc of documents\(\); track doc\) \{/g, "@if (currentPath() !== '') {\n              <div (click)=\"goUpFolder()\" class=\"p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-4 cursor-pointer\">\n                <div class=\"w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-xl\">\n                  <i class=\"fas fa-level-up-alt text-gray-500\"></i>\n                </div>\n                <h4 class=\"text-sm font-medium text-gray-900 dark:text-white\">.. Volver</h4>\n              </div>\n            }\n            @for (doc of filteredDocuments; track doc) {");

// Wait, the template has `<p>No hay documentos subidos.</p>`
content = content.replace(/@if \(!isLoading\(\) && documents\(\)\.length === 0\) \{[\s\S]*?No hay documentos subidos\.<\/p>[\s\S]*?<\/div>\n\s*\}/, ""); 
// The original empty state was removed, let's put it inside the @if (!isLoading()) block
content = content.replace(/@if \(!isLoading\(\)\) \{([\s\S]*?)<div class="divide-y divide-gray-100 dark:divide-slate-700">/, `@if (!isLoading()) {\n          @if (documents().length === 0) {\n            <div class="p-12 text-center text-gray-500 dark:text-gray-400">\n              <i class="fas fa-folder-open text-4xl mb-3 opacity-50"></i>\n              <p>No hay documentos subidos.</p>\n            </div>\n          }\n          <div class="divide-y divide-gray-100 dark:divide-slate-700">`);

// Replace upload button in the header with a dropdown or just add Create Folder button next to it
if (!content.includes('Crear Carpeta')) {
    content = content.replace("<!-- Files Grid -->", `
      <div class="flex gap-2">
        <button (click)="createFolder()" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors">
          <i class="fas fa-folder-plus"></i> Crear Carpeta
        </button>
      </div>
      <!-- Files Grid -->`);
}

// 5. Override handleFileUpload to support folder 
const handleFileUploadReplace = `async handleFileUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      this.toast.error('Error', 'El archivo es demasiado grande (Máx 10MB)');
      return;
    }

    this.isUploading.set(true);
    try {
      if (this.docsService.uploadDocumentInFolder) {
         await this.docsService.uploadDocumentInFolder(this.clientId, file, this.currentPath());
      } else {
         await this.docsService.uploadDocument(this.clientId, file);
      }
      this.toast.success('Éxito', 'Documento subido correctamente');
      this.loadDocuments();
    } catch (e) {
      console.error(e);
      this.toast.error('Error', 'No se pudo subir el archivo');
    } finally {
      this.isUploading.set(false);
      event.target.value = ''; 
    }
  }`;

content = content.replace(/async handleFileUpload\(event: any\) \{[\s\S]*?\}\s*(?=async download|async delete)/, handleFileUploadReplace + '\n\n  ');

// 6. Make clicks on folders open them
content = content.replace(/<div class="flex items-center gap-4">/g, `<div class="flex items-center gap-4 cursor-pointer" (click)="doc.file_type === 'folder' ? openFolder(doc) : null">`);
content = content.replace(/getFileIcon\(doc\.file_type\)/g, "doc.file_type === 'folder' ? 'fas fa-folder text-yellow-500' : getFileIcon(doc.file_type)");
// ensure download only shows for files
content = content.replace(/<button\s+\(click\)="download\(doc\)"/g, `<!-- only files can be downloaded -->\n                  @if (doc.file_type !== 'folder') {\n                  <button (click)="download(doc)"`);
content = content.replace(/<button\s+\(click\)="delete\(doc\)"/g, `}\n                  <button (click)="delete(doc)"`);

// We are replacing inside a string array, so it is safer.
fs.writeFileSync(p, content);
console.log("Client docs updated with folders and webmail feature.");
