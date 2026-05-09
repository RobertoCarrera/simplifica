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