/**
 * AI 审计分析服务
 * 核心业务逻辑：数据采集、规则检测、报告生成
 */

import { logger } from '../utils/logger';
import { AiAuditRepository } from './ai-audit.repository';
import { runDetectionRules } from './rules/anomaly-rules';
import { getPromptBuilder } from './prompts/audit-prompts';
import type {
  ReportType,
  ReportStatus,
  AnomalyRuleId,
  AnomalySeverity,
  CreateReportRequest,
  CreateReportResponse,
  GetReportsQuery,
  GetAnomaliesQuery,
  AnomalyStats,
  AuditDataSummary,
} from './ai-audit.types';

export class AiAuditService {
  private repository: AiAuditRepository;

  constructor() {
    this.repository = new AiAuditRepository();
  }

  /**
   * 创建审计报告
   */
  async createReport(userId: number, request: CreateReportRequest): Promise<CreateReportResponse> {
    const { reportType, timeRangeStart, timeRangeEnd } = request;

    // 创建报告记录
    const reportId = await this.repository.createReport({
      userId,
      reportType,
      timeRangeStart,
      timeRangeEnd,
    });

    logger.info({ reportId, reportType, userId }, '审计报告已创建');

    // 异步执行分析（不阻塞响应）
    this.runAnalysis(reportId, userId, reportType, timeRangeStart, timeRangeEnd).catch((err) => {
      logger.error({ reportId, error: err }, '审计分析执行失败');
    });

    return {
      success: true,
      report: {
        id: reportId,
        status: 'pending',
        reportType,
      },
    };
  }

  /**
   * 执行审计分析
   */
  private async runAnalysis(
    reportId: number,
    userId: number,
    reportType: ReportType,
    timeRangeStart: number,
    timeRangeEnd: number
  ): Promise<void> {
    try {
      // 更新状态为进行中
      await this.repository.updateReportStatus(reportId, 'in_progress');

      // 采集数据
      const dataSummary = await this.repository.getDataSummary(timeRangeStart, timeRangeEnd);

      // 运行规则检测
      const loginEvents = await this.getLoginEvents(timeRangeStart, timeRangeEnd);
      const commands = await this.getCommands(timeRangeStart, timeRangeEnd);
      const connectionEvents = await this.getConnectionEvents(timeRangeStart, timeRangeEnd);

      const detectionResults = await runDetectionRules({
        loginEvents,
        commands,
        connectionEvents,
        timeRangeStart,
        timeRangeEnd,
      });

      // 收集所有检测到的异常
      const allAnomalies = detectionResults.filter((r) => r.detected).flatMap((r) => r.anomalies);

      // 创建异常记录
      if (allAnomalies.length > 0) {
        await this.repository.createAnomalies(
          allAnomalies.map((a) => ({
            reportId,
            ruleId: a.rule_id as AnomalyRuleId,
            severity: a.severity as AnomalySeverity,
            title: a.title,
            description: a.description,
            evidenceJson: a.evidence_json || undefined,
          }))
        );
      }

      // 生成摘要
      const summary = JSON.stringify({
        overallScore: this.calculateRiskScore(allAnomalies),
        anomalyCount: allAnomalies.length,
        dataSummary: {
          totalCommands: dataSummary.totalCommands,
          totalLogins: dataSummary.totalLogins,
          failedLogins: dataSummary.failedLogins,
        },
      });

      // 更新报告状态为完成
      await this.repository.updateReportStatus(
        reportId,
        'completed',
        summary,
        JSON.stringify(allAnomalies),
        undefined // AI 分析暂时为空，可后续扩展
      );

      logger.info({ reportId, anomalyCount: allAnomalies.length }, '审计分析完成');
    } catch (err) {
      logger.error({ reportId, error: err }, '审计分析失败');
      await this.repository.updateReportStatus(reportId, 'failed');
    }
  }

  /**
   * 计算风险评分（0-100，越高越安全）
   */
  private calculateRiskScore(anomalies: Array<{ severity: string }>): number {
    let score = 100;
    for (const anomaly of anomalies) {
      switch (anomaly.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 获取登录事件
   */
  private async getLoginEvents(
    timeRangeStart: number,
    timeRangeEnd: number
  ): Promise<Array<{ ip: string; success: boolean; timestamp: number }>> {
    const { getDbInstance, allDb } = await import('../database/connection.js');
    const db = await getDbInstance();

    const rows = await allDb<{ action_type: string; details: string; timestamp: number }>(
      db,
      `SELECT action_type, details, timestamp FROM audit_logs
       WHERE action_type IN ('LOGIN_SUCCESS', 'LOGIN_FAILURE')
       AND timestamp >= ? AND timestamp <= ?`,
      [timeRangeStart, timeRangeEnd]
    );

    return rows.map((row) => {
      let ip = '';
      try {
        const details = JSON.parse(row.details || '{}');
        ip = details.clientIp || details.ip || '';
      } catch {
        // 忽略解析错误
      }
      return {
        ip,
        success: row.action_type === 'LOGIN_SUCCESS',
        timestamp: row.timestamp,
      };
    });
  }

  /**
   * 获取命令列表
   */
  private async getCommands(
    timeRangeStart: number,
    timeRangeEnd: number
  ): Promise<Array<{ command: string; timestamp: number }>> {
    const { getDbInstance, allDb } = await import('../database/connection.js');
    const db = await getDbInstance();

    return allDb<{ command: string; timestamp: number }>(
      db,
      `SELECT command, timestamp FROM command_history
       WHERE timestamp >= ? AND timestamp <= ?`,
      [timeRangeStart, timeRangeEnd]
    );
  }

  /**
   * 获取连接事件
   */
  private async getConnectionEvents(
    timeRangeStart: number,
    timeRangeEnd: number
  ): Promise<Array<{ type: string; timestamp: number }>> {
    const { getDbInstance, allDb } = await import('../database/connection.js');
    const db = await getDbInstance();

    const rows = await allDb<{ action_type: string; timestamp: number }>(
      db,
      `SELECT action_type, timestamp FROM audit_logs
       WHERE action_type IN ('SSH_CONNECT_SUCCESS', 'SSH_CONNECT_FAILURE', 'SSH_DISCONNECT')
       AND timestamp >= ? AND timestamp <= ?`,
      [timeRangeStart, timeRangeEnd]
    );

    return rows.map((row) => ({
      type: row.action_type,
      timestamp: row.timestamp,
    }));
  }

  /**
   * 获取报告列表
   */
  async getReports(userId: number, query: GetReportsQuery) {
    return this.repository.getReports({
      userId,
      page: query.page,
      pageSize: query.pageSize,
      reportType: query.reportType,
    });
  }

  /**
   * 获取报告详情
   */
  async getReportById(reportId: number) {
    return this.repository.getReportById(reportId);
  }

  /**
   * 获取异常列表
   */
  async getAnomalies(query: GetAnomaliesQuery) {
    return this.repository.getAnomalies({
      page: query.page,
      pageSize: query.pageSize,
      severity: query.severity,
      acknowledged: query.acknowledged,
    });
  }

  /**
   * 获取异常统计
   */
  async getAnomalyStats(): Promise<AnomalyStats> {
    const stats = await this.repository.getAnomalyStats();
    return {
      total: stats.total,
      bySeverity: stats.bySeverity as Record<string, number>,
      byRule: {}, // 可扩展
      recentCount: stats.recentCount,
    };
  }

  /**
   * 确认异常
   */
  async acknowledgeAnomaly(anomalyId: number): Promise<void> {
    await this.repository.acknowledgeAnomaly(anomalyId);
  }
}
