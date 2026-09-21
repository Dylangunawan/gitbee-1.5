export interface APIResponse {
    status: boolean
    message: string
    errors?: any
    data: any,
}

export const defaultResponse: APIResponse = {
    message: "failed",
    status: false,
    data: undefined,
};