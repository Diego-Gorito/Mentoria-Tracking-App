// Cifra um token de ad platform com a public key (libsodium sealed_box) pra popular
// tracking.ad_accounts.token_encrypted. Imprime SÓ o cipher (base64, cifrado — seguro).
// O token em plaintext nunca é impresso. Decifra só em prod com a secret key do env.
// Uso: META_SYSTEM_USER_TOKEN=... STORAGE_ENCRYPTION_PUBLIC_KEY=... npx tsx scripts/encrypt-meta-token.ts
import { sealEncrypt } from '../workers/lib/storage/crypto'

const token = process.env.META_SYSTEM_USER_TOKEN
const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY
if (!token || !pub) {
  console.error('Falta META_SYSTEM_USER_TOKEN ou STORAGE_ENCRYPTION_PUBLIC_KEY')
  process.exit(1)
}
const cipher = await sealEncrypt(token, pub)
console.log(cipher)
