import { Service } from "./service";

export interface Work {

    _id: string,
    created_at: string,
    nombre: string,
    precio_hora: number,
    servicio_id: Service[]
}