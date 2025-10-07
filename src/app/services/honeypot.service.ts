import { Injectable } from '@angular/core';

/**
 * Honeypot Service
 * Implements honeypot fields to prevent bot submissions
 * 
 * Usage:
 * 1. Add hidden field to form with honeypot name
 * 2. Check if field is filled (bots usually fill all fields)
 * 3. Reject submission if honeypot field has value
 */
@Injectable({
  providedIn: 'root'
})
export class HoneypotService {

  // Generate a random honeypot field name to avoid bot detection
  private honeypotFields = [
    'email_confirm',
    'phone_verification',
    'address_line_3',
    'company_vat',
    'website_url',
    'preferred_contact',
    'business_type'
  ];

  constructor() { }

  /**
   * Get a random honeypot field name
   * Changes on each page load to make it harder for bots to detect
   */
  getHoneypotFieldName(): string {
    const randomIndex = Math.floor(Math.random() * this.honeypotFields.length);
    return this.honeypotFields[randomIndex];
  }

  /**
   * Check if form submission is likely from a bot
   * @param honeypotValue The value of the honeypot field
   * @param submissionTime Time taken to submit form (in ms)
   * @returns true if submission appears to be from a bot
   */
  isProbablyBot(honeypotValue: string | null | undefined, submissionTime?: number): boolean {
    // Check 1: Honeypot field should be empty (humans can't see it)
    if (honeypotValue && honeypotValue.trim() !== '') {
      console.warn('🚫 Bot detected: Honeypot field filled');
      return true;
    }

    // Check 2: Form submitted too quickly (< 2 seconds)
    if (submissionTime !== undefined && submissionTime < 2000) {
      console.warn('🚫 Bot detected: Form submitted too quickly');
      return true;
    }

    return false;
  }

  /**
   * Get inline styles for honeypot field
   * Multiple techniques to hide from bots:
   * - Absolute positioning off-screen
   * - Zero dimensions
   * - Opacity 0
   * - Tab index -1 (not keyboard accessible)
   */
  getHoneypotStyles(): string {
    return 'position:absolute;left:-9999px;width:0;height:0;opacity:0;pointer-events:none;';
  }

  /**
   * Get honeypot field attributes
   */
  getHoneypotAttributes() {
    return {
      tabindex: -1,
      autocomplete: 'off',
      'aria-hidden': true
    };
  }

  /**
   * Track form load time for bot detection
   */
  getFormLoadTime(): number {
    return Date.now();
  }

  /**
   * Calculate form submission time
   */
  getSubmissionTime(formLoadTime: number): number {
    return Date.now() - formLoadTime;
  }
}
