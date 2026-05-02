/**
 * Passkey 管理控制器
 * 处理 Passkey 的独立 CRUD 操作（与认证流程分离）
 *
 * 注册 / 认证流程仍保留在 auth/ 模块中（auth-passkey.handlers.ts）
 */

import { Request, Response, NextFunction } from 'express';
import { passkeyService } from './passkey.service';
import { getErrorMessage } from '../utils/AppError';

/**
 * 获取当前用户的所有 Passkey (GET /api/v1/passkey)
 * 返回列表仅包含非敏感字段（credential_id, created_at, last_used_at, transports, name）
 */
export const listUserPasskeys = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: '未登录。' });
      return;
    }

    const passkeys = await passkeyService.listPasskeysByUserId(userId);
    res.status(200).json(passkeys);
  } catch (error: unknown) {
    console.error('Controller: 获取用户 Passkey 列表时发生错误:', error);
    next(error);
  }
};

/**
 * 删除当前用户指定的 Passkey (DELETE /api/v1/passkey/:credentialID)
 */
export const deleteUserPasskey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: '未登录。' });
      return;
    }

    const { credentialID } = req.params;
    if (!credentialID) {
      res.status(400).json({ message: '缺少 credentialID 参数。' });
      return;
    }

    const wasDeleted = await passkeyService.deletePasskey(userId, credentialID);
    if (wasDeleted) {
      res.status(200).json({ message: 'Passkey 已成功删除。' });
    } else {
      res.status(404).json({ message: 'Passkey 未找到或删除失败。' });
    }
  } catch (error: unknown) {
    console.error('Controller: 删除 Passkey 时发生错误:', error);
    const errMsg = getErrorMessage(error);
    if (errMsg.includes('Unauthorized')) {
      res.status(403).json({ message: '无权删除此 Passkey。' });
    } else if (errMsg.includes('not found')) {
      res.status(404).json({ message: 'Passkey 未找到。' });
    } else {
      next(error);
    }
  }
};

/**
 * 更新当前用户指定的 Passkey 名称 (PUT /api/v1/passkey/:credentialID/name)
 */
export const updateUserPasskeyName = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: '未登录。' });
      return;
    }

    const { credentialID } = req.params;
    const { name } = req.body;

    if (!credentialID) {
      res.status(400).json({ message: '缺少 credentialID 参数。' });
      return;
    }
    if (!name || typeof name !== 'string') {
      res.status(400).json({ message: '请提供有效的 Passkey 名称。' });
      return;
    }

    await passkeyService.updatePasskeyName(userId, credentialID, name);
    res.status(200).json({ message: 'Passkey 名称更新成功。' });
  } catch (error: unknown) {
    console.error('Controller: 更新 Passkey 名称时发生错误:', error);
    const errMsg = getErrorMessage(error);
    if (errMsg.includes('Unauthorized')) {
      res.status(403).json({ message: '无权修改此 Passkey。' });
    } else if (errMsg.includes('not found')) {
      res.status(404).json({ message: 'Passkey 未找到。' });
    } else {
      next(error);
    }
  }
};

/**
 * 检查系统是否配置了 Passkey (GET /api/v1/passkey/has-configured)
 * 公开端点，用于登录页面判断是否显示 Passkey 登录选项
 */
export const checkHasPasskeys = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const username = req.query.username as string | undefined;
    const hasPasskeys = await passkeyService.hasPasskeysConfigured(username);
    res.status(200).json({ hasPasskeys });
  } catch (error: unknown) {
    console.error('Controller: 检查 Passkey 配置状态时发生错误:', error);
    next(error);
  }
};
