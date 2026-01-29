import { defineConfig } from 'vitepress'

process.env.VITE_EXTRA_EXTENSIONS = 'sql';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Duan",
  description: "️技术探索和日志记录",
  markdown:{
    toc:{
      level :[1,2,3],
    }
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    search: {
      provider: 'local'
    },
    nav: [
      { text: '🏠Home', link: '/' },
    ],
    outline: {
      label: '页面导航',
      level: [2, 6] // 显示h1到h6所有级别的标题
    },
    sidebar: [
      {
        text: 'Projects',
        items: [
          { text: '🐧Linux', link: '/tech/linux' },
          { text: '⚒️Programming', link: '/tech/programming' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/duantihua' }
    ]
  }
})
