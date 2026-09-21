import express from "express";
import authRoutes from "./auth/authRoutes";
import semesterRoutes from "./semester/semesterRoutes";
import projectRoutes from "./project/projectRoutes";
import statusRoutes from "./status/statusRoutes";
import categoryRoutes from "./category/categoryRoutes";
import technologyRoutes from "./technology/technologyRoutes";
import majorRoutes from "./major/majorRoutes";
import userRoutes from "./user/userRoutes";
import groupRoutes from "./group/groupRoutes";
import assessmentRoutes from "./assessment/assessmentRoutes";
import classRoutes from "./class/classRoutes";
import reviewedProjectRoutes from "./reviewedProject/reviewedProjectRoutes";
import outstandingProjectRoutes from "./outstandingProject/outstandingProjectRoutes";
import deadlineRoutes from "./deadline/deadlineRoutes";

const routes = express.Router();

routes.use((req, res, next) => {
  next();
});
routes.get("/", (req, res) => {
  res.send("Welcome to GitBee");
});

routes.use("/auth", authRoutes);
routes.use("/user", userRoutes);
routes.use("/semester", semesterRoutes);
routes.use("/class", classRoutes);
routes.use("/reviewed-project", reviewedProjectRoutes);
routes.use("/outstanding-project", outstandingProjectRoutes);
routes.use("/project", projectRoutes);
routes.use("/status", statusRoutes);
routes.use("/category", categoryRoutes);
routes.use("/technology", technologyRoutes);
routes.use("/major", majorRoutes);
routes.use("/group", groupRoutes);
routes.use("/assessment", assessmentRoutes);
routes.use("/deadline", deadlineRoutes);

export default routes;
