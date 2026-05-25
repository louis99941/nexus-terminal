/**
 * AI 审计分析控制器
 * 处理 HTTP 请求
 */

import { Request, Response } from 'express';
import { AiAuditService } from './ai-audit.service';
import { logger } from '../utils/logger';
import type { GetReportsQuery, GetAnomaliesQuery } from './ai-audit.types';

// 扩展 Request 类型以包含 session.userId
type SessionWithUserId = Request['session'] & { userId?: number };

export class AiAuditController {
  private service: AiAuditService;

  constructor() {
    this.service = new AiAuditService();
  }

  /**
   * 从请求中获取用户 ID
   */
  private getUserId(req: Request): number | null {
    const userId = (req.session as SessionWithUserId | undefined)?.userId;
    return userId ?? null;
  }

  /**
   * 创建审计报告
   * POST /api/v1/ai-audit/reports
   */
  async createReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '未授权' });
        return;
      }

      const { reportType, timeRangeStart, timeRangeEnd } = req.body;

      if (!reportType || !timeRangeStart || !timeRangeEnd) {
        res.status(400).json({ error: '缺少必要参数' });
        return;
      }

      const result = await this.service.createReport(userId, {
        reportType,
        timeRangeStart,
        timeRangeEnd,
      });

      res.json(result);
    } catch (err) {
      logger.error({ error: err }, '创建审计报告失败');
      res.status(500).json({ error: '创建报告失败' });
    }
  }

  /**
   * 获取报告列表
   * GET /api/v1/ai-audit/reports
   */
  async getReports(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '未授权' });
        return;
      }

      const query: GetReportsQuery = {
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
        reportType: req.query.reportType as GetReportsQuery['reportType'],
      };

      const result = await this.service.getReports(userId, query);
      res.json(result);
    } catch (err) {
      logger.error({ error: err }, '获取报告列表失败');
      res.status(500).json({ error: '获取报告列表失败' });
    }
  }

  /**
   * 获取报告详情
   * GET /api/v1/ai-audit/reports/:id
   */
  async getReportById(req: Request, res: Response): Promise<void> {
    try {
      const reportId = Number(req.params.id);
      if (!reportId) {
        res.status(400).json({ error: '无效的报告 ID' });
        return;
      }

      const report = await this.service.getReportById(reportId);
      if (!report) {
        res.status(404).json({ error: '报告不存在' });
        return;
      }

      res.json(report);
    } catch (err) {
      logger.error({ error: err }, '获取报告详情失败');
      res.status(500).json({ error: '获取报告详情失败' });
    }
  }

  /**
   * 获取异常列表
   * GET /api/v1/ai-audit/anomalies
   */
  async getAnomalies(req: Request, res: Response): Promise<void> {
    try {
      const query: GetAnomaliesQuery = {
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
        severity: req.query.severity as GetAnomaliesQuery['severity'],
        acknowledged: req.query.acknowledged === 'true' ? true : undefined,
      };

      const result = await this.service.getAnomalies(query);
      res.json(result);
    } catch (err) {
      logger.error({ error: err }, '获取异常列表失败');
      res.status(500).json({ error: '获取异常列表失败' });
    }
  }

  /**
   * 获取异常统计
   * GET /api/v1/ai-audit/anomalies/stats
   */
  async getAnomalyStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.service.getAnomalyStats();
      res.json(stats);
    } catch (err) {
      logger.error({ error: err }, '获取异常统计失败');
      res.status(500).json({ error: '获取异常统计失败' });
    }
  }

  /**
   * 确认异常
   * PATCH /api/v1/ai-audit/anomalies/:id/acknowledge
   */
  async acknowledgeAnomaly(req: Request, res: Response): Promise<void> {
    try {
      const anomalyId = Number(req.params.id);
      if (!anomalyId) {
        res.status(400).json({ error: '无效的异常 ID' });
        return;
      }

      await this.service.acknowledgeAnomaly(anomalyId);
      res.json({ success: true });
    } catch (err) {
      logger.error({ error: err }, '确认异常失败');
      res.status(500).json({ error: '确认异常失败' });
    }
  }
}
