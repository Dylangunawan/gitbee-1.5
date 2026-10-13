import express from "express";
import AdminUserHandler from "../handlers/user/admin/adminUserHandler.js";
import { uploadCsv } from "../middleware/uploadMiddleware.js";

const adminCsvUploadRoutes = express.Router();

adminCsvUploadRoutes.post("/upload", uploadCsv, AdminUserHandler.handleCsvUpload);

export default adminCsvUploadRoutes;
