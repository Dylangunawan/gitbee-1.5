export const base = `${process.env.NEXT_PUBLIC_BACKEND_API}user/admin/data-tools`;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.status)
    throw new Error(
      response.status === 401
        ? "Your session expired. Sign in again at /demo-login."
        : response.status === 403
          ? "An administrator account is required."
          : typeof result.errors === "string"
            ? result.errors
            : "Request failed. Please retry.",
    );
  return result.data;
}
