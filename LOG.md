# 开发日志

## 2026-11-05
- 克隆上游仓库 `https://github.com/ybttkx/newblog` 至 `task/1105-newblog`
- 初始化工作区规范五件套（`SUMMARY.md`、`LOG.md`、`.env.example`）
- 将博客已有文章（《与next_js纠缠的一天.md》、《小米手环9_VelaOS_快应用开发避坑与优化实战总结.md》、《第一篇博客.md》）备份至本地目录 `c:\Users\yibai\Documents\blog\`
- 新增随笔文章《铁笼、泔水与三甲公章：一所“兜底初中”里的时间绞肉机》（`src/content/posts/牢笼.md`），规范 Frontmatter 结构
- 提交并推送至 GitHub 远端仓库

- 文章《牢笼.md》标题改为《成绩之外，无人在乎》，免责声明由「均为虚构」改为「本人亲历、细节已模糊处理」，与正文及后记保持一致；本地备份同步修改
- 新增文章《标准件的诞生：当学校开始按照分数称量学生》（src/content/posts/对中式教育的批判.md）：修正「毫无帮助」与倒 U 形结论冲突的一句，补 Frontmatter 与后记；本地 pnpm build 通过（6 页索引）

## 2026-11-07
- 拉取远端：`git fetch --all` 成功（本机 schannel 报 `SEC_E_NO_CREDENTIALS`，改用 `http.sslBackend=openssl` + 代理 127.0.0.1:7897）；`origin/main` 与本地 HEAD 均为 `7e8d828`，已是最新
- 全量代码审阅（只读，不改源码）：三路并行（基础设施 / 前端 / 内容）+ Lead 独立验证
  - `pnpm build` 成功：9 页面、Pagefind 索引 6 页（zh-cn）；`pnpm astro check` 3 个 error
  - 产物核对：favicon 404、Footer 脚本重复（detectCDN ×8）、demo 图片 1.3 MB 未引用却打包、Iconify 运行时 API
  - 输出 `REVIEW.md`（汇总，P0×2 / P1×11）与 `review/infra.md`、`review/frontend.md`、`review/content.md`
  - 主要问题：CI/平台构建缺 Pagefind、分类筛选断路、Footer 双实例+访客 IP 外发、astro check/biome 门禁红、文章 6 处可见错误、两篇随笔重复与口径冲突
- 未修改任何源码；新增审阅文档并更新 SUMMARY/LOG
