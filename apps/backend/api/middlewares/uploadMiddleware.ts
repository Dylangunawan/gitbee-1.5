import type { RequestHandler } from "express";
import multer from "multer";
import path from "node:path";
import { sendErrorResponse } from "../utils/response/response.js";

class InvalidCsvFileTypeError extends Error {}

const allowedMimeTypes = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/csv",
  "text/x-csv",
  "application/octet-stream",
]);

const uploadSingleCsv = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    const hasCsvExtension =
      path.extname(file.originalname).toLowerCase() === ".csv";
    if (!hasCsvExtension || !allowedMimeTypes.has(file.mimetype)) {
      callback(new InvalidCsvFileTypeError("Only CSV files are allowed."));
      return;
    }

    callback(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

export const uploadCsv: RequestHandler = (req, res, next) => {
  uploadSingleCsv(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const isFileTooLarge = error.code === "LIMIT_FILE_SIZE";
      sendErrorResponse(
        res,
        isFileTooLarge
          ? "File size exceeds the 5MB limit."
          : error.message,
        isFileTooLarge ? 413 : 400
      );
      return;
    }

    if (error instanceof InvalidCsvFileTypeError) {
      sendErrorResponse(res, error.message, 400);
      return;
    }

    next(error);
  });
};
