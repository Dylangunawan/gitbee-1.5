import jwt, { JsonWebTokenError } from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()
const secret = process.env.JWT_SECRET

const addHour = (hour: number) => {
    const now = new Date();
    now.setTime(now.getTime() + (hour * 60 * 60 * 1000))
    return now;
}
export const createToken = (
    nim: string,
    username: string,
    name: string,
    email: string,
    role: string[],
    microsoftToken: string,
    messier_id?: string,
    activeRole?: string,
    ) => {
    const expire = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7);
    const token = jwt.sign({
        exp: expire,
        nim: nim,
        role: role,
        binusianId: username,
        name: name.toUpperCase(),
        email: email.toLowerCase(),
        messier_id: messier_id,
        activeRole: activeRole,
        microsoftToken: microsoftToken
    }, secret);
    return {
        token,
        expires: addHour(168),
    }
}

export const verifyToken = (token: string) : {
    status: boolean,
    data: any,
} => {
    try {
        const verified = jwt.verify(token, secret);
        return {
            status: true,
            data: verified
        }
    } catch (error) {
        return {
            status: false,
            data: error
        }
    }
}

export const parseJwt = (token: string): any => {
    try {
        const decoded = jwt.decode(token);
        if (!decoded) {
            throw new Error("Invalid token");
        }
        return decoded;
    } catch (error) {
        throw new Error("Failed to parse token: " + (error as JsonWebTokenError).message);
    }
}
