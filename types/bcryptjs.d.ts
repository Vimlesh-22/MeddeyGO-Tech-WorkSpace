declare module "bcryptjs" {
  type Binary = string | Buffer;

  interface HashOptions {
    progressCallback?(percent: number): void;
  }

  export function genSalt(rounds?: number): Promise<string>;
  export function genSalt(rounds: number, callback: (err: Error | null, salt: string) => void): void;
  export function genSaltSync(rounds?: number): string;

  export function hash(data: Binary, salt: string | number, options?: HashOptions): Promise<string>;
  export function hash(
    data: Binary,
    salt: string | number,
    callback: (err: Error | null, encrypted: string) => void
  ): void;
  export function hash(
    data: Binary,
    salt: string | number,
    options: HashOptions,
    callback: (err: Error | null, encrypted: string) => void
  ): void;
  export function hashSync(data: Binary, salt: string | number): string;

  export function compare(data: Binary, encrypted: string): Promise<boolean>;
  export function compare(
    data: Binary,
    encrypted: string,
    callback: (err: Error | null, same: boolean) => void
  ): void;
  export function compareSync(data: Binary, encrypted: string): boolean;

  export function getSalt(encrypted: string): string;
  export function getRounds(encrypted: string): number;

  export const version: string;

  export interface BCrypt {
    genSalt: typeof genSalt;
    genSaltSync: typeof genSaltSync;
    hash: typeof hash;
    hashSync: typeof hashSync;
    compare: typeof compare;
    compareSync: typeof compareSync;
    getSalt: typeof getSalt;
    getRounds: typeof getRounds;
    version: typeof version;
  }

  const bcrypt: BCrypt;
  export default bcrypt;
}
