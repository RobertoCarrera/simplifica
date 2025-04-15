import { Customer } from "./customer";
import { Service } from "./service";
import { TicketsStage } from "./tickets-stage";

export interface Ticket {

    _id: string,
    created_at: Date,
    cliente_id: string,
    estado_id: string[],
    contador: number,
    comentarios: string[],
    fecha_vencimiento: Date,
    cliente: Customer,
    estado: TicketsStage,
    servicios: Service[]
}