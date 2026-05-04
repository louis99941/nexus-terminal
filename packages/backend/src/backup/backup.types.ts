/**
 * 数据备份类型定义
 * 支持导出/导入连接配置、SSH 密钥、代理、标签、快捷指令、终端主题等核心数据
 */

/** 备份文件格式版本 */
export const BACKUP_FORMAT_VERSION = 1;

/** 备份文件元信息 */
export interface BackupMetadata {
  version: number;
  exportedAt: number; // Unix 时间戳
  sourceInstance?: string; // 来源实例标识（可选）
  recordCounts: Record<string, number>;
}

/** 可备份的数据实体 */
export interface BackupPayload {
  metadata: BackupMetadata;
  connections: Record<string, unknown>[];
  sshKeys: Record<string, unknown>[];
  proxies: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  connectionTags: Record<string, unknown>[];
  quickCommands: Record<string, unknown>[];
  quickCommandTags: Record<string, unknown>[];
  quickCommandTagAssociations: Record<string, unknown>[];
  terminalThemes: Record<string, unknown>[];
  notificationSettings: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  appearanceSettings: Record<string, unknown>[];
  favoritePaths: Record<string, unknown>[];
}

/** 导入选项 */
export interface ImportOptions {
  /** 是否覆盖已存在的记录（基于 name/唯一键匹配），默认 false 跳过 */
  overwrite?: boolean;
  /** 选择性导入的表名列表，为空则导入全部 */
  tables?: (keyof Omit<BackupPayload, 'metadata'>)[];
}

/** 导入结果 */
export interface ImportResult {
  imported: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
}
