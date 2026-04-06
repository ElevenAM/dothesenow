export class QueryError extends Error {
  constructor(
    message: string,
    public readonly table: string,
    public readonly operation: string,
    public readonly orgId: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "QueryError";
  }
}
