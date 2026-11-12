import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import departmentsRouter from "./departments";
import divisionsRouter from "./divisions";
import usersRouter from "./users";
import processesRouter from "./processes";
import processFlowsRouter from "./process-flows";
import managementTasksRouter from "./management-tasks";
import documentsRouter from "./documents";
import systemsRouter from "./systems";
import hearingsRouter from "./hearings";
import issuesRouter from "./issues";
import improvementsRouter from "./improvements";
import systemCandidatesRouter from "./system-candidates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(departmentsRouter);
router.use(divisionsRouter);
router.use(usersRouter);
router.use(processesRouter);
router.use(processFlowsRouter);
router.use(managementTasksRouter);
router.use(documentsRouter);
router.use(systemsRouter);
router.use(hearingsRouter);
router.use(issuesRouter);
router.use(improvementsRouter);
router.use(systemCandidatesRouter);

export default router;
