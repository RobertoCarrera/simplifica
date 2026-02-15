import { Address } from "./address";

export interface Customer {
  _id?: string;
  id: string;
  created_at: string | Date;
  updated_at?: string;
  name: string;
  surname: string;
  dni: string;
  phone: string;
  // Tipo de cliente: persona física ('individual') o empresa ('business')
  client_type: 'individual' | 'business';
  // Campos específicos para empresas
  business_name?: string;              // Razón social (requerido si client_type = business)
  cif_nif?: string;                    // CIF/NIF empresarial (requerido si client_type = business)
  trade_name?: string;                 // Nombre comercial
  legal_representative_name?: string;  // Nombre del representante legal
  legal_representative_dni?: string;   // DNI del representante legal
  mercantile_registry_data?: any;      // Datos del registro mercantil (JSONB)
  // Legacy/localized aliases used across older components
  nombre?: string;
  telefono?: string;
  email: string;
  direccion_id?: string;
  direccion?: Address;
  avatar_url?: string;
  favicon?: string | null;
  usuario_id: string;
  auth_user_id?: string;
  // Arbitrary metadata (JSONB) from server imports and flags like needs_attention/inactive_on_import
  metadata?: any;
  // Campos adicionales para funcionalidad extendida
  address?: string;
  activo?: boolean;
  fecha_nacimiento?: string;
  profesion?: string;
  empresa?: string;
  // CRM Fields
  status?: 'lead' | 'prospect' | 'customer' | 'churned';
  source?: string;
  assigned_to?: string;
  industry?: string;
  tags?: string[];
  website?: string;

  // Billing Fields
  payment_method?: string;
  payment_terms?: string;
  iban?: string;
  bic?: string;
  currency?: string;
  tax_region?: string;
  billing_email?: string;
  credit_limit?: number;
  default_discount?: number;

  // Operational Fields
  language?: string;
  internal_notes?: string;

  // Pro CRM Fields
  tier?: 'A' | 'B' | 'C';
  contacts?: ClientContact[];

  // GDPR Compliance Fields
  consent_status?: 'pending' | 'accepted' | 'rejected' | 'revoked';
  marketing_consent?: boolean;
  marketing_consent_date?: string;
  marketing_consent_method?: string;

  // Granular Consents (New)
  health_data_consent?: boolean;
  privacy_policy_consent?: boolean;

  data_processing_consent?: boolean; // Deprecated or mapped to privacy/health
  data_processing_consent_date?: string;

  // Invitation Fields
  invitation_token?: string;
  invitation_status?: 'not_sent' | 'sent' | 'opened' | 'completed';
  invitation_sent_at?: string;

  data_processing_legal_basis?: string;
  data_retention_until?: string;
  deletion_requested_at?: string;
  deletion_reason?: string;
  anonymized_at?: string;
  is_minor?: boolean;
  notes?: string;
  parental_consent_verified?: boolean;
  parental_consent_date?: string;
  data_minimization_applied?: boolean;
  last_data_review_date?: string;
  access_restrictions?: any;
  last_accessed_at?: string;
  access_count?: number;
  devices?: { count?: number; id?: string; deleted_at?: string }[];
}

// Client Contact Interface
export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  is_primary?: boolean;
}

// Interface para crear cliente (sin ID)
export interface CreateCustomer extends Omit<Customer, 'id' | 'created_at' | 'updated_at'> { }

// Interface para crear cliente en DEV mode (usuario_id opcional)
export interface CreateCustomerDev extends Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'usuario_id'> {
  usuario_id?: string;
}

// Interface para actualizar cliente (campos opcionales)
export interface UpdateCustomer extends Partial<Omit<Customer, 'id' | 'created_at'>> { }