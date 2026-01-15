import { Address } from "./address";

export interface Customer {
  _id?: string;
  id: string;
  created_at: string | Date;
  updated_at?: string;
  name: string;
  apellidos: string;
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
  // Arbitrary metadata (JSONB) from server imports and flags like needs_attention/inactive_on_import
  metadata?: any;
  // Campos adicionales para funcionalidad extendida
  address?: string;
  activo?: boolean;
  fecha_nacimiento?: string;
  birth_date?: string | Date;
  profesion?: string;
  empresa?: string;

  // GDPR Compliance Fields
  marketing_consent?: boolean;
  marketing_consent_date?: string;
  marketing_consent_method?: string;
  data_processing_consent?: boolean;
  data_processing_consent_date?: string;
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
  loyalty_points_balance?: number;
  tags?: any[]; // GlobalTag[] loaded dynamically
}

// Interface para crear cliente (sin ID)
export interface CreateCustomer extends Omit<Customer, 'id' | 'created_at' | 'updated_at'> { }

// Interface para crear cliente en DEV mode (usuario_id opcional)
export interface CreateCustomerDev extends Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'usuario_id'> {
  usuario_id?: string;
}

// Interface para actualizar cliente (campos opcionales)
export interface UpdateCustomer extends Partial<Omit<Customer, 'id' | 'created_at'>> { }