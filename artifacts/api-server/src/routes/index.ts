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
import advboxRouter from "./advbox";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// ─── Públicas (sem autenticação) ──────────────────────────────────────────────
router.use("/auth", authRouter);

// ChatGuru chama sem nosso cookie → deve ser público
// Registrado antes de requireAuth para não ser bloqueado
router.post("/chatguru/webhook", (req, res, next) => {
  req.url = "/webhook";
  chatguruRouter(req, res, next);
});

// AdvBox chama sem nosso cookie → deve ser público
// req.url precisa ser "/webhook" para o sub-router casar corretamente
router.post("/advbox/webhook", (req, res, next) => {
  req.url = "/webhook";
  advboxRouter(req, res, next);
});

// ─── Protegidas: exige sessão válida ─────────────────────────────────────────
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
router.use("/advbox", advboxRouter);

export default router;
