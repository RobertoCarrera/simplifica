export interface MailAccount {
  id: string;
  user_id: string;
  email: string;
  provider: "ses" | "smtp" | "gmail_import";
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
  // Populated via JOIN when owner/admin fetches company accounts
  owner?: { id: string; name: string; surname: string } | null;
}

export interface MailFolder {
  id: string;
  account_id: string;
  parent_id?: string | null;
  name: string;
  path: string;
  type: "system" | "user";
  system_role?: "inbox" | "sent" | "drafts" | "trash" | "spam";
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

  from?: MailAddress | null;
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

/** Sender frequency entry returned by get_sender_frequency_rpc */
export interface SenderFrequency {
  sender_email: string;
  sender_name: string;
  sender_domain: string;
  email_count: number;
  newest_email_at: string;
  oldest_email_at: string;
  has_existing_folder: boolean;
  existing_folder_id: string | null;
  total_inbox: number;
}

/** Result from batch organization */
export interface AutoFileResult {
  sender_email: string;
  sender_name: string;
  folder_name: string;
  folder_id: string;
  folder_created: boolean;
  emails_moved: number;
  total_senders: number;
  total_emails_moved: number;
}

/** Classification result for incoming email */
export interface ClassifyResult {
  action_taken: string;
  folder_id: string | null;
  folder_name: string | null;
  folder_created: boolean;
  past_emails_moved: number;
  sender_email: string | null;
  sender_total_in_inbox: number;
}

/** Smart folder stats */
export interface SmartFolderStats {
  total_inbox_emails: number;
  unique_senders_in_inbox: number;
  senders_with_multiple_emails: number;
  organizable_emails: number;
  existing_user_folders: number;
  emails_already_in_folders: number;
  smart_folder_enabled: boolean;
}
