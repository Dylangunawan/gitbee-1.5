import { prisma } from "../../prisma/client.js";

export const savedUserFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  user_type: true,
  student_id: true,
  lecturer_code: true,
  binusian_id: true,
  major_code: true,
  major_codes: true,
  created_at: true,
} as const;

export async function fetchDemoData(page: number) {
  const pageSize = 20;
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      select: savedUserFields,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);
  return { rows, total, page, pageSize };
}
