/** An expected failure with an HTTP status, raised by services and mapped to a response by the API layer. */
export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what: string) => new ServiceError(404, "not-found", `${what} not found`);
export const badRequest = (code: string, message: string) => new ServiceError(400, code, message);
