export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const forbidden = (msg: string) => new HttpError(403, msg);
export const notFound = (msg: string) => new HttpError(404, msg);
