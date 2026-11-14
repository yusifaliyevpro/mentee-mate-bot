import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "migrations");

class FakeStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...params: unknown[]): FakeStatement {
    return new FakeStatement(this.sqlite, this.sql, params as SQLInputValue[]);
  }

  async first<T>(): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.params);
    return (row ? { ...row } : null) as T | null;
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    const rows = this.sqlite.prepare(this.sql).all(...this.params);
    return { results: rows.map((row) => ({ ...row })) as T[], success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const { changes } = this.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(changes) } };
  }
}

/** A D1-compatible database backed by an in-memory SQLite, with the real migrations applied. */
export class FakeD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  private readonly pending: string[];

  /** Applies all migrations, or only the first `upTo` so a test can seed data and then `migrate()`. */
  constructor(upTo?: number) {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .toSorted();
    this.pending = files.slice(upTo ?? files.length);
    for (const file of files.slice(0, upTo ?? files.length)) this.apply(file);
  }

  migrate(): void {
    for (const file of this.pending.splice(0)) this.apply(file);
  }

  private apply(file: string): void {
    this.sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.sqlite, sql);
  }

  async batch(statements: FakeStatement[]): Promise<unknown[]> {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  /** Runs raw SQL for assertions and test setup. */
  query<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.sqlite
      .prepare(sql)
      .all(...params)
      .map((row) => ({ ...row })) as T[];
  }

  exec(sql: string, ...params: SQLInputValue[]): void {
    this.sqlite.prepare(sql).run(...params);
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
