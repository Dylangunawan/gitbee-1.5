import { Request, Response, NextFunction } from "express";
import { verifyToken } from "api/utils/auth/auth";
import { sendErrorResponse } from "api/utils/response/response";

export const RoleMiddleware = (requiredRole: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const cookies = req.cookies;
        const token = cookies[process.env.COOKIE_NAME];
        if (!token) {
            return sendErrorResponse(res, "Cookie not found", 401);
        }
          
        const verify = verifyToken(token);
        if (!verify.status) {
            return sendErrorResponse(res, verify.data, 401);
        }
          
        const data = verify.data;
        const role = data["role"];
        if (!role) {
            return sendErrorResponse(res, "User role not found", 401);
        }
          
        if (role !== requiredRole) {
            return sendErrorResponse(res, "Forbidden", 401);
        }
          
        next();
    }
}