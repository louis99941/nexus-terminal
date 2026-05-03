/**
 * Shell 转义工具单元测试
 * 测试 shellEscape 函数的转义安全性与正确性
 */
import { describe, it, expect } from 'vitest';
import { shellEscape } from './shell-escape';

describe('shellEscape', () => {
  describe('普通字符串', () => {
    it('应该用单引号包裹纯字母字符串', () => {
      expect(shellEscape('hello')).toBe("'hello'");
    });

    it('应该用单引号包裹字母数字混合字符串', () => {
      expect(shellEscape('abc123')).toBe("'abc123'");
    });

    it('应该正确处理包含空格的字符串', () => {
      expect(shellEscape('hello world')).toBe("'hello world'");
    });

    it('应该正确处理包含连字符的字符串', () => {
      expect(shellEscape('my-file.txt')).toBe("'my-file.txt'");
    });

    it('应该正确处理包含下划线的字符串', () => {
      expect(shellEscape('my_file')).toBe("'my_file'");
    });
  });

  describe('空字符串', () => {
    it('应该返回两个单引号', () => {
      expect(shellEscape('')).toBe("''");
    });
  });

  describe('包含单引号的字符串', () => {
    it('应该转义字符串中间的单引号', () => {
      // 输入: it's → 替换后: it'\''s → 包裹后: 'it'\''s'
      expect(shellEscape("it's")).toBe("'it'\\''s'");
    });

    it('应该转义字符串开头的单引号', () => {
      // 输入: 'start' → 替换后: \''start'\'' → 包裹后: ''\''start'\'''
      // 使用拼接避免转义歧义
      const expected = "'" + "'\\''" + 'start' + "'\\''" + "'";
      expect(shellEscape("'start'")).toBe(expected);
    });

    it('应该转义字符串末尾的单引号', () => {
      // 输入: end' → 替换后: end'\'' → 包裹后: 'end'\'''
      expect(shellEscape("end'")).toBe("'end'\\'''");
    });

    it('应该转义多个单引号', () => {
      // 输入: a'b'c → 每个 ' 替换为 '\'' → 包裹后: 'a'\''b'\''c'
      expect(shellEscape("a'b'c")).toBe("'a'\\''b'\\''c'");
    });

    it('应该转义连续的单引号', () => {
      // 输入: '' → 每个 ' 替换为 '\'' → 替换后: '\''\'' → 包裹后: ''\''\'''
      const expected = "'" + "'\\''" + "'\\''" + "'";
      expect(shellEscape("''")).toBe(expected);
    });

    it('应该转义仅由单引号组成的字符串', () => {
      // 输入: ' → 替换后: '\'' → 包裹后: ''\''
      const expected = "'" + "'\\''" + "'";
      expect(shellEscape("'")).toBe(expected);
    });
  });

  describe('特殊字符', () => {
    it('应该原样保留美元符号（被单引号保护）', () => {
      expect(shellEscape('$HOME')).toBe("'$HOME'");
    });

    it('应该原样保留反引号', () => {
      expect(shellEscape('`whoami`')).toBe("'`whoami`'");
    });

    it('应该原样保留反斜杠', () => {
      expect(shellEscape('C:\\Users')).toBe("'C:\\Users'");
    });

    it('应该原样保留感叹号', () => {
      expect(shellEscape('!important')).toBe("'!important'");
    });

    it('应该原样保留管道符', () => {
      expect(shellEscape('a|b')).toBe("'a|b'");
    });

    it('应该原样保留与号', () => {
      expect(shellEscape('a&b')).toBe("'a&b'");
    });

    it('应该原样保留分号', () => {
      expect(shellEscape('a;b')).toBe("'a;b'");
    });

    it('应该原样保留换行符', () => {
      expect(shellEscape('line1\nline2')).toBe("'line1\nline2'");
    });

    it('应该原样保留制表符', () => {
      expect(shellEscape('col1\tcol2')).toBe("'col1\tcol2'");
    });

    it('应该正确处理包含所有危险字符的组合', () => {
      const dangerous = '$`\\!|&;\n\t';
      expect(shellEscape(dangerous)).toBe(`'${dangerous}'`);
    });
  });

  describe('中文字符串', () => {
    it('应该正确处理中文字符', () => {
      expect(shellEscape('你好世界')).toBe("'你好世界'");
    });

    it('应该正确处理中英混合字符串', () => {
      expect(shellEscape('文件 test.txt')).toBe("'文件 test.txt'");
    });

    it('应该正确处理中文路径', () => {
      expect(shellEscape('/home/用户/文档')).toBe("'/home/用户/文档'");
    });

    it('should handle non-ASCII quote-like chars', () => {
      // \u2018 \u2019 are Unicode chars, not ASCII quotes
      const input = 'test\u2018value\u2019';
      expect(shellEscape(input)).toBe("'test\u2018value\u2019'");
    });
  });

  describe('超长字符串', () => {
    it('应该正确处理长字符串', () => {
      const longString = 'a'.repeat(10000);
      const result = shellEscape(longString);
      expect(result).toBe(`'${longString}'`);
      expect(result.length).toBe(longString.length + 2);
    });

    it('应该正确处理包含重复单引号的长字符串', () => {
      const longString = "a'".repeat(1000);
      const result = shellEscape(longString);
      // 每个 a' 变为 a'\''，加上首尾单引号
      const expected = `'${longString.replace(/'/g, "'\\''")}'`;
      expect(result).toBe(expected);
    });
  });

  describe('返回值格式', () => {
    it('返回值应始终以单引号开头和结尾', () => {
      const inputs = ['', 'a', 'hello world', "it's", '$pecial!'];
      for (const input of inputs) {
        const result = shellEscape(input);
        expect(result.startsWith("'")).toBe(true);
        expect(result.endsWith("'")).toBe(true);
      }
    });
  });
});
