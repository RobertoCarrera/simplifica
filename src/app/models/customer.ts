import { Address } from "./address";

export interface Customer {
  id: string;
  created_at: string;
  updated_at?: string;
  nombre: string;
  apellidos: string;
  dni: string;
  telefono: string;
  email: string;
  direccion_id?: string;
  direccion?: Address;
  avatar_url?: string;
  usuario_id: string;
  // Campos adicionales para funcionalidad extendida
  notas?: string;
  activo?: boolean;
  fecha_nacimiento?: string;
  profesion?: string;
  empresa?: string;
}

// Interface para crear cliente (sin ID)
export interface CreateCustomer extends Omit<Customer, 'id' | 'created_at' | 'updated_at'> {}

// Interface para crear cliente en DEV mode (usuario_id opcional)
export interface CreateCustomerDev extends Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'usuario_id'> {
  usuario_id?: string;
}

// Interface para actualizar cliente (campos opcionales)
export interface UpdateCustomer extends Partial<Omit<Customer, 'id' | 'created_at'>> {}