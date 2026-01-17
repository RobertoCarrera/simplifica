## 2026-01-17 - Removed Insecure Client-Side Encryption
**Vulnerability:** Found `encryptContent` function in `edge-functions.helper.ts` which performed client-side encryption but prepended the key to the ciphertext.
**Learning:** Client-side encryption should not be implemented unless keys are managed securely (e.g. not transmitted with data, or asymmetric encryption is used correctly). Implementing custom crypto protocols often leads to critical flaws like key exposure.
**Prevention:** Remove unused insecure crypto code immediately. For sensitive data transmission, rely on TLS (HTTPS) or established E2E encryption libraries if strictly necessary.
