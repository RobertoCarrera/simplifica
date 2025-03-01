import { Category } from "./category";
import { Customer } from "./customer";
import { ServiceStage } from "./service-stage";

export interface Service {

    _id: string,
    created_at: Date,
    contador: number,
    cliente_id: string,
    cliente: Customer,
    fecha_vencimiento: Date,
    estado_id: string,
    estado: ServiceStage,
    comentarios: string[],
    categoria_id: string[],
    categorias: Category[]
}