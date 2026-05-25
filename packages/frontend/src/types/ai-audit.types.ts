/**
 * AI 审计分析前端类型定义
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
  status: ReportStatus;
  time_range_start: number;
  time_range_end: number;
  summary: string;
  anomalies_json: string | null;
  ai_analysis: string | null;
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
  evidence_json: string | null;
  detected_at: number;
  acknowledged: boolean;
}

// 异常统计
export interface AnomalyStats {
  total: number;
  bySeverity: Record<AnomalySeverity, number>;
  byRule: Record<string, number>;
  recentCount: number;
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

// 报告列表响应
export interface GetReportsResponse {
  reports: AuditReport[];
  total: number;
}

// 异常列表响应
export interface GetAnomaliesResponse {
  anomalies: AuditAnomaly[];
  total: number;
}
