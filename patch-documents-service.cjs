const fs = require('fs');
const path = require('path');
const p = path.join('src', 'app', 'services', 'supabase-documents.service.ts');
let content = fs.readFileSync(p, 'utf8');

if (!content.includes('folder_path?: string;')) {
    content = content.replace('file_path: string;', "file_path: string;\n    folder_path?: string;");
}

if (!content.includes('async createFolder(')) {
    const methods = `
    // Create Folder
    async createFolder(clientId: string, folderName: string, parentPath: string = ''): Promise<ClientDocument> {
        const companyId = this.auth.companyId();
        if (!companyId) throw new Error('No Company ID');

        const { data, error: dbError } = await this.supabase
            .from('client_documents')
            .insert({
                company_id: companyId,
                client_id: clientId,
                name: folderName,
                file_path: parentPath ? \`\${parentPath}/\${folderName}\` : folderName,
                file_type: 'folder',
                size: 0,
                created_by: (await this.supabase.auth.getUser()).data.user?.id
            })
            .select()
            .single();

        if (dbError) throw dbError;
        return data as ClientDocument;
    }

    // Upload File internally overrides to accept folder
    async uploadDocumentInFolder(clientId: string, file: File, folderPath: string = ''): Promise<ClientDocument> {
        const companyId = this.auth.companyId();
        if (!companyId) throw new Error('No Company ID');

        const fileExt = file.name.split('.').pop();
        const fileName = \`\${crypto.randomUUID()}.\${fileExt}\`;
        
        // Full path in storage
        const storagePath = folderPath 
            ? \`\${companyId}/\${clientId}/\${folderPath}/\${fileName}\` 
            : \`\${companyId}/\${clientId}/\${fileName}\`;

        const { error: uploadError } = await this.supabase.storage
            .from(this.bucket)
            .upload(storagePath, file);

        if (uploadError) throw uploadError;

        const { data, error: dbError } = await this.supabase
            .from('client_documents')
            .insert({
                company_id: companyId,
                client_id: clientId,
                name: file.name,
                file_path: storagePath,
                folder_path: folderPath, // Logical path referencing the folder
                file_type: file.type || 'application/octet-stream',
                size: file.size,
                created_by: (await this.supabase.auth.getUser()).data.user?.id
            })
            .select()
            .single();

        if (dbError) throw dbError;
        return data as ClientDocument;
    }
`;
    // Find "async uploadDocument" and insert before it
    content = content.replace(/\/\/ Upload File/, methods + '\n    // Upload File');
}

fs.writeFileSync(p, content);
console.log('supabase-documents.service.ts patched');
