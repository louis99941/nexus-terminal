/**
 * AI 审计分析路由
 */

import { Router } from 'express';
import { AiAuditController } from './ai-audit.controller';
import { isAuthenticated } from '../auth/auth.middleware';

const router = Router();
const controller = new AiAuditController();

// 所有路由都需要认证
router.use(isAuthenticated);

// 审计报告
router.post('/reports', (req, res) => controller.createReport(req, res));
router.get('/reports', (req, res) => controller.getReports(req, res));
router.get('/reports/:id', (req, res) => controller.getReportById(req, res));

// 异常检测
router.get('/anomalies', (req, res) => controller.getAnomalies(req, res));
router.get('/anomalies/stats', (req, res) => controller.getAnomalyStats(req, res));
router.patch('/anomalies/:id/acknowledge', (req, res) => controller.acknowledgeAnomaly(req, res));

export { router as aiAuditRoutes };
