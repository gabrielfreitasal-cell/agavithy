import { Router, type IRouter } from "express";
import healthRouter from "./health";
import snippetsRouter from "./snippets";
import tagsRouter from "./tags";
import clipboardRouter from "./clipboard";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(snippetsRouter);
router.use(tagsRouter);
router.use(clipboardRouter);
router.use(aiRouter);

export default router;
