## 2024-05-22 - Insecure Cryptography in Edge Helpers
**Vulnerability:** The `encryptContent` function in `src/app/lib/edge-functions.helper.ts` implemented "security theater" by generating a random AES key, encrypting the content, and then *appending the key to the ciphertext* before returning it.
**Learning:** This pattern completely defeats the purpose of encryption, as anyone who intercepts the message has the key to decrypt it. It likely arose from a misunderstanding of how to handle symmetric keys or a desire to "just make it work" without proper key exchange.
**Prevention:**
1.  **Transport Layer Security (TLS):** For communication between the client and Supabase Edge Functions, HTTPS is already sufficient to protect data in transit. Additional application-level encryption is often unnecessary unless end-to-end encryption (where the server cannot read the data) is required.
2.  **Proper Key Management:** If client-side encryption is needed (e.g., for E2EE), the encryption key must *never* be sent with the ciphertext. It should be derived from a user secret (password) or negotiated via a secure key exchange protocol (like Diffie-Hellman or using public-key cryptography).
3.  **Review Crypto Code:** Any code using `crypto.subtle` or other cryptographic primitives should be flagged for expert review. "Rolling your own" crypto protocols is a classic security pitfall.
