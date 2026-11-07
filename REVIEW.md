# newblog 代码审阅报告

- 对象：`https://github.com/ybttkx/newblog`，本地 `task/1105-newblog`，审阅基线 `main@7e8d828`（2026-11-05）
- 时间：2026-11-07
- 范围：`src/` 全部 87 个源码文件、构建/部署/CI 配置、依赖与 lockfile、5 篇文章 + about 页
- 方式：拉取远端 → 三路并行审阅（基础设施 / 前端 / 内容）+ Lead 独立验证；**实跑** `pnpm build`、`pnpm astro check`，并用 `dist/` 产物交叉核对行号与渲染结果。只读审阅，未修改源码。
- 分报告（细节与逐条证据）：`review/infra.md`、`review/frontend.md`、`review/content.md`

## 结论

站点能构建、能浏览，但工程链路和内容质量都还有明确的欠账：

1. **质量门禁是红的**：`astro check` 3 个类型错误、`biome ci` 9 个错误（Linux 快照），两条 CI 工作流都会失败。
2. **生产构建入口不统一**：只有 `pnpm build` 带 Pagefind 索引，CI 和平台预设都只跑 `astro build`，走平台构建会静默丢掉全站搜索。
3. **两个用户可见的功能缺陷**：分类筛选完全失效（点分类仍显示全部文章）；Footer 在每页渲染两份，移动端 CDN/IP 卡片永远显示"获取中"。
4. **线上已有可见错误**：小米手环文章反引号转义错误已渲染成 `<code>）以及 </code>${}`；Next.js 文章标题从"从 Pages"被改成了"from Pages"；`/favicon.ico` 请求 404。
5. **两篇教育随笔**：素材重合 6 处、声明口径冲突（"均为亲历" vs "基于普遍现象"），可识别信息偏多，是本轮唯一涉及合规风险的点。
6. 部署配置、README、`.env.example`、`package.json` 元信息仍停留在上游模板状态。

修复顺序见文末。

## P0（阻断/严重）

### P0-1 生产构建链路不带 Pagefind，搜索会静默失效

- 位置：`package.json:9`、`.github/workflows/build.yml:66-67`、`vercel.json:1`、`src/components/Navbar.astro:109`、`src/components/Search.svelte:66`
- 证据：

  ```jsonc
  // package.json:9 —— 唯一的完整构建入口
  "build": "astro build && pagefind --site dist",
  ```
  ```yaml
  # .github/workflows/build.yml:67 —— CI 只跑前半段
  run: pnpm astro build
  ```
  `vercel.json` 是空对象 `{}`，Vercel 的 Astro 预设默认命令为 `astro build`。

- 影响：按 CI 产物或平台预设部署后，`/pagefind/pagefind.js` 不存在，`Navbar.astro` 的 HEAD 探活失败，`Search.svelte` 降级为无结果——构建不报错，搜索按钮还在，属最难发现的一类故障。
- 说明：本地 `dist/` 有索引（`page_count: 6`、语言 `zh-cn`），手动 `pnpm build` 正常；线上是否已踩中取决于实际部署命令（见"未验证"）。
- 建议：统一入口——CI 改 `pnpm build`；`vercel.json` 写 `{"buildCommand": "pnpm build", "outputDirectory": "dist"}`；若用 Cloudflare，加 `deploy: "pnpm build && wrangler deploy"` 并在 README 写清。

### P0-2 分类筛选完全失效

- 位置：`src/utils/url-utils.ts:24-32`（生成 `?category=` / `?uncategorized=true`）、`src/components/ArchivePanel.svelte:26-28`（只读 `tag` 参数）、`:44-50`（只按 tag 过滤）
- 证据：

  ```ts
  // ArchivePanel.svelte:27-28
  const params = new URLSearchParams(window.location.search);
  const tags = params.has("tag") ? params.getAll("tag") : [];   // category 从未被读取
  ```
  分类链接来自 `PostMeta.astro:56`、`widget/Categories.astro:28`，点进去 URL 正确、列表不筛选。

- 影响：文章页/侧边栏的分类入口全部点了没反应；未分类文章无法单独查看。这是 URL 生成与组件实现之间的断路，属确定功能缺陷。
- 建议：在 `ArchivePanel` 补齐 `category` / `uncategorized` 过滤（与 `getCategoryUrl` 的编码、trim、i18n 未分类名保持一致），或把归档筛选改成服务端可生成的路由。

## P1（应修）

### P1-1 `pnpm astro check` 失败（3 个类型错误）

实测输出：

```
src/config.ts:13:2 - error ts(2820): Type '"zh-CN"' is not assignable to type '"en" | "zh_CN" | ...'
src/components/Navbar.astro:56:14 - error ts(2322): client:only 不能赋给 IntrinsicAttributes
src/components/Navbar.astro:55:14 - error ts(2322): 同上（RouteSwitch）
Result: 3 errors
```

- `src/config.ts:13` 的 `lang: "zh-CN"` 与 `src/types/config.ts:7-17` 的 `Lang` 联合类型不符。注意运行时 `<html lang="zh-CN">` 正是 Pagefind 与 SEO 想要的值，**不要简单改成 `zh_CN`**；应把 `"zh-CN"` 补进 `Lang` 类型（`Layout.astro:64` 会再处理 `_`→`-`）。
- `Navbar.astro:55-56` 的 `client:only` 类型错误来自 Svelte 组件 props 类型推导（`@astrojs/svelte 7.2.3` + `svelte 5.39`），需给组件显式声明 props 类型或对齐版本。CI 的 `pnpm astro check`（`build.yml:41`）因此必红。

### P1-2 `biome ci` 必红，且本地/CI 结果不一致

- 位置：`.github/workflows/biome.yml:15-20`、`biome.json`、缺失的 `.gitattributes`
- 证据：`git archive` 导出 LF 快照后 `biome ci ./src` 报 **9 errors**——`RouteSwitch.svelte:80,85,89` 使用 `Infinity`（`biome.json` 开了 `useNumberNamespace`）、`config.ts:1-8` import 未排序、`.obsidian/*.json` 格式不符；同一命令在本地 Windows（CRLF）报 74 errors。`biome.yml` 用 `version: latest`，与 `package.json` 固定的 `2.2.5` 不一致。
- 影响：Biome + Build/Check 两条工作流全红；本地 `pnpm format` 会整文件改写行尾，易误提交。
- 建议：修掉 9 处；`biome.yml` 固定版本；补 `.gitattributes`（`* text=auto eol=lf`）或 `biome.json` 设 `lineEnding: "auto"`。

### P1-3 部署配置三处并存、互相矛盾

- 位置：`wrangler.json:1-7`、`vercel.json:1`、`package.json`（无 deploy 脚本、无 wrangler 依赖）、`.github/workflows/`（无 deploy 工作流）
- 证据：`wrangler.json` 的 `"name": "fuwari"` 仍是模板名，只有 `assets.directory`，没有 `not_found_handling`（`dist/404.html` 存在但 Workers 默认不返回）；`vercel.json` 空对象；`RouteSwitch.svelte:4-21` 却有 4 条实际线路（blog / vip / cf / eo）；仓库没有任何文档说明部署在哪、用什么命令。
- 影响：无法按仓库复现部署；`wrangler deploy` 忘记先 build 会推旧产物；Cloudflare 面板会积累同名 `fuwari` Worker。
- 建议：定一条主链路；`wrangler.json` 改名（如 `ybovo-blog`）并补 `not_found_handling: "404-page"`；`package.json` 加 `wrangler` devDependency 与 `deploy` 脚本；README 写清。

### P1-4 线上可见的内容错误（已在 `dist/` 复现）

| 位置 | 问题 | 证据 |
|---|---|---|
| `小米手环9_VelaOS_…md:63` | 反引号未转义，行内代码渲染错乱 | `dist/posts/…/index.html`：`反引号（<code>）以及 </code>${}` 插值…` |
| `小米手环9_VelaOS_…md:24` | 中英残句"快应用 environment 运行在" | 原文 |
| `小米手环9_VelaOS_…md:63` | "页面关联 of JS 脚本" | 原文 |
| `小米手环9_VelaOS_…md:73` | "遇到到了"重复字 | 原文 |
| `与next_js纠缠的一天.md:2` | 标题"项目 from Pages 到 Workers" | `dist/index.html` 已按此渲染 |
| `与next_js纠缠的一天.md:96` | "默认 of CNAME 解析" | 原文 |

- 前两处（标题 `from`、正文 `of`）经 `git log` 溯源，是提交 `7beca7b`"润色"时把"从""默认的"误改所致，属回归。
- 修复：反引号用 `` \` `` 转义或实体 `&#96;`；`environment`→"快应用运行在"；`of`→"的"；`遇到到了`→"遇到了"；标题改回"从 Pages 到"。

### P1-5 `/favicon.ico` 404，深浅色 favicon 配置白配

- 位置：`src/config.ts:32-37`、`public/favicon_logosc/favicon.ico`、`src/constants/icon.ts:5-40`
- 证据：`dist/index.html` 输出 `<link rel="icon" href="/favicon.ico" sizes="any">`，但 `dist/favicon.ico` 与 `public/favicon.ico` 都不存在；真正文件在 `public/favicon_logosc/favicon.ico`。`icon.ts` 的 8 张深浅色 PNG 只有在 `siteConfig.favicon` 为空时才会启用（`Layout.astro:57-58`）。
- 影响：所有页面 favicon 404；`RouteSwitch.svelte:45,54` 也用 `/favicon.ico` 做测速探测点，语义错误。
- 建议：`src` 改为 `/favicon_logosc/favicon.ico`，或清空 `siteConfig.favicon` 使用默认列表；测速探测点换成确定存在的小文件。

### P1-6 `frontmatter.json` 字段名与内容 schema 不一致

- 位置：`frontmatter.json:60-61`（`name: "language"`）对 `src/content/config.ts:13`（`lang`）
- 影响：Front Matter CMS 插件会写 `language:`，Astro Zod object 默认静默剥离未知字段，`entry.data.lang` 永远为空，文章 `inLanguage` 标记无声丢失（当前 5 篇都没写 `lang`，属潜在缺陷）。
- 建议：`name` 改为 `lang`，并补 `updated` 字段。

### P1-7 两篇教育随笔：素材重合 + 声明口径冲突 + 可识别信息偏多

- 位置：`牢笼.md:13`（"文中所写均为本人亲历"）对 `对中式教育的批判.md:12`（"基于基层校园普遍现象分析"）
- 重合清单（6 处）：前 30 名抽走单独成班（`牢笼:25` / `批判:34`）、老师原话（`31` / `37`）、问卷无"其他"输入框（`47` / `16`）、检查前藏卷子（`47` / `16`）、七点进校九点半放学（`57` / `89`）、三甲医院盖章病假（`61` / `106`）。
- 影响：同一批素材两种口径，对照阅读会质疑可信度；同题材长文一周内连发，内容价值被摊薄。
- 附加风险（建议本轮处理）：细节组合（南方多雨＋摇号＋前 30 名单独成班＋无食堂无空调＋厕所无门＋九点半）足以被同校读者/校方定位，而文中含"违规复印试卷""应付检查"等明确指控；作者是在校学生，风险不对等。建议去掉地理/身份定位信息，统一"某市一所普通初中""部分细节系文学化处理"。
- 建议：统一口径（若确为亲历，两篇都写亲历＋模糊处理），把《标准件的诞生》里重合的亲历段落删掉、只做制度分析并引用"前一篇已写过"；或直接合并为一篇。

### P1-8 前端：Footer 渲染两份，重复脚本 + 移动端信息不可见 + 访客 IP 外发

- 位置：`src/layouts/MainGridLayout.astro:90-98`（两处 `<Footer />`）、`src/components/Footer.astro:57-66`（重复 id）、`:91-326`（内联脚本）
- 证据：`dist/index.html` 中 `detectCDN`/`getGeoInfo` 各出现 2 次、`id="cdn-info"` 出现 2 次；`getElementById` 只命中第一份（桌面版，`hidden lg:block`），移动端可见的那份永远不会被更新，停在"获取中..."。`@swup/astro` 开启脚本重执行，每次站内跳转还会再跑一遍。
- 影响：首屏重复执行 `detectCDN`；访客 IP 被发往 `api64.ipify.org`、`api.vore.top`、`api.ip.sb`、`cloudflare-dns.com` 四个第三方，无开关、无告知；重复 id 违反 HTML 规范；请求量随导航次数累积。
- 建议：Footer 只保留一个实例（用 CSS 控制桌面/移动展示），或把脚本抽成只执行一次的模块；IP 归属地优先用部署平台响应头（Cloudflare `CF-Connecting-IP`、Vercel `x-forwarded-for`）替代浏览器端多第三方查询；如保留，加配置开关与隐私说明。

### P1-9 前端：导航栏 `client:only` 组件首屏空白 + 图标运行时依赖外网

- 位置：`Navbar.astro:55-56`、`RouteSwitch.svelte:118`、`Search.svelte:146`、`LightDarkSwitch.svelte`、`dist/_astro/Icon.CIj4HIPI.js`
- 证据：`RouteSwitch`/`LightDarkSwitch`/`Search` 均为 `client:only="svelte"`，SSR 不输出内容；`tabler:switch-3` 不在 `astro.config.mjs` 的 icon include 中，`package.json` 也没有 `@iconify-json/tabler`，构建产物 `Icon.CIj4HIPI.js` 内含 `api.iconify.design`——图标是浏览器运行时从 Iconify API 拉取。`astro.config.mjs:52` 的 include 里还混入 `"preprocess: vitePreprocess(),"` 这个误粘贴的垃圾 key。
- 影响：国内网络下图标可能空白或明显延迟；导航栏右侧按钮在 JS 加载前是空白占位；额外把访客 IP 暴露给第三方。
- 建议：图标改用已安装集合（如 `material-symbols:swap-horiz`），或安装 `@iconify-json/tabler` 并加入 include；组件改 `client:load` 并给固定占位尺寸；删掉垃圾 key。

### P1-10 README 与 `.env.example` 仍是模板/残缺状态

- `README.md`：整篇上游 `saicaca/fuwari` 英文模板（标题 `🍥Fuwari`、Demo 指向上游、Contributing 指向上游），末尾只加了一行" 我的博客"；缺项目用途、环境要求、配置说明、部署指引。
- `.env.example`：不是 env 模板，而是一段中文说明 + **未闭合**的 ` ```bash ` 代码块，没有任何变量行（项目本身确实不需要环境变量，但文件应是合法模板）。
- 建议：README 按五要素重写；`.env.example` 改成纯注释 + 变量说明。

### P1-11 文章页 JSON-LD 用未转义的 `JSON.stringify` 直出

- 位置：`src/pages/posts/[...slug].astro:50`
- 证据：`<script is:inline slot="head" type="application/ld+json" set:html={JSON.stringify(jsonLd)}></script>`；`headline`/`description` 来自 frontmatter，`JSON.stringify` 不转义 `</script>`、`<!--`、U+2028/U+2029。
- 影响：当前内容全部由博主本人撰写，实际被利用概率低；但一旦接受投稿或 frontmatter 被脚本生成，就可能变成存储型 XSS。
- 建议：输出前把 `<` 替换为 `\u003c`（同时处理 U+2028/U+2029），再加 `set:html`。

## P2（建议，按主题归纳）

**仓库卫生**

- `src/content/posts/.obsidian/` 4 个文件被跟踪（`workspace.json` 还残留 Fuwari 模板文章名）→ `git rm -r --cached` 并加 `.gitignore`。
- `src/assets/images/demo-banner.png`（898 KB）与 `demo-avatar.png`（416 KB）未使用，却被打进 `dist/_astro/`（实测存在），HTML 未引用 → 删除。
- `docs/` 7 份上游多语言 README、`.github` issue/PR 模板仍指向上游维护者 → 删除或替换。
- `package.json` 的 name 仍是 `fuwari`、version `0.0.1`，无 `engines`/`repository`/`description`；`preinstall: "npx only-allow pnpm"` 未固定版本；Dependabot 只配 npm 生态、daily 全量分组噪音大。

**配置与脚本**

- `pagefind.yml` 的 `.search-panel` / `#search-panel` 选择器在源码中不存在（无效配置）；索引 6 页 = 5 篇文章 + about 页（`Markdown.astro` 的 `data-pagefind-body`），属预期。
- `biome.json` 排除了不存在的 `src/public/**`；`vcs.useIgnoreFile: false` 让 `.gitignore` 规则不生效。
- `package.json:12` `type-check` 用 `tsc --noEmit --isolatedDeclarations`，对 .astro/.svelte 无意义且无流程调用 → 改成 `astro check` 或删除。
- `frontmatter.json` 的 `previewPath: "'blog'"` 多一层引号。
- `astro.config.mjs` 混用 `.js`/`.ts` 导入扩展名（`custom-copy-button.js` 实为 `.ts`）。

**代码细节**

- `src/utils/content-utils.ts:12-16` 排序比较器永不返回 0（同日文章顺序不稳定）；`:24-29` 直接改写入参 `data.nextSlug/prevSlug`。
- `src/utils/date-utils.ts:2` 用 `toISOString()` 取日期，带时区的时间会偏移一天；`ArchivePanel.svelte:54` 又用本地时区取年份，两处口径不一。
- `src/utils/url-utils.ts:24-32` 用翻译后的"未分类"文案反查分类，属隐式耦合。
- `src/plugins/rehype-component-github-card.mjs:22` 拼写 `attributte`；`:63` `data.language` 为 null 时显示字面量 `null`。
- `Markdown.astro:26` 复制按钮 `navigator.clipboard.writeText` 无失败兜底，aria-label 是英文。
- `PostMeta.astro:56,73`、`Pagination.astro:55,72,77`、`Profile.astro:10,19` 等大量英文 `aria-label`/`alt`；`Pagination` 当前页无 `aria-current`，无首页时仍输出可 Tab 的 `<a>`。
- `ButtonLink.astro:9-10` `<a>` 内嵌 `<button>`（非法交互嵌套）。
- `Search.svelte`：移动端 `placeholder="Search"` 硬编码英文；DEV 假搜索结果是英文；`isSearching` 只写不读；用 legacy `$:` 语法；无 Escape 关闭/焦点管理/`aria-expanded`。
- `[...slug].astro:27,29` 对同一条目调用两次 `entry.render()`；`PostCard.astro:43` 每张卡片再 render 一次（文章增多会拖慢构建）。
- `Navbar.astro:66-107` 的 `switchTheme()` 是死代码（`scheme-switch` 按钮由 `LightDarkSwitch.svelte` 管理，两者同时生效可能点一次切两档）。
- `Layout.astro:41-46` banner 参数被无条件覆盖，`banner.enable=false` 时相关样式/脚本仍全量输出；`Layout.astro:216-258` 有大段注释死代码。
- `Layout.astro:103` viewport 缺 `initial-scale=1`；`Layout.astro:88-101` 有 `twitter:card=summary_large_image` 但没有 `og:image`/`twitter:image`。
- `archive.astro:12` 用 `client:only`，归档页列表无 SSR（`dist/archive/index.html` 只有 island 序列化 props），爬虫/无 JS 用户看不到列表；且 `ArchivePanel` 在 `onMount` 里读取 URL 参数，改成 `client:load` 也不能解决 SSR 内容问题，需要把筛选逻辑前移。
- `Footer.astro:325` 监听 `swup:contentReplaced`，项目其他位置用 swup v4 hooks `content:replace`（`Layout.astro:408`、`Comment.astro:95`），事件名需在预览环境确认；监听器无清理、无防重入。
- 外链 `target="_blank"` 多缺 `rel="noopener"`；`ImageWrapper`/`PostCard` 的图片全无 `loading="lazy"`；`404.astro` 无 `noindex`；`about` 页 description 只是"关于"。
- `Footer.astro:264-301` 用 `innerHTML` 拼接 `/cdn-cgi/trace` 的 `coloCode`（风险很低，但建议改用 DOM API）；`Comment.astro` 的 `MutationObserver` 从不 `disconnect()`。

**文章与 i18n**

- 文件名与标题长期分叉：`牢笼.md`→《成绩之外，无人在乎》、`对中式教育的批判.md`→《标准件的诞生》、`与next_js纠缠的一天.md`；中文 slug 在 URL 里是 `%E6%8B%A2…` 编码，分享/SEO 都不友好。建议改英文 slug 并做重定向。
- `第一篇博客.md`：description 与 title 完全相同；缺 category（全站显示"未分类"）；正文开头多一条孤立 `---` 分隔线。
- `对中式教育的批判.md:88`："倒转的 U 形线"应为"倒 U 形"；"多项调查"缺具体来源；教育部原文是"一般不早于 8:00"而非"不得早于"。`:126` "今天一口气发了两篇"与两篇 `published`（11-04、11-05）矛盾。
- `牢笼.md:41` "致命剂量的味精"字面失真；`:47` 同一段里"印刷问卷"与"系统/输入框"媒介混用；`:4` description 句子成分残缺。
- 小米手环文：标题带 5 个装饰性 Emoji；`:75` "撑满 JerryScript 堆栈"应为"堆内存"；`:111` "接近官方最舒适的 55px 限制"语义矛盾；`:101` "premium（高级）"中英重复；`:16` "都是 HTML/CSS/JS"不准确（快应用是 ux 标记）。
- `与next_js纠缠的一天.md`：`:19` 链接紧贴正文无空行；`:83-85` 把腾讯云 EdgeOne 称作"国外线路"、Cloudflare 称"全球线路"，逻辑打架；`--dangerouslyUseUnsupportedNextVersion` 等 OpenNext 参数名需对照当前文档复核。
- `about.md:4` "一名学生" 与 `config.ts:56` bio "一个学生"不一致；关于页未提智能穿戴方向；标题带装饰 emoji。
- i18n 键齐全（10 语言 × 25 键无缺），但 `tr.ts:10,11,17` 拼写错误、`ja.ts:5-7` 仍是英文；`translation.ts:60` 的 `replace("-", "_")` 只替换第一个连字符，未知语言静默回退 `en`。
- `rss.xml.ts` 用 `MarkdownIt` 直接渲染原文，不走 Astro 的 remark/rehype 管线（数学公式、admonitions、GitHub 卡片在 RSS 里不会正常渲染）；相对链接未绝对化。

## 验证记录（Lead 实跑）

| 项目 | 结果 |
|---|---|
| 拉取 | `git fetch --all` 成功（需 `http.sslBackend=openssl` + 代理 `127.0.0.1:7897`；默认 schannel 报 `SEC_E_NO_CREDENTIALS`）。`origin/main` = `7e8d828` = 本地 HEAD，已是最新；远端另有 5 条 dependabot 分支和 2 条旧功能分支未合，不影响本次审阅 |
| 构建 | `pnpm build` 成功：9 个页面，Pagefind 索引 6 页（zh-cn）。注意：`workspace-write` 沙箱下 Vite 的 `spawn` 会 EPERM，需提权一次（环境限制，非代码问题） |
| 类型检查 | `pnpm astro check` 失败：3 errors（`config.ts:13`、`Navbar.astro:55,56`） |
| 产物核对 | `/favicon.ico` 404 属实；`dist/index.html` 中 `detectCDN` 出现 8 次（脚本两份）；`demo-banner`/`demo-avatar` 共 1.3 MB 在 `_astro/` 但无 HTML 引用；`Icon.js` 含 `api.iconify.design`；RSS/sitemap/robots 正常 |
| 仓库卫生 | `.env` 未跟踪；`dist/`、`node_modules/` 未跟踪；`.obsidian/` 4 个文件被跟踪；无硬编码密钥（`git grep` 扫描零命中） |
| 交叉验证 | 分类筛选断路已读 `ArchivePanel.svelte` 确认（只解析 `tag`）；反引号渲染错误、标题 `from Pages` 已在 `dist/` 产物确认；`about` 页被 Pagefind 索引（解释 page_count=6） |

## 未验证（需人工确认）

- 线上站实际行为、Vercel/Cloudflare/EdgeOne 平台的默认构建命令与当前部署方式——决定 P0-1 是否已在生产触发。
- 文章里的 OpenNext 参数名、EdgeOne 请求头、`ipw.wsmdn.top`/`ybovo.com` 外链可达性——本会话外网受限。
- `Footer.astro:325` 的 `swup:contentReplaced` 在 swup 4.8.2 下是否仍有效；`archive.astro` 的 island 序列化日期在浏览器端是否正常。
- Giscus 线上加载、Pagefind 实际搜索体验、移动端/键盘交互——需浏览器预览。

## 建议修复顺序

1. **让门禁变绿**（半天）：修 `astro check` 3 个错误 → 修 `biome ci` 9 个错误 → 固定 biome 版本 → 补 `.gitattributes`。
2. **统一构建与部署入口**：CI/平台构建统一走 `pnpm build`；`wrangler.json` 改名并补 404 处理；README 写清部署方式。
3. **修线上可见错误**：文章 6 处字词/转义 → favicon 路径 → `frontmatter.json` 的 `lang` → 分类筛选。
4. **内容治理**（作者决定）：两篇随笔去重、统一"亲历/文学化"声明、脱敏后重新发布。
5. **前端收敛**：Footer 只渲染一份、IP 查询改服务端/加开关；RouteSwitch 图标改本地集合、测速不再 hover 触发 8 个请求；补 aria-label 中文与剪贴板兜底。
6. **清理模板残留**：README、`docs/`、`.obsidian/`、demo 图片、`package.json` 元信息。

## 附：分报告

- `review/infra.md`：构建/依赖/部署/CI/工程配置（P0×1、P1×6、P2×13）
- `review/frontend.md`：组件/布局/页面/样式/可访问性（P0×3、P1×6、P2×22）
- `review/content.md`：内容层/i18n/插件/工具/文章逐篇（P1×10、P2×44）
