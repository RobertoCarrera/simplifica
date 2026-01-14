## 2025-02-18 - Broken Cryptography Implementation
**Vulnerability:** The `encryptContent` function in `src/app/lib/edge-functions.helper.ts` implements "encryption" by generating a symmetric key, encrypting the data, and then *prepending the raw key* to the output.
**Learning:** This defeats the purpose of encryption as the key is transmitted alongside the ciphertext (CWE-320). It indicates a misunderstanding of client-side encryption flows.
**Prevention:** Remove the function. Client-side encryption should use asymmetric encryption (encrypting with the server's public key) or established protocols (TLS) rather than ad-hoc symmetric encryption with bundled keys.
