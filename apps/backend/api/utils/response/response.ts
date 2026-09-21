import { defaultResponse } from '../../models/generic/response';
import axios from 'axios';
import { Response } from 'express';

type Cookie = {
    name: string,
    value: string,
    expires?: Date,
}

export function sendSuccessResponse(res: Response, data: any, cookie?: Cookie) {
    if (cookie) {
        res.cookie(cookie.name, cookie.value, {
            httpOnly: false,
            secure: false,
            expires: cookie.expires,
        })
    }
    res.status(200).json({
        message: "successful",
        status: true,
        data: data
    });
}

export function sendErrorResponse(res: Response, error: any, status?: number) {
    res.status(status ?? 400).json({
        ...defaultResponse,
        errors: error,
        data: null,
    });
}

export function getErrors(error: any, message?: string) {
    const err = axios.isAxiosError(error) ? (
        error.response?.data ?? error.message
    ) : (message ?? "Unkown Error")
    return err;
}