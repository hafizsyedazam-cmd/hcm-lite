import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";

/** An error with an HTTP status that the route wrapper turns into JSON. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const forbidden = (msg = "You do not have access to this action") => new ApiError(403, msg);
export const notFound = (msg = "Not found") => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);
export const unprocessable = (msg: string, details?: unknown) => new ApiError(422, msg, details);

type Handler<C> = (req: Request, ctx: C) => Promise<unknown>;

/** Wraps a route handler: JSON responses, consistent error shape, no stack traces leaked. */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (e) {
      // Let Next.js handle its own control-flow errors (e.g. bailing out of prerendering).
      unstable_rethrow(e);
      if (e instanceof ApiError) {
        return Response.json({ error: e.message, details: e.details }, { status: e.status });
      }
      if (e instanceof ZodError) {
        const details = e.issues.map((i) => ({ field: i.path.join("."), reason: i.message }));
        const first = details[0];
        return Response.json(
          { error: first ? `${first.field || "input"}: ${first.reason}` : "Invalid input", details },
          { status: 422 },
        );
      }
      console.error(e);
      return Response.json({ error: "Something went wrong on the server" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return schema.parse(json);
}

export function query(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
