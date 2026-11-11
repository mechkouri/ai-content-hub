// embedded-postgres is ESM-only and ships types that the API's CommonJS module resolution
// cannot see. Only the surface the test helpers use is declared.
declare module 'embedded-postgres' {
  export interface EmbeddedPostgresOptions {
    databaseDir: string;
    user: string;
    password: string;
    port: number;
    persistent: boolean;
    onLog?: (message: unknown) => void;
    onError?: (message: unknown) => void;
  }
  export default class EmbeddedPostgres {
    constructor(options: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
  }
}
