import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fieldsRouter from "./fields";
import advisoriesRouter from "./advisories";
import dashboardRouter from "./dashboard";
import chatRouter from "./chat";
import settingsRouter from "./settings";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(fieldsRouter);
router.use(advisoriesRouter);
router.use(dashboardRouter);
router.use(chatRouter);
router.use(settingsRouter);
router.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default router;
