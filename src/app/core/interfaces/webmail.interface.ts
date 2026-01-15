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
    // UI helpers
    unread_count?: number;
    total_count?: number;
    children?: MailFolder[];
}

export interface MailAddress {
    name?: string;
    email: string;
}

export interface MailAttachment {
    filename: string;
    contentType?: string;
    size: number;
    url?: string;
    id?: string;
    storage_path?: string;
}

export interface MailMessage {
    id: string;
    account_id: string; // The account that owns/syncs this message
    thread_id?: string;
    folder_id: string;

    // Headers
    from?: MailAddress;
    to?: MailAddress[];
    cc?: MailAddress[];
    bcc?: MailAddress[];
    subject: string;

    // Content
    snippet?: string;
    body_text?: string;
    body_html?: string;

    // Flags & Metadata
    is_read: boolean;
    is_starred: boolean;
    received_at: string;

    // Attachments (JSONB in DB)
    attachments?: MailAttachment[];
}

export interface MailThread {
    thread_id: string;
    subject: string;
    snippet: string;
    last_message_at: string;
    message_count: number;
    participants: string[];
    is_read: boolean;
    has_attachments: boolean;
}
