import { Product } from "./product";
import { Work } from "./work";

export interface Service {

    _id: string,
    created_at: Date,
    fecha_vencimiento: Date,
    unidades: number,
    servicio_id: string[],
    producto_id: string[],
    ticket_id: string,
    servicio: Work,
    producto: Product | null,
    finalizado: boolean
}