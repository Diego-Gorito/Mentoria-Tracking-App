/**
 * CLI helper pra gerar UM keypair libsodium (uso 1x por ambiente).
 *
 * Output em formato copiável pra Easypanel → tracking-api → Env tab.
 *
 * Run:
 *   npx tsx scripts/generate-libsodium-keypair.ts
 *     → imprime as 2 linhas no stdout
 *
 *   npx tsx scripts/generate-libsodium-keypair.ts --write-env-local
 *     → imprime no stdout E faz upsert das 2 vars em `.env.local` (CWD),
 *       preservando outras vars + comentários existentes. Cria o arquivo
 *       se não existir.
 *
 * Boa prática: rode SEM `--write-env-local` quando for gerar pra prod
 * (Easypanel) — assim a chave secret nunca toca o disco da sua máquina.
 *
 * @see docs/adr-0008a-mock-storage-mvp-addendum.md §3.2
 */

// NOTE: libsodium-wrappers@0.7.16 ESM bundle quebrado (ver workers/lib/storage/crypto.ts).
// Workaround temporário via createRequire.
import { createRequire } from 'module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers');

const ENV_KEYS = ['STORAGE_ENCRYPTION_PUBLIC_KEY', 'STORAGE_ENCRYPTION_SECRET_KEY'] as const;

interface ParsedArgs {
  writeEnvLocal: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  return {
    writeEnvLocal: argv.includes('--write-env-local'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printHelp(): void {
  process.stdout.write(
    `Usage: npx tsx scripts/generate-libsodium-keypair.ts [--write-env-local]\n\n` +
      `  --write-env-local   Upsert das 2 vars em .env.local (CWD) preservando outras.\n` +
      `  -h, --help          Mostra esta mensagem.\n`,
  );
}

/**
 * Upsert single var `KEY=value` numa string env-format:
 * - Se KEY já existe (qualquer valor) → substitui aquela linha
 * - Senão → append no fim com newline
 * Preserva comentários e outras vars. Match em line-start pra evitar
 * substituir KEY=... dentro de comentário.
 */
function upsertEnvVar(content: string, key: string, value: string): string {
  // ^KEY=... até newline (line-anchored, multiline flag).
  // Escape caracteres especiais do key (são todos A-Z_ aqui, mas defensivo).
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
  const line = `${key}=${value}`;

  if (regex.test(content)) {
    return content.replace(regex, line);
  }

  // Append — garante newline no fim do arquivo prévio + newline final.
  const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  return `${content}${sep}${line}\n`;
}

async function writeEnvLocal(publicKey: string, secretKey: string): Promise<void> {
  const envPath = resolve(process.cwd(), '.env.local');
  let current = '';
  try {
    current = await readFile(envPath, 'utf8');
  } catch (err) {
    // ENOENT é OK — vamos criar. Outros erros (permission, etc) propagam.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  let updated = upsertEnvVar(current, ENV_KEYS[0], publicKey);
  updated = upsertEnvVar(updated, ENV_KEYS[1], secretKey);

  await writeFile(envPath, updated, 'utf8');
  process.stdout.write(`\n✓ .env.local atualizado em ${envPath}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  await sodium.ready;

  const kp = sodium.crypto_box_keypair();
  const pub = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);
  const sec = sodium.to_base64(kp.privateKey, sodium.base64_variants.ORIGINAL);

  process.stdout.write(`STORAGE_ENCRYPTION_PUBLIC_KEY=${pub}\n`);
  process.stdout.write(`STORAGE_ENCRYPTION_SECRET_KEY=${sec}\n`);
  process.stdout.write(
    '\nCole essas 2 linhas no Easypanel → tracking-api → Env tab. NÃO commitar.\n',
  );

  if (args.writeEnvLocal) {
    await writeEnvLocal(pub, sec);
  }
}

main().catch((err) => {
  process.stderr.write(`Erro gerando keypair: ${String(err)}\n`);
  process.exit(1);
});

// Exports pra testes (não usados em runtime CLI)
export { parseArgs, upsertEnvVar };
