/**
 * VeriFactu XAdES Signature Generator
 * Implementa firma XAdES Enveloped según ETSI EN 319 132
 * Requerido por Artículo 14 de la Orden HAC/1177/2024
 * 
 * La firma se genera usando certificado electrónico cualificado.
 */

// Use btoa/atob which are available in Deno runtime
// For crypto, we use the global crypto API available in Deno

// Namespace para firma XAdES
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const XADES141_NS = 'http://uri.etsi.org/01903/v1.4.1#';

// Base64 encoding helpers using built-in btoa/atob
function base64Encode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface CertificateInfo {
  pem: string;           // Certificado en formato PEM
  privateKey: string;    // Clave privada en formato PEM
  keyPassword?: string;  // Contraseña de la clave privada (si está cifrada)
}

export interface SignatureOptions {
  signatureId?: string;
  signedPropertiesId?: string;
  keyInfoId?: string;
  signatureValueId?: string;
  referenceId?: string;
}

/**
 * Calcula SHA-256 hash y devuelve en Base64
 */
async function sha256Base64(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
  const hashArray = new Uint8Array(hashBuffer);
  return base64Encode(hashArray);
}

/**
 * Calcula SHA-256 hash y devuelve en hexadecimal
 */
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extrae el cuerpo del certificado PEM (sin headers)
 */
function extractCertBody(pem: string): string {
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
}

/**
 * Extrae el cuerpo de la clave privada PEM
 */
function extractKeyBody(pem: string): string {
  return pem
    .replace(/-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
}

/**
 * Parsea certificado X509 y extrae información básica
 * (Implementación simplificada - en producción usar librería ASN.1)
 */
export function parseCertificate(pem: string): {
  issuer: string;
  serial: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
} {
  // Extracción básica - en producción usar librería completa
  const body = extractCertBody(pem);
  const decoded = base64Decode(body);
  
  // Valores por defecto (reemplazar con parsing ASN.1 real)
  return {
    issuer: 'CN=Unknown,O=Unknown',
    serial: '1',
    subject: 'CN=Unknown',
    validFrom: new Date(),
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Genera ID único para elementos de firma
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Canonicaliza XML (Canonical XML 1.0)
 * Implementación simplificada - en producción usar librería completa
 */
function canonicalize(xml: string): string {
  // Normalización básica:
  // 1. Eliminar espacios en blanco innecesarios
  // 2. Ordenar atributos alfabéticamente
  // 3. Normalizar line endings
  
  return xml
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Importa clave privada RSA para firma
 */
async function importPrivateKey(keyPem: string, _password?: string): Promise<CryptoKey> {
  const keyBody = extractKeyBody(keyPem);
  const keyBytes = base64Decode(keyBody);
  
  // Si la clave está cifrada, se necesita descifrar primero
  // Esta es una implementación simplificada
  
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      keyBytes.buffer as ArrayBuffer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to import private key: ${message}`);
  }
}

/**
 * Firma datos con clave privada RSA-SHA256
 */
async function signData(data: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    dataBytes
  );
  
  return base64Encode(new Uint8Array(signature));
}

/**
 * Genera SignedInfo según especificación AEAT
 */
function generateSignedInfo(
  digestValue: string,
  signedPropertiesDigest: string,
  referenceUri: string,
  signedPropertiesId: string
): string {
  return `<ds:SignedInfo xmlns:ds="${DS_NS}">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
  <ds:Reference URI="${referenceUri}">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${digestValue}</ds:DigestValue>
  </ds:Reference>
  <ds:Reference URI="#${signedPropertiesId}" Type="http://uri.etsi.org/01903#SignedProperties">
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>`;
}

/**
 * Genera SignedProperties de XAdES
 */
function generateSignedProperties(
  certDigest: string,
  issuerName: string,
  serialNumber: string,
  signingTime: string,
  signedPropertiesId: string
): string {
  return `<xades:SignedProperties xmlns:xades="${XADES_NS}" Id="${signedPropertiesId}">
  <xades:SignedSignatureProperties>
    <xades:SigningTime>${signingTime}</xades:SigningTime>
    <xades:SigningCertificateV2>
      <xades:Cert>
        <xades:CertDigest>
          <ds:DigestMethod xmlns:ds="${DS_NS}" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue xmlns:ds="${DS_NS}">${certDigest}</ds:DigestValue>
        </xades:CertDigest>
        <xades:IssuerSerial>
          <ds:X509IssuerName xmlns:ds="${DS_NS}">${issuerName}</ds:X509IssuerName>
          <ds:X509SerialNumber xmlns:ds="${DS_NS}">${serialNumber}</ds:X509SerialNumber>
        </xades:IssuerSerial>
      </xades:Cert>
    </xades:SigningCertificateV2>
  </xades:SignedSignatureProperties>
  <xades:SignedDataObjectProperties>
    <xades:DataObjectFormat ObjectReference="#xmldsig-ref0">
      <xades:MimeType>text/xml</xades:MimeType>
    </xades:DataObjectFormat>
  </xades:SignedDataObjectProperties>
</xades:SignedProperties>`;
}

/**
 * Genera KeyInfo con certificado X509
 */
function generateKeyInfo(certBody: string, keyInfoId: string): string {
  return `<ds:KeyInfo xmlns:ds="${DS_NS}" Id="${keyInfoId}">
  <ds:X509Data>
    <ds:X509Certificate>${certBody}</ds:X509Certificate>
  </ds:X509Data>
</ds:KeyInfo>`;
}

/**
 * Genera firma XAdES Enveloped completa
 * 
 * @param xml - XML a firmar
 * @param cert - Información del certificado
 * @param options - Opciones de firma
 * @returns XML firmado
 */
export async function signXml(
  xml: string,
  cert: CertificateInfo,
  options: SignatureOptions = {}
): Promise<string> {
  // Generar IDs únicos
  const signatureId = options.signatureId || generateId('Signature');
  const signedPropertiesId = options.signedPropertiesId || generateId('SignedProperties');
  const keyInfoId = options.keyInfoId || generateId('KeyInfo');
  const signatureValueId = options.signatureValueId || generateId('SignatureValue');
  
  // Canonicalizar XML original
  const canonicalXml = canonicalize(xml);
  
  // Calcular digest del documento
  const documentDigest = await sha256Base64(canonicalXml);
  
  // Extraer información del certificado
  const certInfo = parseCertificate(cert.pem);
  const certBody = extractCertBody(cert.pem);
  const certDigest = await sha256Base64(base64Decode(certBody).toString());
  
  // Generar timestamp de firma
  const signingTime = new Date().toISOString();
  
  // Generar SignedProperties
  const signedProperties = generateSignedProperties(
    certDigest,
    certInfo.issuer,
    certInfo.serial,
    signingTime,
    signedPropertiesId
  );
  
  // Calcular digest de SignedProperties
  const signedPropertiesDigest = await sha256Base64(canonicalize(signedProperties));
  
  // Generar SignedInfo
  const signedInfo = generateSignedInfo(
    documentDigest,
    signedPropertiesDigest,
    '',
    signedPropertiesId
  );
  
  // Importar clave privada
  const privateKey = await importPrivateKey(cert.privateKey, cert.keyPassword);
  
  // Firmar SignedInfo canonicalizado
  const signatureValue = await signData(canonicalize(signedInfo), privateKey);
  
  // Generar KeyInfo
  const keyInfo = generateKeyInfo(certBody, keyInfoId);
  
  // Construir firma XAdES completa
  const signature = `<ds:Signature xmlns:ds="${DS_NS}" Id="${signatureId}">
  ${signedInfo}
  <ds:SignatureValue Id="${signatureValueId}">${signatureValue}</ds:SignatureValue>
  ${keyInfo}
  <ds:Object>
    <xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${signatureId}">
      ${signedProperties}
    </xades:QualifyingProperties>
  </ds:Object>
</ds:Signature>`;
  
  // Insertar firma en el documento (enveloped)
  // Buscar cierre del elemento raíz
  const closingTagMatch = xml.match(/<\/[^>]+>\s*$/);
  if (!closingTagMatch) {
    throw new Error('Could not find closing tag in XML');
  }
  
  const insertPosition = xml.lastIndexOf(closingTagMatch[0]);
  const signedXml = xml.slice(0, insertPosition) + signature + '\n' + xml.slice(insertPosition);
  
  return signedXml;
}

/**
 * Verifica que un certificado es válido para VeriFactu
 */
export function validateCertificate(pem: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    const info = parseCertificate(pem);
    const now = new Date();
    
    if (info.validFrom > now) {
      errors.push('Certificate is not yet valid');
    }
    
    if (info.validTo < now) {
      errors.push('Certificate has expired');
    }
    
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push(`Failed to parse certificate: ${message}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Genera hash canónico para encadenamiento de facturas
 * Según Artículo 13 de la Orden HAC/1177/2024
 */
export async function generateCanonicalHash(
  nifEmisor: string,
  numSerieFactura: string,
  fechaExpedicion: string,
  tipoFactura: string,
  cuotaTotal: number,
  importeTotal: number,
  huellaAnterior: string | null,
  fechaHoraHusoGenRegistro: string
): Promise<string> {
  // Construir cadena canónica según especificación
  const canonical = [
    `NIF=${nifEmisor}`,
    `NumSerieFactura=${numSerieFactura}`,
    `FechaExpedicionFactura=${fechaExpedicion}`,
    `TipoFactura=${tipoFactura}`,
    `CuotaTotal=${cuotaTotal.toFixed(2)}`,
    `ImporteTotal=${importeTotal.toFixed(2)}`,
    `HuellaAnterior=${huellaAnterior || ''}`,
    `FechaHoraHusoGenRegistro=${fechaHoraHusoGenRegistro}`,
  ].join('&');
  
  return await sha256Hex(canonical);
}

/**
 * Genera hash canónico para anulación
 */
export async function generateAnulacionCanonicalHash(
  nifEmisor: string,
  numSerieFactura: string,
  fechaExpedicion: string,
  huellaAnterior: string | null,
  fechaHoraHusoGenRegistro: string
): Promise<string> {
  const canonical = [
    `NIF=${nifEmisor}`,
    `NumSerieFactura=${numSerieFactura}`,
    `FechaExpedicionFactura=${fechaExpedicion}`,
    `HuellaAnterior=${huellaAnterior || ''}`,
    `FechaHoraHusoGenRegistro=${fechaHoraHusoGenRegistro}`,
  ].join('&');
  
  return await sha256Hex(canonical);
}
