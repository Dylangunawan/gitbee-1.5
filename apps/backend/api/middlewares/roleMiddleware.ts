import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth/auth.js";
import { sendErrorResponse } from "../utils/response/response.js";

export const RoleMiddleware = (requiredRole: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const cookieName = process.env.COOKIE_NAME;
        const cookieToken = cookieName ? req.cookies?.[cookieName] : undefined;
        const authorization = req.get("authorization");
        const bearerToken = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
        const token = cookieToken || bearerToken;

        if (!token) {
            return sendErrorResponse(res, "Unauthorized", 401);
        }
          
        const verify = verifyToken(token);
        if (!verify.status || !verify.data) {
            return sendErrorResponse(res, "Forbidden", 401);
        }

        const role =
            typeof verify.data === "object" && "role" in verify.data
                ? verify.data.role
                : undefined;
        const hasRequiredRole = Array.isArray(role)
            ? role.includes(requiredRole)
            : role === requiredRole;

        if (!hasRequiredRole) {
            return sendErrorResponse(res, "Forbidden", 403);
        }
          
        next();
    }
}