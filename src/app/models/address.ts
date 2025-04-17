import { Locality } from "./locality";

export interface Address {

    _id: string,
    created_at: Date,
    tipo_via: string,
    nombre: string,
    numero: string,
    localidad_id: string,
    localidad?: Locality
  }