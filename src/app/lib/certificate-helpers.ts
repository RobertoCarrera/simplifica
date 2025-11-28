// Dynamically import node-forge to keep it out of the initial bundle

export interface ParsedCertificateInfo {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  serialNumber?: string;
  publicKeyAlgorithm?: string;
}

export interface ProcessedCertificatePayload {
  // Plain PEM values - encryption happens server-side
  certPem: string;
  keyPem: string;
  keyPass?: string | null;
  rawCertInfo: ParsedCertificateInfo;
  originalFileTypes: string[];
  sizes: {
    certPemLength: number;
    keyPemLength: number;
  };
  needsPassphrase: boolean;
}

export function detectFileType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.p12') || lower.endsWith('.pfx')) return 'pkcs12';
  if (lower.endsWith('.pem')) return 'pem';
  if (lower.endsWith('.crt') || lower.endsWith('.cer')) return 'crt';
  if (lower.endsWith('.key')) return 'key';
  return 'unknown';
}

export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Parse PKCS#12 buffer into PEM cert + key using node-forge
export async function parsePkcs12(buffer: ArrayBuffer, passphrase: string): Promise<{ certPem: string; keyPem: string; info: ParsedCertificateInfo }> {
  const forge: any = await import('node-forge');
  const binary = arrayBufferToBinaryString(buffer);
  const p12Asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase || '');

  let certPem = '';
  let keyPem = '';
  let certObj: any = null;

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      // Access oid names via bracket notation due to index signature
      if (safeBag.type === forge.pki.oids['certBag']) {
        if (safeBag.cert) {
          certObj = safeBag.cert;
          certPem = forge.pki.certificateToPem(safeBag.cert);
        }
      } else if (safeBag.type === forge.pki.oids['pkcs8ShroudedKeyBag'] || safeBag.type === forge.pki.oids['keyBag']) {
        if (safeBag.key) {
          keyPem = forge.pki.privateKeyToPem(safeBag.key);
        }
      }
    }
  }

  if (!certPem || !keyPem || !certObj) {
    throw new Error('No se pudo extraer certificado y clave del PKCS#12');
  }

  const info: ParsedCertificateInfo = {
    subject: dnToString(certObj.subject),
    issuer: dnToString(certObj.issuer),
    notBefore: certObj.validity.notBefore.toISOString(),
    notAfter: certObj.validity.notAfter.toISOString(),
    serialNumber: certObj.serialNumber,
    publicKeyAlgorithm: certObj.publicKey?.algorithm?.name
  };

  return { certPem, keyPem, info };
}

export function dnToString(dn: any): string {
  return dn.attributes.map((attr: any) => `${attr.shortName || attr.name}=${attr.value}`).join(', ');
}

function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return binary;
}
