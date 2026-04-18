/**
 * Bono/Abonamiento models
 * Multi-session bonus system for Simplifica CRM
 */

/** A bono record — tracks a client's purchased multi-session package */
export interface ClientBono {
  id: string;
  client_id: string;
  variant_id: string;
  service_id: string;
  company_id: string;
  sessions_total: number;       // original sessions purchased
  sessions_used: number;        // sessions consumed so far
  sessions_remaining: number;   // sessions left
  purchase_date: string;
  expires_at: string | null;    // null = no expiry
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;

  // Joined fields (from get_client_bonuses RPC)
  variant_name?: string;
  service_name?: string;
}

/** Result of use_client_bono RPC */
export interface UseBonoResult {
  bonus_id: string;
  sessions_remaining: number;
  success: boolean;
  message: string;
}

/** Payload for create_client_bono RPC */
export interface CreateBonoPayload {
  client_id: string;
  variant_id: string;
  service_id: string;
  company_id: string;
  sessions_total: number;
  expires_at?: string | null;
}
