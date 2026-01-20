export interface MailAccount {
    id: string;
    user_id: string;
    email: string;
    provider: 'ses' | 'smtp' | 'gmail_import';
    sender_name?: string;
    settings?: {
        signature?: string;
        alias?: string;
        color?: string;
        smtp_host?: string;
        smtp_port?: number;
        smtp_user?: string;
    };
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface MailFolder {
    id: string;
    account_id: string;
    parent_id?: string | null;
    name: string;
    path: string;
    type: 'system' | 'user';
    system_role?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam';
    created_at?: string;
    updated_at?: string;
    // UI helpers
    unread_count?: number;
    total_count?: number;
    children?: MailFolder[];
    level?: number;
    expanded?: boolean;
}

export interface MailAddress {
    name: string;
    email: string;
}

export interface MailMessage {
    id: string;
    account_id: string;
    thread_id?: string | null;
    folder_id?: string | null;

    from: MailAddress;
    to: MailAddress[];
    cc?: MailAddress[];
    bcc?: MailAddress[];

    subject: string;
    body_html?: string;
    body_text?: string;
    snippet?: string;

    is_read: boolean;
    is_starred: boolean;
    is_archived: boolean;

    received_at: string;
    created_at?: string;
    updated_at?: string;

    metadata?: any;
    attachments?: MailAttachment[];

    // UI helpers
    selected?: boolean;
}

export interface MailAttachment {
    id: string;
    message_id: string;
    filename: string;
    size: number;
    content_type: string;
    storage_path: string;
    url?: string; // Signed URL
}

export interface MailThread {
    id: string;
    account_id: string;
    subject: string;
    snippet: string;
    last_message_at: string;
    messages?: MailMessage[]; // When loaded
}
