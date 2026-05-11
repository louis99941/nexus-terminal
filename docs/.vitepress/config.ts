import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'zh-CN',
  title: 'Nexus Terminal',
  description: '现代化、功能丰富的 Web SSH / RDP / VNC 客户端，提供高度可定制的远程连接体验',

  head: [
    ['meta', { name: 'theme-color', content: '#3c8dbc' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Nexus Terminal' }],
    ['meta', { name: 'og:description', content: '现代化、功能丰富的 Web SSH / RDP / VNC 客户端' }],
    // RFC 8288 Link headers — 供 AI 代理发现 API 目录和 MCP 服务
    [
      'link',
      {
        rel: 'api-catalog',
        href: '/.well-known/api-catalog.json',
        type: 'application/linkset+json',
      },
    ],
    [
      'link',
      {
        rel: 'mcp-server-card',
        href: '/.well-known/mcp/server-card.json',
        type: 'application/json',
      },
    ],
    [
      'link',
      {
        rel: 'agent-skills',
        href: '/.well-known/agent-skills/index.json',
        type: 'application/json',
      },
    ],
  ],

  cleanUrls: true,

  themeConfig: {
    logo: '/favicon.ico',
    siteTitle: 'Nexus Terminal',

    nav: [
      { text: '首页', link: '/' },
      { text: '功能介绍', link: '/features' },
      { text: '部署教程', link: '/deployment' },
      { text: '高级配置', link: '/configuration' },
      { text: '常见问题', link: '/faq' },
    ],

    sidebar: [
      {
        text: '开始',
        items: [
          { text: '功能介绍', link: '/features' },
          { text: '部署教程', link: '/deployment' },
        ],
      },
      {
        text: '配置',
        items: [{ text: '高级配置', link: '/configuration' }],
      },
      {
        text: '帮助',
        items: [{ text: '常见问题', link: '/faq' }],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/Silentely/nexus-terminal' }],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换' },
          },
        },
      },
    },

    footer: {
      message: '星枢终端 — 现代化 Web 终端解决方案',
      copyright: 'Copyright © 2024-2026 Silentely',
    },

    editLink: {
      pattern: 'https://github.com/Silentely/nexus-terminal/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页面',
    },

    lastUpdated: { text: '最后更新于' },

    outline: { level: [2, 3], label: '页面导航' },

    docFooter: { prev: '上一页', next: '下一页' },

    returnToTopLabel: '回到顶部',
  },

  markdown: {
    lineNumbers: true,
  },
});
