/**
 * VeriFactu XML Generator
 * Genera XML según especificación Orden HAC/1177/2024 (BOE-A-2024-22138)
 * 
 * Estructura:
 * - Bloque 1: Cabecera (información común para remisiones)
 * - Bloque 2: RegistroFactura (1-1000 por envío)
 * - Bloque 3: RegistroAlta (datos de factura de alta)
 * - Bloque 4: RegistroAnulacion (datos de factura anulada)
 */

// Namespace oficial VeriFactu
const VERIFACTU_NS = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/verifactu/ws/SuministroLR.xsd';
const VERIFACTU_PREFIX = 'sf';

export interface SistemaInformatico {
  nifProducer: string;           // NIF del productor del software
  nombreRazon: string;           // Nombre o razón social
  idSistema: string;             // Código identificador sistema
  nombreSistema: string;         // Nombre del sistema
  version: string;               // Versión del sistema
  numInstalacion: string;        // Número de instalación
  tipoUsoPosible: 'S' | 'N';     // Solo VERIFACTU
  tipoUsoMultiOT: 'S' | 'N';     // Multiusuario
}

export interface Cabecera {
  obligadoEmision: {
    nif: string;
    nombreRazon: string;
  };
  sistema: SistemaInformatico;
  fechaFinVerifactu?: string;    // Para renuncia a VERIFACTU
  incidenciaTecnica?: 'S' | 'N'; // Si hubo incidencia
  refRequerimiento?: string;     // Si es respuesta a requerimiento
}

export interface DesgloseIVA {
  claveRegimen: string;          // 01-20 según lista BOE
  calificacionOperacion: string; // S1, S2, N1, N2
  tipoImpositivo?: number;
  baseImponible: number;
  cuotaRepercutida?: number;
  tipoRE?: number;               // Recargo equivalencia
  cuotaRE?: number;
}

export interface RegistroAlta {
  idFactura: {
    nifEmisor: string;
    numSerieFactura: string;
    fechaExpedicion: string;     // DD-MM-YYYY
  };
  refExterna?: string;
  nombreRazonEmisor: string;
  subsanacion?: 'S' | 'N';
  rechazoPrevio?: 'N' | 'S' | 'X';
  tipoFactura: 'F1' | 'F2' | 'F3' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  tipoRectificativa?: 'S' | 'I'; // Sustitución o Diferencias
  facturasRectificadas?: Array<{
    idFactura: {
      nifEmisor: string;
      numSerieFactura: string;
      fechaExpedicion: string;
    };
  }>;
  facturasSustituidas?: Array<{
    idFactura: {
      nifEmisor: string;
      numSerieFactura: string;
      fechaExpedicion: string;
    };
  }>;
  importeRectificacion?: {
    baseRectificada: number;
    cuotaRectificada: number;
    cuotaRecargoRectificado?: number;
  };
  fechaOperacion?: string;
  descripcionOperacion: string;
  facturaSinId?: 'S' | 'N';
  facturaDptoAduanas?: 'S' | 'N';
  facturaPendiente?: 'S' | 'N';
  destinatario?: {
    nif?: string;
    idOtro?: {
      codigoPais: string;
      idType: '02' | '03' | '04' | '05' | '06' | '07';
      id: string;
    };
    nombreRazon: string;
  };
  tercero?: {
    nif?: string;
    idOtro?: {
      codigoPais: string;
      idType: '02' | '03' | '04' | '05' | '06' | '07';
      id: string;
    };
    nombreRazon: string;
  };
  cupon?: 'S' | 'N';
  desglose: {
    tipoDesglose: 'D' | 'T';     // Destinatario o Tercero
    claveRegimen: string;
    calificacionOp: string;
    operacionExenta?: string;
    porcentaje?: number;
    baseImponibleOImporteNoSujeto: number;
    cuotaRepercutida?: number;
    tipoRecargoEquiv?: number;
    cuotaRecargoEquiv?: number;
  }[];
  cuotaTotal: number;
  importeTotal: number;
  encadenamientoFacturaAnterior?: {
    nifEmisorFacturaAnterior: string;
    numSerieFacturaAnterior: string;
    fechaExpedicionFacturaAnterior: string;
    huella: string;              // Primeros 64 chars del hash anterior
  };
  sistemaInformatico: SistemaInformatico;
  fechaHoraHusoGenRegistro: string;  // YYYY-MM-DDTHH:MM:SS+HH:MM
  huella: string;                     // Hash SHA-256 del registro
  idVersion: '1.0';
}

export interface RegistroAnulacion {
  idFactura: {
    nifEmisor: string;
    numSerieFactura: string;
    fechaExpedicion: string;
  };
  refExterna?: string;
  sinRegistroPrevio?: 'S' | 'N';
  rechazoPrevioAnulacion?: 'N' | 'S';
  generadoPor: 'E' | 'D' | 'T';   // Expedidor, Destinatario, Tercero
  generador?: {
    nif?: string;
    idOtro?: {
      codigoPais: string;
      idType: string;
      id: string;
    };
    nombreRazon: string;
  };
  encadenamientoFacturaAnterior?: {
    nifEmisorFacturaAnterior: string;
    numSerieFacturaAnterior: string;
    fechaExpedicionFacturaAnterior: string;
    huella: string;
  };
  sistemaInformatico: SistemaInformatico;
  fechaHoraHusoGenRegistro: string;
  huella: string;
  idVersion: '1.0';
}

/**
 * Escapa caracteres especiales para XML
 */
function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formatea número con 2 decimales
 */
function formatDecimal(num: number): string {
  return num.toFixed(2);
}

/**
 * Formatea fecha de DD/MM/YYYY o ISO a DD-MM-YYYY (formato AEAT)
 */
export function formatDateAEAT(dateStr: string): string {
  // Si ya está en formato AEAT
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
  
  // Si es ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [year, month, day] = dateStr.split('T')[0].split('-');
    return `${day}-${month}-${year}`;
  }
  
  // Si es DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return dateStr.replace(/\//g, '-');
  }
  
  // Intentar parsear como Date
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
  
  throw new Error(`Invalid date format: ${dateStr}`);
}

/**
 * Genera timestamp con huso horario para AEAT
 * Formato: YYYY-MM-DDTHH:MM:SS+HH:MM
 */
export function generateTimestamp(): string {
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const mins = String(Math.abs(offset) % 60).padStart(2, '0');
  
  return now.toISOString().slice(0, 19) + sign + hours + ':' + mins;
}

/**
 * Genera bloque SistemaInformatico XML
 */
function generateSistemaInformaticoXml(sistema: SistemaInformatico): string {
  return `
    <${VERIFACTU_PREFIX}:SistemaInformatico>
      <${VERIFACTU_PREFIX}:NombreRazon>${escapeXml(sistema.nombreRazon)}</${VERIFACTU_PREFIX}:NombreRazon>
      <${VERIFACTU_PREFIX}:NIF>${escapeXml(sistema.nifProducer)}</${VERIFACTU_PREFIX}:NIF>
      <${VERIFACTU_PREFIX}:NombreSistemaInformatico>${escapeXml(sistema.nombreSistema)}</${VERIFACTU_PREFIX}:NombreSistemaInformatico>
      <${VERIFACTU_PREFIX}:IdSistemaInformatico>${escapeXml(sistema.idSistema)}</${VERIFACTU_PREFIX}:IdSistemaInformatico>
      <${VERIFACTU_PREFIX}:Version>${escapeXml(sistema.version)}</${VERIFACTU_PREFIX}:Version>
      <${VERIFACTU_PREFIX}:NumeroInstalacion>${escapeXml(sistema.numInstalacion)}</${VERIFACTU_PREFIX}:NumeroInstalacion>
      <${VERIFACTU_PREFIX}:TipoUsoPosibleSoloVerifactu>${sistema.tipoUsoPosible}</${VERIFACTU_PREFIX}:TipoUsoPosibleSoloVerifactu>
      <${VERIFACTU_PREFIX}:TipoUsoPosibleMultiOT>${sistema.tipoUsoMultiOT}</${VERIFACTU_PREFIX}:TipoUsoPosibleMultiOT>
    </${VERIFACTU_PREFIX}:SistemaInformatico>`;
}

/**
 * Genera bloque Cabecera XML
 */
function generateCabeceraXml(cabecera: Cabecera): string {
  let xml = `
  <${VERIFACTU_PREFIX}:Cabecera>
    <${VERIFACTU_PREFIX}:ObligadoEmision>
      <${VERIFACTU_PREFIX}:NombreRazon>${escapeXml(cabecera.obligadoEmision.nombreRazon)}</${VERIFACTU_PREFIX}:NombreRazon>
      <${VERIFACTU_PREFIX}:NIF>${escapeXml(cabecera.obligadoEmision.nif)}</${VERIFACTU_PREFIX}:NIF>
    </${VERIFACTU_PREFIX}:ObligadoEmision>
    ${generateSistemaInformaticoXml(cabecera.sistema)}`;
  
  if (cabecera.fechaFinVerifactu) {
    xml += `
    <${VERIFACTU_PREFIX}:FechaFinVeriFactu>${cabecera.fechaFinVerifactu}</${VERIFACTU_PREFIX}:FechaFinVeriFactu>`;
  }
  
  if (cabecera.incidenciaTecnica) {
    xml += `
    <${VERIFACTU_PREFIX}:IndicadorIncidenciaTecnica>${cabecera.incidenciaTecnica}</${VERIFACTU_PREFIX}:IndicadorIncidenciaTecnica>`;
  }
  
  if (cabecera.refRequerimiento) {
    xml += `
    <${VERIFACTU_PREFIX}:RefRequerimiento>${escapeXml(cabecera.refRequerimiento)}</${VERIFACTU_PREFIX}:RefRequerimiento>`;
  }
  
  xml += `
  </${VERIFACTU_PREFIX}:Cabecera>`;
  
  return xml;
}

/**
 * Genera bloque RegistroAlta XML
 */
function generateRegistroAltaXml(registro: RegistroAlta): string {
  let xml = `
      <${VERIFACTU_PREFIX}:RegistroAlta>
        <${VERIFACTU_PREFIX}:IDFactura>
          <${VERIFACTU_PREFIX}:IDEmisorFactura>${escapeXml(registro.idFactura.nifEmisor)}</${VERIFACTU_PREFIX}:IDEmisorFactura>
          <${VERIFACTU_PREFIX}:NumSerieFactura>${escapeXml(registro.idFactura.numSerieFactura)}</${VERIFACTU_PREFIX}:NumSerieFactura>
          <${VERIFACTU_PREFIX}:FechaExpedicionFactura>${registro.idFactura.fechaExpedicion}</${VERIFACTU_PREFIX}:FechaExpedicionFactura>
        </${VERIFACTU_PREFIX}:IDFactura>`;
  
  if (registro.refExterna) {
    xml += `
        <${VERIFACTU_PREFIX}:RefExterna>${escapeXml(registro.refExterna)}</${VERIFACTU_PREFIX}:RefExterna>`;
  }
  
  xml += `
        <${VERIFACTU_PREFIX}:NombreRazonEmisor>${escapeXml(registro.nombreRazonEmisor)}</${VERIFACTU_PREFIX}:NombreRazonEmisor>`;
  
  if (registro.subsanacion) {
    xml += `
        <${VERIFACTU_PREFIX}:Subsanacion>${registro.subsanacion}</${VERIFACTU_PREFIX}:Subsanacion>`;
  }
  
  if (registro.rechazoPrevio) {
    xml += `
        <${VERIFACTU_PREFIX}:RechazoPrevio>${registro.rechazoPrevio}</${VERIFACTU_PREFIX}:RechazoPrevio>`;
  }
  
  xml += `
        <${VERIFACTU_PREFIX}:TipoFactura>${registro.tipoFactura}</${VERIFACTU_PREFIX}:TipoFactura>`;
  
  if (registro.tipoRectificativa) {
    xml += `
        <${VERIFACTU_PREFIX}:TipoRectificativa>${registro.tipoRectificativa}</${VERIFACTU_PREFIX}:TipoRectificativa>`;
  }
  
  // Facturas rectificadas
  if (registro.facturasRectificadas && registro.facturasRectificadas.length > 0) {
    xml += `
        <${VERIFACTU_PREFIX}:FacturasRectificadas>`;
    for (const fr of registro.facturasRectificadas) {
      xml += `
          <${VERIFACTU_PREFIX}:IDFacturaRectificada>
            <${VERIFACTU_PREFIX}:IDEmisorFactura>${escapeXml(fr.idFactura.nifEmisor)}</${VERIFACTU_PREFIX}:IDEmisorFactura>
            <${VERIFACTU_PREFIX}:NumSerieFactura>${escapeXml(fr.idFactura.numSerieFactura)}</${VERIFACTU_PREFIX}:NumSerieFactura>
            <${VERIFACTU_PREFIX}:FechaExpedicionFactura>${fr.idFactura.fechaExpedicion}</${VERIFACTU_PREFIX}:FechaExpedicionFactura>
          </${VERIFACTU_PREFIX}:IDFacturaRectificada>`;
    }
    xml += `
        </${VERIFACTU_PREFIX}:FacturasRectificadas>`;
  }
  
  // Importe rectificación
  if (registro.importeRectificacion) {
    xml += `
        <${VERIFACTU_PREFIX}:ImporteRectificacion>
          <${VERIFACTU_PREFIX}:BaseRectificada>${formatDecimal(registro.importeRectificacion.baseRectificada)}</${VERIFACTU_PREFIX}:BaseRectificada>
          <${VERIFACTU_PREFIX}:CuotaRectificada>${formatDecimal(registro.importeRectificacion.cuotaRectificada)}</${VERIFACTU_PREFIX}:CuotaRectificada>`;
    if (registro.importeRectificacion.cuotaRecargoRectificado !== undefined) {
      xml += `
          <${VERIFACTU_PREFIX}:CuotaRecargoRectificado>${formatDecimal(registro.importeRectificacion.cuotaRecargoRectificado)}</${VERIFACTU_PREFIX}:CuotaRecargoRectificado>`;
    }
    xml += `
        </${VERIFACTU_PREFIX}:ImporteRectificacion>`;
  }
  
  if (registro.fechaOperacion) {
    xml += `
        <${VERIFACTU_PREFIX}:FechaOperacion>${registro.fechaOperacion}</${VERIFACTU_PREFIX}:FechaOperacion>`;
  }
  
  xml += `
        <${VERIFACTU_PREFIX}:DescripcionOperacion>${escapeXml(registro.descripcionOperacion)}</${VERIFACTU_PREFIX}:DescripcionOperacion>`;
  
  if (registro.facturaSinId) {
    xml += `
        <${VERIFACTU_PREFIX}:FacturaSinIdentifDestinatarioArt61d>${registro.facturaSinId}</${VERIFACTU_PREFIX}:FacturaSinIdentifDestinatarioArt61d>`;
  }
  
  if (registro.facturaDptoAduanas) {
    xml += `
        <${VERIFACTU_PREFIX}:FacturaDeptoAduanas>${registro.facturaDptoAduanas}</${VERIFACTU_PREFIX}:FacturaDeptoAduanas>`;
  }
  
  // Destinatario
  if (registro.destinatario) {
    xml += `
        <${VERIFACTU_PREFIX}:Destinatarios>
          <${VERIFACTU_PREFIX}:IDDestinatario>`;
    if (registro.destinatario.nif) {
      xml += `
            <${VERIFACTU_PREFIX}:NIF>${escapeXml(registro.destinatario.nif)}</${VERIFACTU_PREFIX}:NIF>`;
    } else if (registro.destinatario.idOtro) {
      xml += `
            <${VERIFACTU_PREFIX}:IDOtro>
              <${VERIFACTU_PREFIX}:CodigoPais>${registro.destinatario.idOtro.codigoPais}</${VERIFACTU_PREFIX}:CodigoPais>
              <${VERIFACTU_PREFIX}:IDType>${registro.destinatario.idOtro.idType}</${VERIFACTU_PREFIX}:IDType>
              <${VERIFACTU_PREFIX}:ID>${escapeXml(registro.destinatario.idOtro.id)}</${VERIFACTU_PREFIX}:ID>
            </${VERIFACTU_PREFIX}:IDOtro>`;
    }
    xml += `
            <${VERIFACTU_PREFIX}:NombreRazon>${escapeXml(registro.destinatario.nombreRazon)}</${VERIFACTU_PREFIX}:NombreRazon>
          </${VERIFACTU_PREFIX}:IDDestinatario>
        </${VERIFACTU_PREFIX}:Destinatarios>`;
  }
  
  if (registro.cupon) {
    xml += `
        <${VERIFACTU_PREFIX}:Cupon>${registro.cupon}</${VERIFACTU_PREFIX}:Cupon>`;
  }
  
  // Desglose
  xml += `
        <${VERIFACTU_PREFIX}:Desglose>`;
  for (const d of registro.desglose) {
    xml += `
          <${VERIFACTU_PREFIX}:DetalleDesglose>
            <${VERIFACTU_PREFIX}:ClaveRegimen>${d.claveRegimen}</${VERIFACTU_PREFIX}:ClaveRegimen>
            <${VERIFACTU_PREFIX}:CalificacionOperacion>${d.calificacionOp}</${VERIFACTU_PREFIX}:CalificacionOperacion>`;
    
    if (d.operacionExenta) {
      xml += `
            <${VERIFACTU_PREFIX}:OperacionExenta>${d.operacionExenta}</${VERIFACTU_PREFIX}:OperacionExenta>`;
    }
    
    if (d.porcentaje !== undefined) {
      xml += `
            <${VERIFACTU_PREFIX}:TipoImpositivo>${formatDecimal(d.porcentaje)}</${VERIFACTU_PREFIX}:TipoImpositivo>`;
    }
    
    xml += `
            <${VERIFACTU_PREFIX}:BaseImponibleOImporteNoSujeto>${formatDecimal(d.baseImponibleOImporteNoSujeto)}</${VERIFACTU_PREFIX}:BaseImponibleOImporteNoSujeto>`;
    
    if (d.cuotaRepercutida !== undefined) {
      xml += `
            <${VERIFACTU_PREFIX}:CuotaRepercutida>${formatDecimal(d.cuotaRepercutida)}</${VERIFACTU_PREFIX}:CuotaRepercutida>`;
    }
    
    if (d.tipoRecargoEquiv !== undefined) {
      xml += `
            <${VERIFACTU_PREFIX}:TipoRecargoEquivalencia>${formatDecimal(d.tipoRecargoEquiv)}</${VERIFACTU_PREFIX}:TipoRecargoEquivalencia>`;
    }
    
    if (d.cuotaRecargoEquiv !== undefined) {
      xml += `
            <${VERIFACTU_PREFIX}:CuotaRecargoEquivalencia>${formatDecimal(d.cuotaRecargoEquiv)}</${VERIFACTU_PREFIX}:CuotaRecargoEquivalencia>`;
    }
    
    xml += `
          </${VERIFACTU_PREFIX}:DetalleDesglose>`;
  }
  xml += `
        </${VERIFACTU_PREFIX}:Desglose>`;
  
  xml += `
        <${VERIFACTU_PREFIX}:CuotaTotal>${formatDecimal(registro.cuotaTotal)}</${VERIFACTU_PREFIX}:CuotaTotal>
        <${VERIFACTU_PREFIX}:ImporteTotal>${formatDecimal(registro.importeTotal)}</${VERIFACTU_PREFIX}:ImporteTotal>`;
  
  // Encadenamiento
  if (registro.encadenamientoFacturaAnterior) {
    xml += `
        <${VERIFACTU_PREFIX}:Encadenamiento>
          <${VERIFACTU_PREFIX}:RegistroAnterior>
            <${VERIFACTU_PREFIX}:IDEmisorFactura>${escapeXml(registro.encadenamientoFacturaAnterior.nifEmisorFacturaAnterior)}</${VERIFACTU_PREFIX}:IDEmisorFactura>
            <${VERIFACTU_PREFIX}:NumSerieFactura>${escapeXml(registro.encadenamientoFacturaAnterior.numSerieFacturaAnterior)}</${VERIFACTU_PREFIX}:NumSerieFactura>
            <${VERIFACTU_PREFIX}:FechaExpedicionFactura>${registro.encadenamientoFacturaAnterior.fechaExpedicionFacturaAnterior}</${VERIFACTU_PREFIX}:FechaExpedicionFactura>
            <${VERIFACTU_PREFIX}:Huella>${registro.encadenamientoFacturaAnterior.huella}</${VERIFACTU_PREFIX}:Huella>
          </${VERIFACTU_PREFIX}:RegistroAnterior>
        </${VERIFACTU_PREFIX}:Encadenamiento>`;
  } else {
    xml += `
        <${VERIFACTU_PREFIX}:Encadenamiento>
          <${VERIFACTU_PREFIX}:PrimerRegistro>S</${VERIFACTU_PREFIX}:PrimerRegistro>
        </${VERIFACTU_PREFIX}:Encadenamiento>`;
  }
  
  xml += generateSistemaInformaticoXml(registro.sistemaInformatico);
  
  xml += `
        <${VERIFACTU_PREFIX}:FechaHoraHusoGenRegistro>${registro.fechaHoraHusoGenRegistro}</${VERIFACTU_PREFIX}:FechaHoraHusoGenRegistro>
        <${VERIFACTU_PREFIX}:TipoHuella>01</${VERIFACTU_PREFIX}:TipoHuella>
        <${VERIFACTU_PREFIX}:Huella>${registro.huella}</${VERIFACTU_PREFIX}:Huella>
      </${VERIFACTU_PREFIX}:RegistroAlta>`;
  
  return xml;
}

/**
 * Genera bloque RegistroAnulacion XML
 */
function generateRegistroAnulacionXml(registro: RegistroAnulacion): string {
  let xml = `
      <${VERIFACTU_PREFIX}:RegistroAnulacion>
        <${VERIFACTU_PREFIX}:IDFactura>
          <${VERIFACTU_PREFIX}:IDEmisorFactura>${escapeXml(registro.idFactura.nifEmisor)}</${VERIFACTU_PREFIX}:IDEmisorFactura>
          <${VERIFACTU_PREFIX}:NumSerieFactura>${escapeXml(registro.idFactura.numSerieFactura)}</${VERIFACTU_PREFIX}:NumSerieFactura>
          <${VERIFACTU_PREFIX}:FechaExpedicionFactura>${registro.idFactura.fechaExpedicion}</${VERIFACTU_PREFIX}:FechaExpedicionFactura>
        </${VERIFACTU_PREFIX}:IDFactura>`;
  
  if (registro.refExterna) {
    xml += `
        <${VERIFACTU_PREFIX}:RefExterna>${escapeXml(registro.refExterna)}</${VERIFACTU_PREFIX}:RefExterna>`;
  }
  
  if (registro.sinRegistroPrevio) {
    xml += `
        <${VERIFACTU_PREFIX}:SinRegistroPrevio>${registro.sinRegistroPrevio}</${VERIFACTU_PREFIX}:SinRegistroPrevio>`;
  }
  
  if (registro.rechazoPrevioAnulacion) {
    xml += `
        <${VERIFACTU_PREFIX}:RechazoPrevioAnulacion>${registro.rechazoPrevioAnulacion}</${VERIFACTU_PREFIX}:RechazoPrevioAnulacion>`;
  }
  
  xml += `
        <${VERIFACTU_PREFIX}:GeneradoPor>${registro.generadoPor}</${VERIFACTU_PREFIX}:GeneradoPor>`;
  
  if (registro.generador) {
    xml += `
        <${VERIFACTU_PREFIX}:Generador>`;
    if (registro.generador.nif) {
      xml += `
          <${VERIFACTU_PREFIX}:NIF>${escapeXml(registro.generador.nif)}</${VERIFACTU_PREFIX}:NIF>`;
    } else if (registro.generador.idOtro) {
      xml += `
          <${VERIFACTU_PREFIX}:IDOtro>
            <${VERIFACTU_PREFIX}:CodigoPais>${registro.generador.idOtro.codigoPais}</${VERIFACTU_PREFIX}:CodigoPais>
            <${VERIFACTU_PREFIX}:IDType>${registro.generador.idOtro.idType}</${VERIFACTU_PREFIX}:IDType>
            <${VERIFACTU_PREFIX}:ID>${escapeXml(registro.generador.idOtro.id)}</${VERIFACTU_PREFIX}:ID>
          </${VERIFACTU_PREFIX}:IDOtro>`;
    }
    xml += `
          <${VERIFACTU_PREFIX}:NombreRazon>${escapeXml(registro.generador.nombreRazon)}</${VERIFACTU_PREFIX}:NombreRazon>
        </${VERIFACTU_PREFIX}:Generador>`;
  }
  
  // Encadenamiento
  if (registro.encadenamientoFacturaAnterior) {
    xml += `
        <${VERIFACTU_PREFIX}:Encadenamiento>
          <${VERIFACTU_PREFIX}:RegistroAnterior>
            <${VERIFACTU_PREFIX}:IDEmisorFactura>${escapeXml(registro.encadenamientoFacturaAnterior.nifEmisorFacturaAnterior)}</${VERIFACTU_PREFIX}:IDEmisorFactura>
            <${VERIFACTU_PREFIX}:NumSerieFactura>${escapeXml(registro.encadenamientoFacturaAnterior.numSerieFacturaAnterior)}</${VERIFACTU_PREFIX}:NumSerieFactura>
            <${VERIFACTU_PREFIX}:FechaExpedicionFactura>${registro.encadenamientoFacturaAnterior.fechaExpedicionFacturaAnterior}</${VERIFACTU_PREFIX}:FechaExpedicionFactura>
            <${VERIFACTU_PREFIX}:Huella>${registro.encadenamientoFacturaAnterior.huella}</${VERIFACTU_PREFIX}:Huella>
          </${VERIFACTU_PREFIX}:RegistroAnterior>
        </${VERIFACTU_PREFIX}:Encadenamiento>`;
  } else {
    xml += `
        <${VERIFACTU_PREFIX}:Encadenamiento>
          <${VERIFACTU_PREFIX}:PrimerRegistro>S</${VERIFACTU_PREFIX}:PrimerRegistro>
        </${VERIFACTU_PREFIX}:Encadenamiento>`;
  }
  
  xml += generateSistemaInformaticoXml(registro.sistemaInformatico);
  
  xml += `
        <${VERIFACTU_PREFIX}:FechaHoraHusoGenRegistro>${registro.fechaHoraHusoGenRegistro}</${VERIFACTU_PREFIX}:FechaHoraHusoGenRegistro>
        <${VERIFACTU_PREFIX}:TipoHuella>01</${VERIFACTU_PREFIX}:TipoHuella>
        <${VERIFACTU_PREFIX}:Huella>${registro.huella}</${VERIFACTU_PREFIX}:Huella>
        <${VERIFACTU_PREFIX}:IDVersion>${registro.idVersion}</${VERIFACTU_PREFIX}:IDVersion>
      </${VERIFACTU_PREFIX}:RegistroAnulacion>`;
  
  return xml;
}

/**
 * Genera XML completo para envío a AEAT (SuministroLR)
 */
export function generateSuministroLRXml(
  cabecera: Cabecera,
  registros: Array<RegistroAlta | RegistroAnulacion>,
  isAnulacion: boolean = false
): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<${VERIFACTU_PREFIX}:RegFactuSistemaFacturacion xmlns:${VERIFACTU_PREFIX}="${VERIFACTU_NS}">`;
  
  xml += generateCabeceraXml(cabecera);
  
  for (const registro of registros) {
    xml += `
  <${VERIFACTU_PREFIX}:RegistroFactura>`;
    
    if (isAnulacion || 'generadoPor' in registro) {
      xml += generateRegistroAnulacionXml(registro as RegistroAnulacion);
    } else {
      xml += generateRegistroAltaXml(registro as RegistroAlta);
    }
    
    xml += `
  </${VERIFACTU_PREFIX}:RegistroFactura>`;
  }
  
  xml += `
</${VERIFACTU_PREFIX}:RegFactuSistemaFacturacion>`;
  
  return xml;
}

/**
 * Genera XML de un solo registro para conservación/exportación
 */
export function generateRegistroXml(
  registro: RegistroAlta | RegistroAnulacion,
  isAnulacion: boolean = false
): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>`;
  
  if (isAnulacion || 'generadoPor' in registro) {
    xml += `
<${VERIFACTU_PREFIX}:RegistroAnulacion xmlns:${VERIFACTU_PREFIX}="${VERIFACTU_NS}">`;
    xml += generateRegistroAnulacionXml(registro as RegistroAnulacion).trim();
    xml += `
</${VERIFACTU_PREFIX}:RegistroAnulacion>`;
  } else {
    xml += `
<${VERIFACTU_PREFIX}:RegistroAlta xmlns:${VERIFACTU_PREFIX}="${VERIFACTU_NS}">`;
    xml += generateRegistroAltaXml(registro as RegistroAlta).trim();
    xml += `
</${VERIFACTU_PREFIX}:RegistroAlta>`;
  }
  
  return xml;
}
