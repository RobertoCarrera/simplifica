/**
 * Service: supabase-session-close
 *
 * Handles the session-close workflow:
 * 1. confirmSession() — professional confirms a completed session
 *    - Calls confirm_session_rpc
 *    - If payment is confirmed AND client has marketing_consent=true:
 *      triggers Phase 2: sends Google Review email via send-branded-email
 * 2. requestGoogleReview() — manual trigger from client profile
 * 3. markHasLeftReview() — marks that client has left a review
 */
import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';
import { AuthService } from './auth.service';

export interface ConfirmSessionResult {
  success: boolean;
  booking_id: string;
  session_confirmed_at: string;
  client_marketing_consent: boolean;
  client_email: string;
  client_name: string;
  google_review_url: string | null;
  review_email_sent?: boolean;
}

export interface ReviewEmailResult {
  success: boolean;
  sent_to: string;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseSessionCloseService {
  private supabase = inject(SimpleSupabaseService);
  private authService = inject(AuthService);

  /**
   * Confirm a completed session.
   * Called by the professional from the booking detail view.
   *
   * Side effects:
   * - Updates booking with session_confirmed_at + session_confirmed_by
   * - If client has marketing_consent=true AND google_review_url is configured:
   *   → Sends a "thank you + Google Review" email to the client
   * - Returns confirmation data including whether the review email was sent
   */
  async confirmSession(bookingId: string): Promise<ConfirmSessionResult> {
    const companyId = this.authService.companyId();
    if (!companyId) {
      throw new Error('No company context found');
    }

    // 1. Call the RPC to confirm the session
    const { data, error } = await this.supabase
      .getClient()
      .rpc('confirm_session_rpc', { p_booking_id: bookingId });

    if (error) {
      console.error('[session-close] RPC error:', error);
      throw new Error('Error al confirmar la sesión: ' + error.message);
    }

    const result = data as ConfirmSessionResult;

    // 2. Phase 2: send Google Review email if GDPR conditions are met
    let reviewEmailSent = false;
    if (
      result.client_marketing_consent === true &&
      result.google_review_url &&
      result.client_email
    ) {
      try {
        await this.sendGoogleReviewEmail({
          companyId,
          clientEmail: result.client_email,
          clientName: result.client_name,
          bookingId,
          googleReviewUrl: result.google_review_url,
        });
        reviewEmailSent = true;
      } catch (err: any) {
        // Non-blocking: email failure should not roll back the session confirmation
        console.warn('[session-close] Failed to send Google Review email:', err?.message);
      }
    }

    return { ...result, review_email_sent: reviewEmailSent };
  }

  /**
   * Manually request a Google Review email from the client profile.
   * Only sends if marketing_consent=true.
   */
  async requestGoogleReview(clientId: string, clientEmail: string, clientName: string): Promise<ReviewEmailResult> {
    const companyId = this.authService.companyId();
    if (!companyId) {
      throw new Error('No company context found');
    }

    // Check marketing_consent
    const { data: client, error } = await this.supabase
      .getClient()
      .from('clients')
      .select('marketing_consent, company_id')
      .eq('id', clientId)
      .single();

    if (error || !client) {
      throw new Error('Cliente no encontrado');
    }

    if (!client.marketing_consent) {
      throw new Error('El cliente no ha dado consentimiento para comunicaciones de marketing');
    }

    // Get google_review_url from company_settings
    const { data: settings, error: settingsError } = await this.supabase
      .getClient()
      .from('company_settings')
      .select('google_review_url')
      .eq('company_id', client.company_id || companyId)
      .single();

    if (settingsError || !settings?.google_review_url) {
      throw new Error('URL de Google Review no configurada. Configúrala en Ajustes de empresa.');
    }

    await this.sendGoogleReviewEmail({
      companyId: client.company_id || companyId,
      clientEmail,
      clientName,
      bookingId: null,
      googleReviewUrl: settings.google_review_url,
    });

    return { success: true, sent_to: clientEmail };
  }

  /**
   * Mark that a client has left (or told staff they left) a Google Review.
   * Used to prevent spamming.
   */
  async markHasLeftReview(clientId: string, leftReview: boolean = true): Promise<void> {
    const updates: Record<string, unknown> = {
      has_left_google_review: leftReview,
    };
    if (leftReview) {
      updates['google_review_date'] = new Date().toISOString();
    }

    const { error } = await this.supabase
      .getClient()
      .from('clients')
      .update(updates)
      .eq('id', clientId);

    if (error) {
      console.error('[session-close] Error updating client review flag:', error);
      throw new Error('Error al actualizar el estado de Google Review');
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async sendGoogleReviewEmail(params: {
    companyId: string;
    clientEmail: string;
    clientName: string;
    bookingId: string | null;
    googleReviewUrl: string;
  }): Promise<void> {
    const { companyId, clientEmail, clientName, googleReviewUrl } = params;

    const functionsBase = this.supabase.getSupabaseUrl() + '/functions/v1';
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const token = session?.access_token || '';

    const response = await fetch(`${functionsBase}/send-branded-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        companyId,
        emailType: 'google_review',
        to: [{ email: clientEmail, name: clientName }],
        subject: `¡Gracias por tu visita, ${clientName}! 🌟`,
        data: {
          client_name: clientName,
          review_url: googleReviewUrl,
        },
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error sending review email');
    }
  }
}
