import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import cutlistsRouter from "./cutlists";
import stockbookRouter from "./stockbook";
import materialsRouter from "./materials";
import worklistsRouter from "./worklists";
import foldersRouter from "./folders";
import settingsRouter from "./settings";
import usersRouter from "./users";
import filemakerTestRouter from "./filemaker-test";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/projects", projectsRouter);
router.use("/cutlists", cutlistsRouter);
router.use("/stockbook", stockbookRouter);
router.use("/materials", materialsRouter);
router.use("/worklists", worklistsRouter);
router.use("/folders", foldersRouter);
router.use("/settings", settingsRouter);
router.use("/users", usersRouter);
router.use("/filemaker", filemakerTestRouter);

export default router;
