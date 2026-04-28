import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatguruRouter from "./chatguru";
import agentsRouter from "./agents";
import whatsappNumbersRouter from "./whatsapp-numbers";
import tagsRouter from "./tags";
import conversationsExtraRouter from "./conversations-extra";
import summariesRouter from "./summaries";
import campaignsRouter from "./campaigns";
import metaAdsRouter from "./meta-ads";
import auditRouter from "./audit";
import authRouter from "./auth";
import messagesRouter from "./messages";
import processosRouter from "./processos";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Public: auth endpoints
router.use("/auth", authRouter);

// Protected: all other routes require valid session cookie
router.use(requireAuth);

router.use(healthRouter);
router.use("/chatguru", chatguruRouter);
router.use("/agents", agentsRouter);
router.use("/whatsapp-numbers", whatsappNumbersRouter);
router.use("/tags", tagsRouter);
router.use("/conversations", conversationsExtraRouter);
router.use("/conversations", messagesRouter);
router.use("/summaries", summariesRouter);
router.use("/campaigns", campaignsRouter);
router.use("/meta-ads", metaAdsRouter);
router.use("/audit", auditRouter);
router.use("/processos", processosRouter);

export default router;
