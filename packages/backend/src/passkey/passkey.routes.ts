/**
 * Passkey 管理路由
 * 提供 Passkey 的独立 CRUD 操作端点
 *
 * 注册 / 认证流程路由仍保留在 auth.routes.ts 中（/api/v1/auth/passkey/*）
 */

import { Router } from 'express';
import { isAuthenticated } from '../auth/auth.middleware';
import {
  listUserPasskeys,
  deleteUserPasskey,
  updateUserPasskeyName,
  checkHasPasskeys,
} from './passkey.controller';

const router = Router();

// 公开端点：检查系统是否配置了 Passkey（无需认证）
router.get('/has-configured', checkHasPasskeys);

// 以下端点需要认证
router.use(isAuthenticated);

// GET /api/v1/passkey - 获取当前用户的所有 Passkey
router.get('/', listUserPasskeys);

// DELETE /api/v1/passkey/:credentialID - 删除指定 Passkey
router.delete('/:credentialID', deleteUserPasskey);

// PUT /api/v1/passkey/:credentialID/name - 更新 Passkey 名称
router.put('/:credentialID/name', updateUserPasskeyName);

export default router;
