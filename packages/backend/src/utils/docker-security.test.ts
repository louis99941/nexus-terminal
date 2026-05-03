/**
 * Docker 安全工具单元测试
 * 测试容器 ID 净化和命令白名单校验功能
 */
import { describe, it, expect } from 'vitest';
import { sanitizeDockerContainerId, isValidDockerCommand } from './docker-security';

describe('sanitizeDockerContainerId', () => {
  describe('正常 ID', () => {
    it('应该原样返回标准容器 ID', () => {
      expect(sanitizeDockerContainerId('abc123def456')).toBe('abc123def456');
    });

    it('应该保留小写字母', () => {
      expect(sanitizeDockerContainerId('abcdef')).toBe('abcdef');
    });

    it('应该保留大写字母', () => {
      expect(sanitizeDockerContainerId('ABCDEF')).toBe('ABCDEF');
    });

    it('应该保留数字', () => {
      expect(sanitizeDockerContainerId('0123456789')).toBe('0123456789');
    });

    it('应该保留下划线', () => {
      expect(sanitizeDockerContainerId('my_container')).toBe('my_container');
    });

    it('应该保留连字符', () => {
      expect(sanitizeDockerContainerId('my-container')).toBe('my-container');
    });

    it('应该正确处理混合安全字符', () => {
      expect(sanitizeDockerContainerId('aB3_-z9')).toBe('aB3_-z9');
    });
  });

  describe('注入尝试', () => {
    it('应该移除分号和空格', () => {
      // 分号、空格、斜杠均被移除，连字符保留
      expect(sanitizeDockerContainerId('abc; rm -rf /')).toBe('abcrm-rf');
    });

    it('应该移除 $ 和括号（命令替换注入）', () => {
      expect(sanitizeDockerContainerId('$(whoami)')).toBe('whoami');
    });

    it('应该移除反引号（反引号注入）', () => {
      expect(sanitizeDockerContainerId('`whoami`')).toBe('whoami');
    });

    it('应该移除管道符和空格', () => {
      // 管道符、空格、斜杠均被移除
      expect(sanitizeDockerContainerId('abc|cat /etc/passwd')).toBe('abccatetcpasswd');
    });

    it('应该移除空格', () => {
      expect(sanitizeDockerContainerId('abc def')).toBe('abcdef');
    });

    it('应该移除斜杠和点号（路径穿越）', () => {
      // 斜杠和点号均被移除，仅保留字母
      expect(sanitizeDockerContainerId('../../../etc/passwd')).toBe('etcpasswd');
    });

    it('应该移除点号', () => {
      expect(sanitizeDockerContainerId('a.b.c')).toBe('abc');
    });

    it('应该移除花括号', () => {
      expect(sanitizeDockerContainerId('${HOME}')).toBe('HOME');
    });

    it('应该移除双引号', () => {
      expect(sanitizeDockerContainerId('"injected"')).toBe('injected');
    });

    it('应该移除单引号', () => {
      expect(sanitizeDockerContainerId("injected'")).toBe('injected');
    });

    it('应该移除换行符', () => {
      expect(sanitizeDockerContainerId('abc\ndef')).toBe('abcdef');
    });

    it('应该移除回车符', () => {
      expect(sanitizeDockerContainerId('abc\rdef')).toBe('abcdef');
    });

    it('应该移除制表符', () => {
      expect(sanitizeDockerContainerId('abc\tdef')).toBe('abcdef');
    });

    it('应该同时移除多种危险字符', () => {
      // 分号、空格、斜杠、$、括号、反引号均被移除，连字符保留
      expect(sanitizeDockerContainerId('abc; rm -rf / $(cmd) `x`')).toBe('abcrm-rfcmdx');
    });
  });

  describe('空字符串', () => {
    it('应该返回空字符串', () => {
      expect(sanitizeDockerContainerId('')).toBe('');
    });
  });

  describe('边界情况', () => {
    it('应该返回空字符串当所有字符都被移除', () => {
      expect(sanitizeDockerContainerId(' !@#$%^&*() ')).toBe('');
    });

    it('应该正确处理纯空格字符串', () => {
      expect(sanitizeDockerContainerId('   ')).toBe('');
    });

    it('应该正确处理仅含特殊字符的容器 ID', () => {
      expect(sanitizeDockerContainerId('/bin/sh')).toBe('binsh');
    });
  });
});

describe('isValidDockerCommand', () => {
  describe('合法命令', () => {
    it('应该接受 start 命令', () => {
      expect(isValidDockerCommand('start')).toBe(true);
    });

    it('应该接受 stop 命令', () => {
      expect(isValidDockerCommand('stop')).toBe(true);
    });

    it('应该接受 restart 命令', () => {
      expect(isValidDockerCommand('restart')).toBe(true);
    });

    it('应该接受 remove 命令', () => {
      expect(isValidDockerCommand('remove')).toBe(true);
    });
  });

  describe('非法命令', () => {
    it('应该拒绝 exec 命令', () => {
      expect(isValidDockerCommand('exec')).toBe(false);
    });

    it('应该拒绝 run 命令', () => {
      expect(isValidDockerCommand('run')).toBe(false);
    });

    it('应该拒绝 rm 命令', () => {
      expect(isValidDockerCommand('rm')).toBe(false);
    });

    it('应该拒绝 delete 命令', () => {
      expect(isValidDockerCommand('delete')).toBe(false);
    });

    it('应该拒绝 kill 命令', () => {
      expect(isValidDockerCommand('kill')).toBe(false);
    });

    it('应该拒绝 pause 命令', () => {
      expect(isValidDockerCommand('pause')).toBe(false);
    });

    it('应该拒绝 unpause 命令', () => {
      expect(isValidDockerCommand('unpause')).toBe(false);
    });
  });

  describe('注入尝试', () => {
    it('应该拒绝包含分号的命令', () => {
      expect(isValidDockerCommand('start; rm -rf /')).toBe(false);
    });

    it('应该拒绝包含管道符的命令', () => {
      expect(isValidDockerCommand('start|cat')).toBe(false);
    });

    it('应该拒绝包含空格的命令', () => {
      expect(isValidDockerCommand('start stop')).toBe(false);
    });

    it('应该拒绝空字符串', () => {
      expect(isValidDockerCommand('')).toBe(false);
    });
  });

  describe('大小写敏感', () => {
    it('应该拒绝大写 Start', () => {
      expect(isValidDockerCommand('Start')).toBe(false);
    });

    it('应该拒绝大写 STOP', () => {
      expect(isValidDockerCommand('STOP')).toBe(false);
    });

    it('应该拒绝首字母大写的 Restart', () => {
      expect(isValidDockerCommand('Restart')).toBe(false);
    });
  });
});
