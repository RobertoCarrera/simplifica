import { Address } from "./address";

export interface Customer {

  _id: string,
  created_at: Date,
  nombre: string,
  apellidos: string,
  direccion_id: string,
  direccion?: Address,
  dni: string,
  telefono: string,
  email: string,
  favicon: File | null,
  usuario_id: string
}