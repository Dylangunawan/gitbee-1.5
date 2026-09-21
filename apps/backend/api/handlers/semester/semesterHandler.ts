import type { RequestHandler, Request, Response, NextFunction } from "express";
import SemesterService from "../../services/semester/semesterService";
import { sendErrorResponse, sendSuccessResponse } from "../../utils/response/response";

export default class SemesterHandler {
    static async getAllSemester(req : Request, res : Response, next : NextFunction) {
        const result = await SemesterService.getAllSemesterData();

        if (result.status === true && result.data) {
            sendSuccessResponse(res, result.data);
        } else {
            sendErrorResponse(res, result.errors ? result.errors : "Fetch Failed");
        }
    }

    static async getCurrentSemester(req : Request, res : Response, next : NextFunction) {
        const result = await SemesterService.getCurrentSemesterData();
        
        if (result.status === true && result.data) {
            sendSuccessResponse(res, result.data);
        } else {
            sendErrorResponse(res, result.errors ? result.errors : "Fetch Failed");
        }
    }
}