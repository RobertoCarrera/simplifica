/**
 * Shared email provider types and interfaces.
 * Used by send-branded-email and other Edge Functions that send email.
 */

export interface EmailParams {
  from: { email: string; name?: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  /** Optional Reply-To address. When set, replies flow to this address
   *  instead of the From address. Used when the From is a no-reply alias
   *  (e.g. noreply@caibs.es) but the operator wants replies in their GWS. */
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  retryable?: boolean;
}

export interface TestResult {
  success: boolean;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export type ProviderStatus = 'ready' | 'degraded' | 'error';

export interface EmailProvider {
  send(params: EmailParams): Promise<EmailResult>;
  test(params: EmailParams): Promise<TestResult>;
  getStatus(): { configured: boolean; error?: string };
}