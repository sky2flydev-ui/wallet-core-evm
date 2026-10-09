import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseVault, serializeVault, type Vault } from './vault.js';

export interface SecureVaultStore {
  save(vault: Vault): Promise<void>;
  load(): Promise<Vault>;
  remove(): Promise<void>;
}
export class EncryptedFileVaultStore implements SecureVaultStore {
  constructor(private readonly filePath: string) {}
  async save(vault: Vault): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    const content = serializeVault(vault);
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await chmod(temporary, 0o600);
      await rename(temporary, this.filePath);
      await chmod(this.filePath, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async load(): Promise<Vault> {
    const metadata = await stat(this.filePath);
    if (!metadata.isFile()) throw new Error('Vault path is not a regular file');
    return parseVault(await readFile(this.filePath, 'utf8'));
  }
  async remove(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
