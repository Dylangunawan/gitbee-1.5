import express from "express";
import lecturerClassRoutes from "api/routes/class/lecturer/lecturerClassRoutes";
import studentClassRoutes from "./student/studentClassRoutes";

const classRoutes = express.Router();

classRoutes.use("/lecturer", lecturerClassRoutes);
classRoutes.use("/student", studentClassRoutes);

export default classRoutes;