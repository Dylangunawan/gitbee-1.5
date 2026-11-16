import { z } from "zod";
import { prisma } from "../../prisma/client.js";
import { Prisma } from "../../prisma/generated/prisma/client.js";
import { hashPassword } from "../../utils/auth/password.js";
import { staffRoles } from "../../utils/csv/csvParser.js";
import { readFirstSheetRows } from "../../utils/excel/excelSheet.js";
import { ServiceError } from "../../utils/response/response.js";

const userListSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    user_type: true,
    binusian_id: true,
    student_id: true,
    lecturer_code: true,
    created_at: true,
} as const;

// Same split as getLocalRoles in utils/auth/auth.ts, so each list shows the
// accounts that sign in as that kind of user. The column collation makes these
// comparisons ignore case.
const studentAccountWhere = {
    OR: [{ role: "Student" }, { user_type: "student" }],
} satisfies Prisma.UserWhereInput;

const staffAccountWhere = {
    role: { in: [...staffRoles] },
    OR: [{ user_type: null }, { user_type: "staff" }],
} satisfies Prisma.UserWhereInput;

export interface AccountListParams {
    search?: string | undefined;
    page: number;
    pageSize: number;
}

const searchAccounts = (search: string | undefined, columns: ("student_id" | "lecturer_code")[]) =>
    search
        ? {
            OR: [
                ...columns.map((column) => ({ [column]: { contains: search } })),
                { binusian_id: { contains: search } },
                { email: { contains: search } },
                { name: { contains: search } },
            ],
        }
        : {};

export interface CreateUserInput {
    lecturer_code: string;
    email: string;
    name: string;
    role: "Lecturer" | "Admin" | "SCC" | "HoP";
    password: string;
    major_ids?: number[] | undefined;
}

export default class UserService {
    /** Staff accounts grouped by role; `roleFilter` limits the lookup to one role (the others come back null). */
    static async listUsersByRole(params: { roleFilter?: string | undefined; search?: string | undefined }) {
        const searchCondition = params.search
            ? {
                OR: [
                    { lecturer_code: { contains: params.search } },
                    { student_id: { contains: params.search } },
                    { binusian_id: { contains: params.search } },
                    { email: { contains: params.search } },
                    { name: { contains: params.search } },
                ],
            }
            : {};
        const wants = (role: string) => params.roleFilter === role || !params.roleFilter;

        const scc = wants("SCC")
            ? await prisma.user.findMany({ where: { role: "SCC", ...searchCondition }, select: userListSelect })
            : null;

        let hop = null;
        if (wants("HoP")) {
            const hopData = await prisma.user.findMany({
                where: { role: "HoP", ...searchCondition },
                select: {
                    ...userListSelect,
                    hopMajors: { select: { major: { select: { id: true, name: true } } } },
                },
            });
            hop = hopData.map(({ hopMajors, ...user }) => ({
                ...user,
                hop_major: hopMajors.map((hm) => ({ id: hm.major.id, name: hm.major.name })),
            }));
        }

        const lecturer = wants("Lecturer")
            ? await prisma.user.findMany({ where: { role: "Lecturer", ...searchCondition }, select: userListSelect })
            : null;
        const admin = wants("Admin")
            ? await prisma.user.findMany({ where: { role: "Admin", ...searchCondition }, select: userListSelect })
            : null;

        return { scc, hop, lecturer, admin };
    }

    /** Student accounts (what the student CSV import creates), newest first, one page at a time. */
    static async listStudentAccounts(params: AccountListParams) {
        const where = { AND: [studentAccountWhere, searchAccounts(params.search, ["student_id"])] };
        const [total, items] = await prisma.$transaction([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    student_id: true,
                    major_code: true,
                    name: true,
                    email: true,
                    binusian_id: true,
                    created_at: true,
                },
                orderBy: [{ created_at: "desc" }, { id: "desc" }],
                skip: (params.page - 1) * params.pageSize,
                take: params.pageSize,
            }),
        ]);
        return { items, total, page: params.page, pageSize: params.pageSize };
    }

    /** Staff accounts (what the staff CSV import and insert-user create), newest first; `roleFilter` narrows to one role. */
    static async listStaffAccounts(params: AccountListParams & { roleFilter?: (typeof staffRoles)[number] | undefined }) {
        const where = {
            AND: [
                staffAccountWhere,
                ...(params.roleFilter ? [{ role: params.roleFilter }] : []),
                searchAccounts(params.search, ["lecturer_code"]),
            ],
        };
        const [total, rows] = await prisma.$transaction([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    lecturer_code: true,
                    major_codes: true,
                    name: true,
                    email: true,
                    binusian_id: true,
                    role: true,
                    created_at: true,
                    hopMajors: { select: { major: { select: { id: true, name: true } } } },
                },
                orderBy: [{ created_at: "desc" }, { id: "desc" }],
                skip: (params.page - 1) * params.pageSize,
                take: params.pageSize,
            }),
        ]);
        const items = rows.map(({ hopMajors, ...user }) => ({
            ...user,
            hop_major: hopMajors.map((hm) => ({ id: hm.major.id, name: hm.major.name })),
        }));
        return { items, total, page: params.page, pageSize: params.pageSize };
    }

    /** Creates a staff account with an initial local password (and, for a HoP, their majors). */
    static async createUser(params: CreateUserInput) {
        try {
            return await prisma.user.create({
                data: {
                    lecturer_code: params.lecturer_code,
                    email: params.email.toLowerCase(),
                    name: params.name,
                    role: params.role,
                    password: await hashPassword(params.password),
                    ...(params.role === "HoP" && params.major_ids
                        ? {
                            hopMajors: {
                                create: params.major_ids.map((major_id) => ({
                                    major: { connect: { id: major_id } },
                                })),
                            },
                        }
                        : {}),
                },
                select: {
                    id: true,
                    lecturer_code: true,
                    email: true,
                    name: true,
                    role: true,
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === "P2002") {
                    throw new ServiceError("A user with this email or lecturer code already exists.", 409);
                }
                if (error.code === "P2025") {
                    throw new ServiceError("One or more major IDs are invalid.", 400);
                }
            }
            throw error;
        }
    }

    /** Sets a new local password and revokes the account's existing sessions. */
    static async setPassword(id: number, password: string) {
        try {
            return await prisma.user.update({
                where: { id },
                data: {
                    password: await hashPassword(password),
                    credential_version: { increment: 1 },
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
                throw new ServiceError("User not found.", 404);
            }
            throw error;
        }
    }

    /** Changes a user's role; a HoP keeps the majors in `major_ids`, anyone leaving HoP loses theirs. */
    static async updateRole(params: { id: string; role: string; major_ids?: string[] | undefined }) {
        const userExists = await prisma.user.findUnique({
            where: { id: Number(params.id) },
            include: { hopMajors: true },
        });
        if (userExists && userExists.role === "HoP" && params.role !== "HoP") {
            await prisma.hoPMajor.deleteMany({
                where: { user_id: userExists.id },
            });
        }

        const updatedUserRole = await prisma.user.update({
            where: { id: Number(params.id) },
            data: { role: params.role },
        });

        if (params.role == "HoP" && params.major_ids) {
            await prisma.hoPMajor.deleteMany({
                where: { user_id: Number(params.id) },
            });
            await prisma.hoPMajor.createMany({
                data: params.major_ids.map((major_id) => ({
                    user_id: Number(params.id),
                    major_id: Number(major_id),
                })),
                skipDuplicates: true,
            });
        }

        return updatedUserRole;
    }

    /** Lecturer accounts from the class-transaction Excel export (name in column B, code in column C). */
    static async importLecturersFromExcel(buffer: Buffer) {
        const schema = z.object({
            lecturer_code: z.string(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
        });

        const rows = readFirstSheetRows(buffer);
        const validatedUsers = rows.flatMap((row) => {
            const parsed = schema.safeParse({
                lecturer_code: row[2],
                name: row[1],
                email: row[1],
                role: "Lecturer",
            });
            return parsed.success ? [parsed.data] : [];
        });

        if (validatedUsers.length === 0) {
            throw new ServiceError("No valid rows found in the file.");
        }

        return prisma.user.createMany({
            data: validatedUsers,
            skipDuplicates: true,
        });
    }

    /** Deletes every Lecturer account that isn't a student's. */
    static deleteAllLecturers() {
        return prisma.user.deleteMany({
            where: {
                role: "Lecturer",
                // Keep accounts that authHandler treats as students. user_type is
                // nullable, so NULL must be matched explicitly: in SQL, NOT
                // (user_type = 'student') is NULL (and thus excluded) when user_type IS NULL.
                OR: [{ user_type: null }, { user_type: { not: "student" } }],
            },
        });
    }
}
