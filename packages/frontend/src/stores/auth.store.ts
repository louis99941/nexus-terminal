import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import apiClient from '../utils/apiClient';
import { setLocale } from '../i18n';
import { extractErrorMessage } from '../utils/errorExtractor';
import { navigateToLoginAfterLogout } from '../utils/authRuntimeBridge';
import { log } from '@/utils/log';

interface UserInfo {
  id: number;
  username: string;
  isTwoFactorEnabled?: boolean;
  language?: 'en' | 'zh';
}

export interface PasskeyInfo {
  credentialID: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  creationDate: string;
  lastUsedDate: string;
  name?: string;
}

interface LoginPayload {
  username: string;
  password: string;
  rememberMe?: boolean;
}

interface PublicCaptchaConfig {
  enabled: boolean;
  provider: 'hcaptcha' | 'recaptcha' | 'none';
  hcaptchaSiteKey?: string;
  recaptchaSiteKey?: string;
}

interface FullCaptchaSettings {
  enabled: boolean;
  provider: 'hcaptcha' | 'recaptcha' | 'none';
  hcaptchaSiteKey?: string;
  hcaptchaSecretKey?: string;
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
}

export interface IpBlacklistEntry {
  ip: string;
  attempts: number;
  last_attempt_at: number;
  blocked_until: number | null;
}

export const useAuthStore = defineStore(
  'auth',
  () => {
    // --- State ---
    const isAuthenticated = ref(false);
    const user = ref<UserInfo | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const loginRequires2FA = ref(false);
    const tempToken = ref<string | null>(null);
    const ipBlacklist = ref<{ entries: IpBlacklistEntry[]; total: number }>({
      entries: [],
      total: 0,
    });
    const needsSetup = ref(false);
    const publicCaptchaConfig = ref<PublicCaptchaConfig | null>(null);
    const passkeys = ref<PasskeyInfo[] | null>(null);
    const passkeysLoading = ref(false);
    const hasPasskeysAvailable = ref(false);
    const isInitCompleted = ref(false);

    // --- Getters ---
    const loggedInUser = computed(() => user.value?.username);

    // --- Actions ---
    function clearError() {
      error.value = null;
    }

    function setError(errorMessage: string) {
      error.value = errorMessage;
    }

    async function login(payload: LoginPayload & { captchaToken?: string }) {
      isLoading.value = true;
      error.value = null;
      loginRequires2FA.value = false;
      try {
        const response = await apiClient.post<{
          message: string;
          user?: UserInfo;
          requiresTwoFactor?: boolean;
          tempToken?: string;
        }>('/auth/login', payload);

        if (response.data.requiresTwoFactor) {
          log.info('登录需要 2FA 验证');
          loginRequires2FA.value = true;
          tempToken.value = response.data.tempToken || null;
          return { requiresTwoFactor: true };
        }
        if (response.data.user) {
          isAuthenticated.value = true;
          user.value = response.data.user;
          log.info('登录成功 (无 2FA):', user.value);
          if (user.value?.language) {
            setLocale(user.value.language);
          }
          window.location.href = '/';
          return { success: true };
        }
        throw new Error('登录响应无效');
      } catch (err: unknown) {
        log.error('登录失败:', err);
        isAuthenticated.value = false;
        user.value = null;
        loginRequires2FA.value = false;
        tempToken.value = null;
        error.value = extractErrorMessage(err, '');
        return { success: false, error: error.value };
      } finally {
        isLoading.value = false;
      }
    }

    async function verifyLogin2FA(token: string) {
      if (!loginRequires2FA.value) {
        throw new Error('当前登录流程不需要 2FA 验证。');
      }
      isLoading.value = true;
      error.value = null;
      try {
        const response = await apiClient.post<{ message: string; user: UserInfo }>(
          '/auth/login/2fa',
          { token, tempToken: tempToken.value }
        );
        isAuthenticated.value = true;
        user.value = response.data.user;
        loginRequires2FA.value = false;
        tempToken.value = null;
        log.info('2FA 验证成功，登录完成:', user.value);
        if (user.value?.language) {
          setLocale(user.value.language);
        }
        window.location.href = '/';
        return { success: true };
      } catch (err: unknown) {
        log.error('2FA 验证失败:', err);
        error.value = extractErrorMessage(err, '');
        return { success: false, error: error.value };
      } finally {
        isLoading.value = false;
      }
    }

    async function logout() {
      isLoading.value = true;
      error.value = null;
      loginRequires2FA.value = false;
      try {
        await apiClient.post('/auth/logout');
        isAuthenticated.value = false;
        user.value = null;
        log.info('已登出');
        await navigateToLoginAfterLogout();
      } catch (err: unknown) {
        log.error('登出失败:', err);
        error.value = extractErrorMessage(err, '');
      } finally {
        isLoading.value = false;
      }
    }

    async function checkAuthStatus() {
      isLoading.value = true;
      try {
        const response = await apiClient.get<{ isAuthenticated: boolean; user: UserInfo }>(
          '/auth/status'
        );
        if (response.data.isAuthenticated && response.data.user) {
          isAuthenticated.value = true;
          user.value = response.data.user;
          loginRequires2FA.value = false;
          log.info('认证状态已更新:', user.value);
          if (user.value?.language) {
            setLocale(user.value.language);
          }
        } else {
          isAuthenticated.value = false;
          user.value = null;
          loginRequires2FA.value = false;
        }
      } catch (err: unknown) {
        log.warn('检查认证状态失败:', extractErrorMessage(err, '检查认证状态失败'));
        isAuthenticated.value = false;
        user.value = null;
        loginRequires2FA.value = false;
      } finally {
        isLoading.value = false;
      }
    }

    async function changePassword(currentPassword: string, newPassword: string) {
      if (!isAuthenticated.value) {
        throw new Error('用户未登录，无法修改密码。');
      }
      isLoading.value = true;
      error.value = null;
      try {
        const response = await apiClient.put<{ message: string }>('/auth/password', {
          currentPassword,
          newPassword,
        });
        log.info('密码修改成功:', response.data.message);
        return true;
      } catch (err: unknown) {
        log.error('修改密码失败:', err);
        error.value = extractErrorMessage(err, '');
        throw new Error(error.value ?? '修改密码时发生未知错误。');
      } finally {
        isLoading.value = false;
      }
    }

    async function fetchIpBlacklist(limit: number = 50, offset: number = 0) {
      isLoading.value = true;
      error.value = null;
      try {
        const response = await apiClient.get('/settings/ip-blacklist', {
          params: { limit, offset },
        });
        ipBlacklist.value.entries = response.data.entries;
        ipBlacklist.value.total = response.data.total;
        log.info('获取 IP 黑名单成功:', response.data);
        return response.data;
      } catch (err: unknown) {
        log.error('获取 IP 黑名单失败:', err);
        error.value = extractErrorMessage(err, '');
        throw new Error(error.value ?? '获取 IP 黑名单时发生未知错误。');
      } finally {
        isLoading.value = false;
      }
    }

    async function deleteIpFromBlacklist(ip: string) {
      isLoading.value = true;
      error.value = null;
      try {
        await apiClient.delete(`/settings/ip-blacklist/${encodeURIComponent(ip)}`);
        log.info(`IP ${ip} 已从黑名单删除`);
        ipBlacklist.value.entries = ipBlacklist.value.entries.filter((entry) => entry.ip !== ip);
        ipBlacklist.value.total = Math.max(0, ipBlacklist.value.total - 1);
        return true;
      } catch (err: unknown) {
        log.error(`删除 IP ${ip} 失败:`, err);
        error.value = extractErrorMessage(err, '');
        throw new Error(error.value ?? '删除 IP 时发生未知错误。');
      } finally {
        isLoading.value = false;
      }
    }

    async function checkSetupStatus() {
      try {
        const response = await apiClient.get<{ needsSetup: boolean }>('/auth/needs-setup');
        needsSetup.value = response.data.needsSetup;
        log.info(`[AuthStore] Needs setup status: ${needsSetup.value}`);
        return needsSetup.value;
      } catch (err: unknown) {
        log.error('检查设置状态失败:', extractErrorMessage(err, '检查设置状态失败'));
        needsSetup.value = false;
        return false;
      }
    }

    async function fetchCaptchaConfig() {
      log.info('[AuthStore] fetchCaptchaConfig called. Forcing refetch.');
      try {
        log.info('[AuthStore] Fetching CAPTCHA config from /settings/captcha...');
        const response = await apiClient.get<FullCaptchaSettings>('/settings/captcha');
        const fullConfig = response.data;
        publicCaptchaConfig.value = {
          enabled: fullConfig.enabled,
          provider: fullConfig.provider,
          hcaptchaSiteKey: fullConfig.hcaptchaSiteKey,
          recaptchaSiteKey: fullConfig.recaptchaSiteKey,
        };
        log.info(
          '[AuthStore] Public CAPTCHA config derived from /settings/captcha:',
          publicCaptchaConfig.value
        );
      } catch (err: unknown) {
        log.error(
          '获取 CAPTCHA 配置失败 (from /settings/captcha):',
          extractErrorMessage(err, '获取 CAPTCHA 配置失败')
        );
        publicCaptchaConfig.value = {
          enabled: false,
          provider: 'none',
        };
      }
    }

    async function loginWithPasskey(username: string, assertionResponse: unknown) {
      isLoading.value = true;
      error.value = null;
      loginRequires2FA.value = false;
      try {
        const response = await apiClient.post<{ message: string; user: UserInfo }>(
          '/auth/passkey/authenticate',
          { username, assertionResponse }
        );
        isAuthenticated.value = true;
        user.value = response.data.user;
        log.info('Passkey 登录成功:', user.value);
        if (user.value?.language) {
          setLocale(user.value.language);
        }
        window.location.href = '/';
        return { success: true };
      } catch (err: unknown) {
        log.error('Passkey 登录失败:', err);
        isAuthenticated.value = false;
        user.value = null;
        error.value = extractErrorMessage(err, '');
        return { success: false, error: error.value };
      } finally {
        isLoading.value = false;
      }
    }

    async function getPasskeyRegistrationOptions(username: string) {
      isLoading.value = true;
      error.value = null;
      try {
        const response = await apiClient.post('/auth/passkey/registration-options', { username });
        return response.data;
      } catch (err: unknown) {
        log.error('获取 Passkey 注册选项失败:', err);
        error.value = extractErrorMessage(err, '');
        throw new Error(error.value ?? '获取 Passkey 注册选项失败。');
      } finally {
        isLoading.value = false;
      }
    }

    async function registerPasskey(username: string, registrationResponse: unknown) {
      isLoading.value = true;
      error.value = null;
      try {
        await apiClient.post('/auth/passkey/register', {
          username,
          registrationResponse,
        });
        log.info('Passkey 注册成功');
        return { success: true };
      } catch (err: unknown) {
        log.error('Passkey 注册失败:', err);
        error.value = extractErrorMessage(err, '');
        throw new Error(error.value ?? 'Passkey 注册失败。');
      } finally {
        isLoading.value = false;
      }
    }

    async function fetchPasskeys() {
      if (!isAuthenticated.value) {
        log.warn('User not authenticated. Cannot fetch passkeys.');
        passkeys.value = null;
        return;
      }
      passkeysLoading.value = true;
      error.value = null;
      try {
        interface BackendPasskeyInfo {
          credential_id: string;
          public_key: string;
          counter: number;
          transports?: AuthenticatorTransport[];
          created_at: string;
          last_used_at: string;
          name?: string;
        }
        const response = await apiClient.get<BackendPasskeyInfo[]>('/passkey');
        passkeys.value = response.data.map((pk) => ({
          credentialID: pk.credential_id,
          publicKey: pk.public_key,
          counter: pk.counter,
          transports: pk.transports,
          creationDate: pk.created_at,
          lastUsedDate: pk.last_used_at,
          name: pk.name,
        }));
        log.info('Passkeys fetched and mapped successfully:', passkeys.value);
      } catch (err: unknown) {
        log.error('Failed to fetch passkeys:', err);
        error.value = extractErrorMessage(err, '');
        passkeys.value = null;
      } finally {
        passkeysLoading.value = false;
      }
    }

    async function deletePasskey(credentialID: string) {
      if (!isAuthenticated.value) {
        throw new Error('User not authenticated. Cannot delete passkey.');
      }
      isLoading.value = true;
      error.value = null;
      try {
        await apiClient.delete(`/passkey/${credentialID}`);
        log.info(`Passkey ${credentialID} deleted successfully.`);
        await fetchPasskeys();
        return { success: true };
      } catch (err: unknown) {
        log.error(`Failed to delete passkey ${credentialID}:`, err);
        error.value = extractErrorMessage(err, '');
        throw new Error(error.value ?? 'Failed to delete passkey.');
      } finally {
        isLoading.value = false;
      }
    }

    async function updatePasskeyName(credentialID: string, newName: string) {
      if (!isAuthenticated.value) {
        throw new Error('User not authenticated. Cannot update passkey name.');
      }
      error.value = null;
      try {
        await apiClient.put(`/passkey/${credentialID}/name`, { name: newName });
        log.info(`Passkey ${credentialID} name updated to "${newName}".`);
        await fetchPasskeys();
        return { success: true };
      } catch (err: unknown) {
        log.error(`Failed to update passkey ${credentialID} name:`, err);
        error.value = extractErrorMessage(err, '');
        throw new Error(error.value ?? 'Failed to update passkey name.');
      }
    }

    async function checkHasPasskeysConfigured(username?: string) {
      try {
        const params = username ? { username } : {};
        const response = await apiClient.get<{ hasPasskeys: boolean }>(
          '/auth/passkey/has-configured',
          { params }
        );
        hasPasskeysAvailable.value = response.data.hasPasskeys;
        log.info(
          `[AuthStore] Passkeys available for ${username || 'any user'}: ${hasPasskeysAvailable.value}`
        );
        return hasPasskeysAvailable.value;
      } catch (err: unknown) {
        log.error(
          'Failed to check if passkeys are configured:',
          extractErrorMessage(err, 'Failed to check if passkeys are configured')
        );
        hasPasskeysAvailable.value = false;
        return false;
      }
    }

    async function loadInitData() {
      isLoading.value = true;
      try {
        const response = await apiClient.get<{
          needsSetup: boolean;
          isAuthenticated: boolean;
          user: UserInfo | null;
          captchaConfig: {
            enabled: boolean;
            provider: string;
            hcaptchaSiteKey: string | null;
            recaptchaSiteKey: string | null;
          };
        }>('/auth/init');

        const provider = response.data.captchaConfig.provider;
        const validProviders = ['none', 'hcaptcha', 'recaptcha'] as const;
        if (!validProviders.includes(provider as (typeof validProviders)[number])) {
          throw new Error(`无效的 CAPTCHA provider: ${provider}`);
        }

        needsSetup.value = response.data.needsSetup;
        isAuthenticated.value = response.data.isAuthenticated;
        user.value = response.data.user;
        publicCaptchaConfig.value = {
          enabled: response.data.captchaConfig.enabled,
          provider: provider as 'none' | 'hcaptcha' | 'recaptcha',
          hcaptchaSiteKey: response.data.captchaConfig.hcaptchaSiteKey ?? undefined,
          recaptchaSiteKey: response.data.captchaConfig.recaptchaSiteKey ?? undefined,
        };

        if (user.value?.language) {
          setLocale(user.value.language);
        }

        isInitCompleted.value = true;

        log.info('[AuthStore] 统一初始化数据加载完成:', {
          needsSetup: needsSetup.value,
          isAuthenticated: isAuthenticated.value,
          user: user.value,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const axiosError = err as { response?: { data?: { message?: string } } };
        const serverMessage = axiosError.response?.data?.message;

        log.error('[AuthStore] 加载初始化数据失败:', serverMessage || errorMessage);

        isInitCompleted.value = true;

        if (user.value === null && needsSetup.value === false && isAuthenticated.value === false) {
          needsSetup.value = true;
        }
      } finally {
        isLoading.value = false;
      }
    }

    return {
      isAuthenticated,
      user,
      isLoading,
      error,
      loginRequires2FA,
      tempToken,
      ipBlacklist,
      needsSetup,
      publicCaptchaConfig,
      passkeys,
      passkeysLoading,
      hasPasskeysAvailable,
      isInitCompleted,
      loggedInUser,
      clearError,
      setError,
      login,
      verifyLogin2FA,
      logout,
      checkAuthStatus,
      changePassword,
      fetchIpBlacklist,
      deleteIpFromBlacklist,
      checkSetupStatus,
      fetchCaptchaConfig,
      loginWithPasskey,
      getPasskeyRegistrationOptions,
      registerPasskey,
      fetchPasskeys,
      deletePasskey,
      updatePasskeyName,
      checkHasPasskeysConfigured,
      loadInitData,
    };
  },
  {
    persist: true,
  }
);
