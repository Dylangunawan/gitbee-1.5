import express from "express";
import studentGroupRoutes from "./student/studentGroupRoutes";
import lecturerGroupRoutes from "./lecturer/lecturerGroupRoutes";

const groupRoutes = express.Router();

groupRoutes.use("/student", studentGroupRoutes);
groupRoutes.use("/lecturer", lecturerGroupRoutes);

export default groupRoutes;