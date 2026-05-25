/**
 * AI 审计分析类型定义
 */

// 审计报告类型
export type ReportType = 'command_analysis' | 'login_analysis' | 'full_audit';

// 审计报告状态
export type ReportStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// 异常严重程度
export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// 异常规则 ID
export type AnomalyRuleId =
  | 'brute_force_login'
  | 'unusual_hours'
  | 'command_frequency_spike'
  | 'dangerous_commands'
  | 'privilege_escalation'
  | 'connection_churn'
  | 'failed_connection_cluster'
  | 'large_file_transfer'
  | 'session_duration_anomaly'
  | 'new_connection_first_use';

// 审计报告
export interface AuditReport {
  id: number;
  user_id: number;
  report_type: ReportType;
  time_range_start: number;
  time_range_end: number;
  summary: string; // JSON: overall score, key findings
  anomalies_json: string | null; // JSON array: detected anomalies
  ai_analysis: string | null; // AI-generated analysis text
  created_at: number;
}

// 异常检测记录
export interface AuditAnomaly {
  id: number;
  report_id: number | null;
  rule_id: AnomalyRuleId;
  severity: AnomalySeverity;
  title: string;
  description: string;
  evidence_json: string | null; // JSON: supporting data
  detected_at: number;
  acknowledged: boolean;
}

// AI 分析任务
export interface AiAuditTask {
  id: string;
  user_id: number;
  status: ReportStatus;
  report_type: ReportType;
  progress: number; // 0-100
  result_json: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

// 创建报告请求
export interface CreateReportRequest {
  reportType: ReportType;
  timeRangeStart: number;
  timeRangeEnd: number;
}

// 创建报告响应
export interface CreateReportResponse {
  success: boolean;
  report: {
    id: number;
    status: ReportStatus;
    reportType: ReportType;
  };
}

// 报告列表查询参数
export interface GetReportsQuery {
  page?: number;
  pageSize?: number;
  reportType?: ReportType;
  status?: ReportStatus;
  startDate?: number;
  endDate?: number;
}

// 异常列表查询参数
export interface GetAnomaliesQuery {
  page?: number;
  pageSize?: number;
  severity?: AnomalySeverity;
  ruleId?: AnomalyRuleId;
  acknowledged?: boolean;
  startDate?: number;
  endDate?: number;
}

// 异常统计
export interface AnomalyStats {
  total: number;
  bySeverity: Record<AnomalySeverity, number>;
  byRule: Record<string, number>;
  recentCount: number; // 最近 24 小时
}

// 检测规则接口
export interface DetectionRule {
  id: AnomalyRuleId;
  name: string;
  description: string;
  severity: AnomalySeverity;
  enabled: boolean;
}

// 规则检测结果
export interface RuleDetectionResult {
  ruleId: AnomalyRuleId;
  detected: boolean;
  anomalies: Omit<AuditAnomaly, 'id' | 'report_id' | 'detected_at' | 'acknowledged'>[];
}

// 审计数据摘要
export interface AuditDataSummary {
  timeRange: { start: number; end: number };
  totalCommands: number;
  totalLogins: number;
  failedLogins: number;
  totalConnections: number;
  uniqueIps: number;
  commandFrequency: Record<string, number>;
  loginByHour: Record<number, number>;
  topCommands: Array<{ command: string; count: number }>;
}
