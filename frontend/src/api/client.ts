export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface ValidationIssue {
  loc?: (string | number)[];
  msg: string;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data as { detail?: string | ValidationIssue[] }).detail;
    const message = Array.isArray(detail)
      ? detail.map((issue) => `${issue.loc?.at(-1) ?? ""}: ${issue.msg}`).join("; ")
      : detail;
    throw new ApiError(message || `${response.status} ${response.statusText}`, response.status);
  }
  return data as T;
}
