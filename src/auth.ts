import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
const token = () => randomBytes(32).toString('base64url');
const shortCode = () => String(randomInt(0, 10_000)).padStart(4, '0');
function equal(a: string, b: string) { return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export class Pairing {
  private ticket = shortCode();
  private expires: number;
  private secrets = new Map<string, boolean>();
  constructor(private now = Date.now, private maximum = 4) { this.expires = now() + 5 * 60_000; }
  get invitation() { return this.ticket; }
  exchange(value: string) {
    if (this.secrets.size >= this.maximum || this.now() >= this.expires || !equal(value, this.ticket)) return undefined;
    const secret = token(); this.secrets.set(secret, false); return secret;
  }
  private key(value: string) { return [...this.secrets.keys()].find(secret => equal(value, secret)); }
  valid(value: string) { return !!this.key(value); }
  acquire(value: string) { const secret = this.key(value); if (!secret || this.secrets.get(secret)) return false; this.secrets.set(secret, true); return true; }
  release(value: string) { const secret = this.key(value); if (secret) this.secrets.set(secret, false); }
  revoke() { this.secrets.clear(); this.ticket = ''; this.expires = 0; }
}
