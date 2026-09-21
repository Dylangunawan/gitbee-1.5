import type { Request, Response, NextFunction } from "express";
import { sendErrorResponse, sendSuccessResponse } from "api/utils/response/response";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default class StatusHandler {
    static async getAllStatus(req : Request, res : Response, next : NextFunction) {
        try {
            const statuses = await prisma.status.findMany();
            sendSuccessResponse(res, statuses);
        } catch (error) {
            sendErrorResponse(res, error.message ? error.message : "Fetch Failed");
        }
    }
}