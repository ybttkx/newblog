[Status: 🟢 活跃开发]

# newblog 个人博客

## 1. 项目定位
基于 Astro + Fuwari 主题构建的静态个人博客，站点 `https://blog.ybovo.com/`，支持 Markdown 撰写、Pagefind 本地离线搜索，部署于 Vercel / Cloudflare / EdgeOne 多线路。仓库即线上源站（GitHub `ybttkx/newblog`）。

## 2. 技术栈
- **框架**：Astro 5 + Svelte 5 + Tailwind CSS
- **构建/包管理**：pnpm 9 / Vite
- **内容引擎**：Astro Content Collections（Content Layer）
- **代码高亮**：Expressive Code（KaTeX 数学公式）
- **全文检索**：Pagefind
- **页面过渡**：swup

## 3. 完成度与核心模块
- [x] 博客框架搭建与基础页面配置
- [x] 文章归档、分类与标签体系（**分类筛选当前失效，见 REVIEW.md P0-2**）
- [x] 本地草稿与发布机制
- [x] 多线路切换（RouteSwitch）与页脚 CDN/IP 信息（存在双实例与第三方 IP 查询问题）
- [x] 评论系统（Giscus）
- [x] 全量代码审阅（2026-11-07）：`REVIEW.md` + `review/{infra,frontend,content}.md`，结论 P0×2 / P1×11

## 4. 已知主要问题（详见 REVIEW.md）
- 生产构建链路不含 Pagefind 索引（CI/平台预设只跑 `astro build`），搜索可能静默失效
- 分类筛选断路：`?category=` 参数无消费者，点分类仍显示全部文章
- `astro check` 3 个类型错误、`biome ci` 9 个错误，两条 CI 工作流必红
- Footer 每页渲染两份，移动端 CDN/IP 信息不可见，且访客 IP 发往 4 个第三方 API
- 文章可见错误 6 处（反引号转义、中英残句、标题 `from Pages` 等）；`/favicon.ico` 404
- 两篇教育随笔素材重合 6 处、声明口径冲突，可识别信息偏多（合规风险）
- `wrangler.json` name 仍为 `fuwari`、README 仍是上游模板、`.env.example` 未闭合
