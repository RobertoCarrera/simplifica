import { Address } from "./address";

export interface Company {

  _id: string,
  created_at: Date,
  nombre: string,
  direccion_id: Address,
  cif: string,
  telefono: string,
  email: string,
  fecha_alta: Date,
  favicon: File | null,
  usuario_id: string
}