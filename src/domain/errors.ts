export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
