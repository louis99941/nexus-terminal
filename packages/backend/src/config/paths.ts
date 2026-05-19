/**
 * 统一路径配置模块
 *
 * 所有需要文件系统读写的路径统一在此定义，使用 process.cwd() 替代 __dirname，
 * 确保在 Docker 容器中（WORKDIR=/app）路径正确解析。
 *
 * 路径约定：
 * - 数据目录：process.cwd()/data/（Docker 中为 /app/data/）
 * - 临时文件：os.tmpdir()（系统临时目录，任何用户可写）
 * - 只读资源：__dirname 相对路径或 process.cwd() 相对路径
 */
import path from 'path';
import os from 'os';

/** 应用根目录（Docker 中为 /app，本地开发为 packages/backend） */
const APP_ROOT = process.cwd();

/** 数据根目录 - 所有持久化数据的父目录 */
export const DATA_DIR = path.join(APP_ROOT, 'data');

/** 数据库目录 */
export const DB_DIR = DATA_DIR;
export const DB_PATH = path.join(DB_DIR, 'nexus-terminal.db');

/** 环境变量文件（自动生成的密钥） */
export const DATA_ENV_PATH = path.join(DATA_DIR, '.env');

/** 会话存储目录 */
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

/** 上传文件目录 */
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

/** 背景图片上传目录 */
export const BACKGROUND_DIR = path.join(DATA_DIR, 'background');

/** 用户自定义 HTML 主题目录 */
export const CUSTOM_HTML_THEMES_DIR = path.join(DATA_DIR, 'custom_html_theme');

/** 预设 HTML 主题目录（只读，从源码复制） */
export const PRESET_HTML_THEMES_DIR = path.join(APP_ROOT, 'html-presets');

/** SSH 挂起临时日志目录 */
export const SSH_LOG_DIR = path.join(DATA_DIR, 'temp_suspended_ssh_logs');

/** multer 临时上传目录（系统临时目录，处理完即删） */
export const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'nexus-temp-uploads');
