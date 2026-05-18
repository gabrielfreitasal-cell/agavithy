import { Router, type IRouter } from "express";
import healthRouter from "./health";
import snippetsRouter from "./snippets";
import tagsRouter from "./tags";
import clipboardRouter from "./clipboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(snippetsRouter);
router.use(tagsRouter);
router.use(clipboardRouter);

export default router;
