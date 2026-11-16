export type AccountType = "student" | "staff";
export type StaffRole = "Lecturer" | "Admin" | "SCC" | "HoP";

export interface Account {
  id: number;
  name: string;
  email: string;
  binusian_id: string | null;
  created_at: string;
  student_id?: string | null;
  lecturer_code?: string | null;
  major_code?: string | null;
  major_codes?: string | null;
  role?: StaffRole;
  hop_major?: { id: number; name: string }[];
}

export interface AccountPage {
  items: Account[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getAccounts(
  type: AccountType,
  options: {
    search?: string;
    page?: number;
    pageSize?: number;
    roleFilter?: StaffRole | "";
    signal?: AbortSignal;
  } = {},
): Promise<AccountPage> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (type === "staff" && options.roleFilter)
    params.set("roleFilter", options.roleFilter);
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_API}user/admin/get-${type}-accounts?${params}`,
    {
      credentials: "include",
      cache: "no-store",
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.status) {
    throw new Error(
      response.status === 401
        ? "Your session expired. Please sign in again."
        : response.status === 403
          ? "An administrator account is required."
          : typeof result.errors === "string"
            ? result.errors
            : Array.isArray(result.errors)
              ? result.errors.join("; ")
              : "Could not fetch accounts. Please retry.",
    );
  }
  return result.data;
}
