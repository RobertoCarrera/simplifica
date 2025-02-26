import { Address } from "./address";

export interface Customer {

  _id: string,
  created_at: Date,
  nombre: string,
  apellidos: string,
  direccion: Address,
  dni: string,
  telefono: string,
  email: string,
  fecha_alta: Date,
  favicon: File | null,
  usuario_id: string
}