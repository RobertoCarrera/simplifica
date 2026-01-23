import qrcode from "https://esm.sh/qrcode-generator@1.4.4";

try {
  const qr = qrcode(0, 'M');
  qr.addData('https://example.com');
  qr.make();
  console.log('SVG Tag:', qr.createSvgTag(4));
  console.log('Has createDataURL:', typeof qr.createDataURL === 'function');
} catch (e) {
  console.error(e);
}
