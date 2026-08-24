/**
 * Errors that are the caller's fault. The HTTP catch maps these to 4xx
 * instead of a 500. Domain code throws this at the boundary; it does not
 * stringify-match messages.
 */
export class ClientError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ClientError";
    this.status = status;
  }
}
