# 前端审阅 — 毅白の博客（Astro 5 + Fuwari + Svelte 5 + Tailwind + swup + Pagefind）

审阅对象：`task/1105-newblog` 的 `src/components/**`、`src/layouts/**`、`src/pages/**`、`src/styles/**`、`src/config.ts`、`src/constants/**`、`src/types/**`、`src/env.d.ts`、`src/global.d.ts`、`public/` 静态资源与构建产物一致性。

审阅方式：只读静态审阅（未修改源码、未运行 `pnpm build/dev/install`），交叉核对 `dist/` 产物与 `node_modules` 中的依赖类型/源码。Lead 侧已实跑 `pnpm build` 成功、`pnpm astro check` 失败（3 个 error），本报告引用其结论作为佐证。

---

## 总览

| 级别 | 数量 | 说明 |
|---|---|---|
| P0 | 3 | 阻断 CI 或用户可见功能失效 |
| P1 | 6 | 安全、隐私、资源加载或可访问性上的确定缺陷 |
| P2 | 22 | 代码质量、SEO、a11y 细节、模板残留与「需确认」项 |

整体判断：项目主体沿用 Fuwari 上游架构，功能可用，构建能通过；但后期自定义（Footer CDN/IP 卡片、RouteSwitch 线路切换、分类筛选）引入了若干确定性缺陷，且 CI 的 `astro check` 现在必然失败。主要风险集中在：

1. `astro check` 3 个类型错误导致 GitHub Actions 的 “Build and Check” 工作流必红；
2. Footer 在布局里渲染两次，造成重复 DOM id、重复脚本执行、重复第三方请求，移动端信息不可见；
3. 分类筛选从 URL 到组件实现断链，点击分类看到的是全部文章；
4. 第三方 IP 归属地查询、运行时 iconify 图标请求带来隐私/可用性/性能问题；
5. a11y 与 i18n 有系统性欠账（大量英文 `aria-label`/`alt`、`placeholder="Search"` 等），但 i18n 键本身是完整的。

> 说明：下文每条均标注性质，`【确定】` 表示静态代码/产物已可证实；`【需确认】` 表示依赖运行环境或需实际点击验证。

---

## P0

### P0-1 `astro check` 失败，CI 的 “Build and Check” 工作流必然红灯 【确定】

- **位置**：`src/config.ts:13`；`src/components/Navbar.astro:55-56`；类型定义 `src/types/config.ts:7-17`；CI 见 `.github/workflows/build.yml`（`Run Astro Check: pnpm astro check`）。
- **问题**：
  1. `siteConfig.lang` 写的是 `"zh-CN"`，而 `SiteConfig["lang"]` 联合类型只允许 `"zh_CN"`（下划线）等值，类型不兼容；
  2. `<RouteSwitch client:only="svelte">`、`<LightDarkSwitch client:only="svelte">` 两个 Svelte 组件没有可接收 props 的类型，`client:only` 指令被当成 props 校验，报 `ts(2322)`。
- **证据**：

`src/config.ts:13`
```ts
lang: "zh-CN",
```

`src/types/config.ts:7-17`
```ts
lang:
    | "en"
    | "zh_CN"
    | "zh_TW"
    | "ja"
    | "ko"
    | "es"
    | "th"
    | "vi"
    | "tr"
    | "id";
```

本地 `astro check` 输出（Lead 实跑，`check-full.log`）：
```
src/config.ts:13:2 - error ts(2820): Type '"zh-CN"' is not assignable to type
  '"en" | "zh_CN" | "zh_TW" | "ja" | "ko" | "es" | "th" | "vi" | "tr" | "id"'.
  Did you mean '"zh_CN"'?
src/components/Navbar.astro:56:14 - error ts(2322): Type '{ "client:only": string; }'
  is not assignable to type 'IntrinsicAttributes & Record<string, never>'.
src/components/Navbar.astro:55:14 - 同上（RouteSwitch）
Result (57 files): 3 errors
```
- **影响**：`pnpm build` 能过（Astro 构建不做类型检查），但 `.github/workflows/build.yml` 的 check job 每次 push/PR 必失败，CI 信号完全失效；未来真正的类型错误会被淹没；与「交付前必须验证」的规范冲突。
- **建议**：二选一修复 `lang`：把 `SiteConfig.lang` 联合类型补上 `"zh-CN"`/`"zh-Hans"`（更贴近 `siteConfig` 实际值），或把 `config.ts` 改成 `"zh_CN"`（`i18n()` 内部本来就会 `replace("-", "_")`，运行时两个值都可用）。`client:only` 错误需让 Svelte 组件声明可接收 props（如 `interface Props extends Record<string, unknown> {}` / `let props = $props()`），并核对 `@astrojs/svelte` 与 Astro 版本是否匹配（`@astrojs/svelte 7.2.3` + `astro 5.13.10`）。修复后必须本地复跑 `pnpm astro check` 归零。

---

### P0-2 Footer 被渲染两次：重复 DOM id、脚本重复执行、移动端 CDN 信息失效 【确定】

- **位置**：`src/layouts/MainGridLayout.astro:90-98`（两处 `<Footer>`）；`src/components/Footer.astro:57-66`（id 定义）、`Footer.astro:91-326`（内联脚本）。
- **问题**：桌面版 Footer 放在 `<main id="swup-container">` 内（90-92 行），移动版放在 main 外（96-98 行），两份 Footer 结构完全相同，导致页面出现两套 `cdn-info` / `server-ip` / `client-ip` / `provider-container` / `ipv6-container` / `vercel-warning` id；Footer 的 `<script is:inline>` 也被输出两次并在首屏执行两次。
- **证据**：

`src/layouts/MainGridLayout.astro:90-98`
```astro
<div class="footer col-span-2 onload-animation hidden lg:block">
    <Footer></Footer>
</div>
...
<div class="footer col-span-2 onload-animation block lg:hidden">
    <Footer></Footer>
</div>
```

`src/components/Footer.astro:57-66`（同一组 id 出现两次）
```html
<div id="cdn-info" ...>
  <span id="server-ip">...</span>
  <span id="client-ip">...</span>
  <span id="provider-container"></span>
</div>
```

产物验证（今日构建的 `dist`）：
- `dist/index.html` 中 `function detectCDN` 出现 **2 次**、`function getGeoInfo` 出现 **2 次**；
- `dist/index.html`、`dist/posts/<slugs>/index.html` 中 `id="cdn-info"` 均出现 **2 次**。

- **影响**：
  1. 首屏即执行两遍 `detectCDN()`：访客 IP 被同时发往 `api64.ipify.org`/`cloudflare-dns.com`，归属地查询同时发往 `api.vore.top` 与 `api.ip.sb`，请求翻倍且属于第三方外发；
  2. `document.getElementById` 只命中文档中第一份（桌面那份，移动端 `display:none`），因此**移动端可见的 Footer 永远停在“获取中...”**，CDN/IP 卡片对手机用户不可用；
  3. 重复 id 违反 HTML 规范，影响可访问性与后续脚本（`getElementById` 语义被破坏）；
  4. swup 只替换 `<main>` 内的那份 Footer，导航后两份状态不一致；且 `@swup/astro` 开启了脚本重执行（`node_modules/@swup/astro/dist/script.js:58` `SwupScriptsPlugin: reloadScripts`），每次站内跳转都会再执行一次容器内的 Footer 脚本、再注册一次 `swup:contentReplaced` 监听器，请求量随导航次数累积。
- **建议**：Footer 只保留一个实例，用 CSS（`lg:block` 等）控制桌面/移动的展示方式；若必须两份，则把几何信息/脚本抽成单一模块只渲染一次（例如把 Footer 移出 swup 容器）。修复后检查 `dist/index.html` 中 `id="cdn-info"` 与 `detectCDN` 各只剩 1 次。

---

### P0-3 分类筛选完全失效：`?category=` 参数没有任何消费者 【确定】

- **位置**：`src/components/ArchivePanel.svelte:26-28、44-50`；`src/utils/url-utils.ts:24-32`；调用方 `src/components/PostMeta.astro:56`、`src/components/widget/Categories.astro:28`。
- **问题**：分类链接生成 `/archive/?category=xxx`（未分类为 `?uncategorized=true`），但归档组件只读取 `tag` 参数并只按标签过滤，`category`/`uncategorized` 被完全忽略。
- **证据**：

`src/components/ArchivePanel.svelte:26-28`
```ts
/* 只保留 tag 参数 */
const params = new URLSearchParams(window.location.search);
const tags = params.has("tag") ? params.getAll("tag") : [];
```
`src/components/ArchivePanel.svelte:44-50`
```ts
if (tags.length > 0) {
  filteredPosts = filteredPosts.filter(
    (post) => Array.isArray(post.data.tags) && post.data.tags.some((tag) => tags.includes(tag)),
  );
}
```
`src/utils/url-utils.ts:24-32`
```ts
export function getCategoryUrl(category: string | null): string {
  if (!category || ... category.trim().toLowerCase() === i18n(I18nKey.uncategorized).toLowerCase())
    return url("/archive/?uncategorized=true");
  return url(`/archive/?category=${encodeURIComponent(category.trim())}`);
}
```
- **影响**：文章页「分类」链接、侧边栏「分类」列表点击后进入归档页，URL 参数正确但列表仍展示全部文章，用户会误以为筛选无效/点击无反应；未分类文章无法单独查看。这是从 URL 生成到组件实现之间的断路，属于确定的功能缺陷。
- **建议**：在 `ArchivePanel` 中补齐 `category` 与 `uncategorized` 的过滤逻辑（与 `getCategoryUrl` 的编码、trim、i18n 未分类名保持一致），或把归档筛选改造成服务端可生成的路由/静态页。

---

## P1

### P1-1 `/favicon.ico` 引用不存在，站点图标 404 【确定】

- **位置**：`src/config.ts:32-37`；`public/`；`src/components/RouteSwitch.svelte:45、54`。
- **问题**：`siteConfig.favicon` 只声明 `src: "/favicon.ico"`，但 `public/` 下并没有 `favicon.ico`——只有 `public/favicon_logosc/favicon.ico`（多了一层目录）和 `public/favicon/favicon-light|dark-*.png`。`MenuGridLayout/Layout` 的 `<link rel="icon">` 因此指向 404；`RouteSwitch` 的测速 warmup 也在请求各子站的 `/favicon.ico`，同样 404。
- **证据**：

`src/config.ts:32-37`
```ts
favicon: [
  { src: "/favicon.ico", sizes: "any" },
],
```
`public/` 实际内容（无根级 favicon.ico）：
```
public/avatar.jpg
public/favicon_logosc/favicon.ico        <-- 路径多一层
public/favicon/favicon-dark-32.png ...
public/SVG/edgeone.svg、ipv6-s1.svg、vip.png
```
`dist/` 顶层同样只有 `favicon/`、`favicon_logosc/` 两个目录，没有 `favicon.ico`；`dist/index.html` 输出 `<link rel="icon" href="/favicon.ico" sizes="any">`。
`src/components/RouteSwitch.svelte:45`
```ts
await fetch(`${url}/favicon.ico?warmup=${Date.now()}`, { method: "HEAD", ... });
```
- **影响**：浏览器标签页/收藏夹没有图标（404）；`config.ts` 里覆盖了上游的 `defaultFavicons`（`src/constants/icon.ts`，8 个明暗 PNG），等于把现成的多尺寸图标配置弃用了；RouteSwitch 的预热请求也打在一个 404 路径上。
- **建议**：把 `public/favicon_logosc/favicon.ico` 移动到 `public/favicon.ico`，并改用 `defaultFavicons` 或补齐多尺寸 favicon 配置；RouteSwitch 的 warmup 改用确实存在的静态资源（或直接用 `/`）。

### P1-2 Svelte 侧图标在运行时请求 `api.iconify.design`，未打包进构建 【确定（构建产物佐证）】

- **位置**：`src/components/RouteSwitch.svelte:118`（`tabler:switch-3`）；`src/components/Search.svelte:146、156、168、181`；`src/components/LightDarkSwitch.svelte:64、67、70、80、87、94`；`src/components/widget/DisplaySettings.svelte:29`；`astro.config.mjs:50-57`。
- **问题**：这些组件使用 `@iconify/svelte` 的 `<Icon>`，项目没有 `addCollection`/离线图标数据，也没有在 `astro-icon` 的 `include` 中声明对应前缀（`astro.config.mjs` 只列了 `fa6-brands`/`fa6-regular`/`fa6-solid` 和一个明显是垃圾的 key `"preprocess: vitePreprocess(),"`）。Lead 验证：`tabler:switch-3` 未打包，构建产物 `dist/_astro/Icon.CIj4HIPI.js` 内包含 `api.iconify.design`。
- **证据**：
```ts
// astro.config.mjs:50-57
icon({
  include: {
    "preprocess: vitePreprocess(),": ["*"],   // ← 上游 svelte 配置误粘贴，垃圾 key
    "fa6-brands": ["*"],
    "fa6-regular": ["*"],
    "fa6-solid": ["*"],
  },
}),
```
```svelte
<!-- RouteSwitch.svelte:118 -->
<Icon icon="tabler:switch-3" class="text-[1.25rem]" />
```
- **影响**：首屏图标（搜索、主题切换、线路切换）要等一次第三方网络请求才显示；国内网络访问 `api.iconify.design` 可能慢或被阻断，图标空白；离线/PWA 场景不可用；额外暴露访客 IP 到第三方。`@iconify-json/material-symbols` 虽在依赖里，但 Svelte 侧没有走本地数据。
- **建议**：给 Svelte 侧统一使用本地打包——`@iconify/svelte` 的 `addCollection(require('@iconify-json/material-symbols/icons.json'))`（或改用 `astro-icon` 在 SSR 渲染为内联 SVG）；`tabler:switch-3` 换成已在依赖内的前缀（`material-symbols:swap-horiz` 之类）或补装 `@iconify-json/tabler`；顺手删掉 `"preprocess: vitePreprocess(),"` 这个错误 key。

### P1-3 Footer 在每个页面访问都向 3 个境外第三方 API 查询访客 IP 与归属地 【确定】

- **位置**：`src/components/Footer.astro:97、132、214、230`。
- **问题**：`detectCDN()` 会：`fetch("https://api64.ipify.org?format=json")` 取访客公网 IP；`fetch("https://api.vore.top/api/IPdata?ip=...")` 和 `fetch("https://api.ip.sb/geoip/...")` 查归属地；`fetch("https://cloudflare-dns.com/dns-query?...")` 做 DoH 解析。这些都是默认开启、无开关、无告知。
- **证据**：
```ts
// Footer.astro:214
const ipifyRes = await fetch("https://api64.ipify.org?format=json");
// Footer.astro:97
const res = await fetch(`https://api.vore.top/api/IPdata?ip=${ip}`, { signal: AbortSignal.timeout(2000) });
// Footer.astro:132
const res = await fetch(`https://api.ip.sb/geoip/${ip}`, { headers: { Accept: "application/json" }, ... });
// Footer.astro:230
const dnsRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=${queryType}`, ...);
```
- **影响**：每位访客的 IP 至少被发送给 ipify、vore.top、ip.sb、Cloudflare 四方；与国内隐私合规/告知义务冲突；同时每次访问多 4~6 个跨域请求，弱网下拖慢首屏（虽然不阻塞渲染）；任一 API 变更/限流都会在页脚出现「获取中...」或错误信息。
- **建议**：优先改为部署平台在响应头/边缘函数提供（Cloudflare 的 `CF-Connecting-IP`、Vercel 的 `x-forwarded-for`），完全去掉浏览器端第三方查询；如果保留，至少加配置开关、失败静默、并考虑只查一个且缓存结果。

### P1-4 文章页 JSON-LD 用 `set:html` 直出未转义的 `JSON.stringify`，存在脚本闭合注入风险 【确定（写法不安全），实际可利用性低】

- **位置**：`src/pages/posts/[...slug].astro:50`。
- **问题**：JSON-LD 通过 `<script ... set:html={JSON.stringify(jsonLd)}>` 直出；`jsonLd` 的 `headline`/`description`/`keywords` 来自文章 frontmatter。`JSON.stringify` 不转义 `</script>`、`<!--`、U+2028/U+2029，标题里只要出现 `</script><script>...` 就能闭合脚本标签。
- **证据**：
```astro
<script is:inline slot="head" type="application/ld+json" set:html={JSON.stringify(jsonLd)}></script>
```
（产物中已确认该脚本存在：`dist/posts/.../index.html` 含 `application/ld+json` 与 `{"@context":...}`）
- **影响**：当前内容全部由博主自己撰写，实际被利用概率低；但属于不安全写法，一旦接受外部投稿、或 frontmatter 被脚本批量生成，就可能变成存储型 XSS。
- **建议**：改为转义后输出，例如：
```ts
const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
```
并用 `<script is:inline slot="head" type="application/ld+json" set:html={safeJsonLd}></script>`。

### P1-5 Footer 监听 `swup:contentReplaced` 与 swup v4 事件命名不一致，且监听器随导航累积 【需确认 / 部分确定】

- **位置**：`src/components/Footer.astro:325`；对照 `src/layouts/Layout.astro:408`、`src/components/misc/Comment.astro:95`。
- **问题**：Footer 用 DOM 事件 `document.addEventListener("swup:contentReplaced", detectCDN)`；项目其他位置用的是 swup v4 的 hooks API `window.swup.hooks.on("content:replace", ...)`。`swup` 版本为 4.8.2（`node_modules/.pnpm/swup@4.8.2`），v4 官方事件名为 `content:replace`，`contentReplaced` 是 v3 命名。另外 `@swup/astro` 启用了脚本重执行（`node_modules/@swup/astro/dist/script.js:58` `SwupScriptsPlugin: reloadScripts`），被替换容器里的内联脚本每导航一次就重跑一次。
- **证据**：
```ts
// Footer.astro:325
document.addEventListener('swup:contentReplaced', detectCDN);
// Layout.astro:408
window.swup.hooks.on('content:replace', initCustomScrollbar)
// Comment.astro:95
window.swup.hooks.on('content:replace', handleSwup);
```
- **影响**：若 `swup:contentReplaced` 在 4.8.2 中已不存在，则该监听是死代码，导航后靠脚本重跑里的立即调用兜底；若仍保留兼容别名，则每次导航都会重复触发 `detectCDN`（叠加 P0-2 的双实例问题会放大成 2×N 次第三方请求）。无论哪种，监听器不清理都会累积。
- **建议**：统一改用 `window.swup.hooks.on("page:view", ...)` 或 `"content:replace"`，并在 `detectCDN` 入口加防重入（例如记录上次执行时间/`data-cdn-init` 标记），在 `visit:start` 清理旧监听（`hooks.off`）。

### P1-6 搜索结果摘要用 `{@html}` 直出，安全性依赖 Pagefind 的转义行为 【需确认】

- **位置**：`src/components/Search.svelte:184`。
- **问题**：`{@html item.excerpt}` 把 Pagefind 返回的摘要当 HTML 插入。Pagefind 的 excerpt 约定只包含 `<mark>` 且对原文转义，但这是外部依赖的隐式契约；一旦 Pagefind 升级、索引内容来源变化（或摘要里混入未转义片段），就会成为注入点。
- **证据**：
```svelte
<div class="transition text-sm text-50">
    {@html item.excerpt}
</div>
```
（本项目 `src/` 内 `set:html`/`innerHTML`/`{@html}` 全部调用点：`Comment.astro:40` 清空容器、`Footer.astro:301` 拼接静态模板、`Search.svelte:184`、`posts/[...slug].astro:50` JSON-LD；无 `v-html`、无 `document.write`、无 `eval`。）
- **影响**：低概率 XSS；但违反「外部数据不直接当 HTML」的稳妥原则。
- **建议**：对 excerpt 做一次白名单处理（只保留 `<mark>`，其余转义），或自己按 `item.excerpt` 的文本重建高亮；同时可以只在 PROD 下信任 Pagefind 并加注释说明。

---

## P2

### P2-1 Banner 参数与配置是死代码，文章封面永远无法作为 banner 【确定】
- **位置**：`src/layouts/Layout.astro:41-46`、`src/layouts/MainGridLayout.astro:55-60`、`src/pages/posts/[...slug].astro:49`。
- **证据**：
```astro
// Layout.astro:41-46
if (!banner || typeof banner !== "string" || banner.trim() === "") {
  banner = siteConfig.banner.src;
}
// TODO don't use post cover as banner for now
banner = siteConfig.banner.src;   // 无条件覆盖，前面判断作废
```
```astro
// posts/[...slug].astro:49
<MainGridLayout banner={entry.data.image} ...>
```
- **影响**：`banner` prop 永远被忽略；`siteConfig.banner.enable = false`（`config.ts:19`）时 banner 相关 DOM/CSS/JS 仍全部输出（`Layout` 内联样式、`MainGridLayout` 的 `#banner-wrapper`、`Layout.astro:355-365` `showBanner`），属于纯死代码/冗余 CSS。
- **建议**：删掉无条件覆盖与 TODO，或真正启用封面 banner；`banner.enable=false` 时把 banner 的样式与脚本一起裁掉。

### P2-2 `Layout.astro` 大量注释死代码与过期 TODO 【确定】
- **位置**：`src/layouts/Layout.astro:216-258`（字体预加载、`disableAnimation` 整段注释）、`368`（`// disableAnimation()() // TODO`）、`380-390`。
- **证据**：注释块约 40 行，`init()` 里还留着 `// disableAnimation()()		// TODO`。
- **影响**：可读性与维护成本；容易误导后续接手者。
- **建议**：删除不再需要的注释代码；若字体预加载还要做，用 Astro 的 `astro:preload`/`<link rel="preload">` 重新实现。

### P2-3 `page:view` 与 `visit:end` 对 `#page-height-extend` 的处理重复且注释与实现相反 【确定】
- **位置**：`src/layouts/Layout.astro:430-436` 与 `437-450`。
- **证据**：
```js
window.swup.hooks.on('page:view', () => {
  // hide the temp high element when the transition is done
  const heightExtend = document.getElementById('page-height-extend')
  if (heightExtend) { heightExtend.classList.remove('hidden') }   // 实际是“显示”
});
window.swup.hooks.on('visit:end', (_visit) => {
  setTimeout(() => { ... classList.add('hidden') ... }, 200)
});
```
- **影响**：`page:view` 的行为与注释相反；与 `visit:end` 的隐藏逻辑配合混乱，后续改动容易出滚动跳动。
- **建议**：合并到一处（建议只在 `visit:end` 隐藏，`page:view` 不再重复操作），并修正注释。

### P2-4 SEO head 缺 `og:image`/`twitter:image`，且 `twitter:card` 声明为 `summary_large_image` 【确定】
- **位置**：`src/layouts/Layout.astro:88-101`。
- **证据**：head 有 `og:title/description/type/url` 与 `twitter:card=summary_large_image`，但全站无 `og:image`/`twitter:image`；文章 frontmatter 的 `image` 也没有写进 meta。
- **影响**：分享到微信/Telegram/X 时无封面大图，`summary_large_image` 声明与实际不符（部分平台回退为无图卡片）。
- **建议**：文章页用 `entry.data.image`（配合 `astro:assets` 生成绝对 URL）输出 `og:image`/`twitter:image`；无图时退回站点默认图，或把 `twitter:card` 改为 `summary`。

### P2-5 `viewport` 缺 `initial-scale=1` 【确定】
- **位置**：`src/layouts/Layout.astro:103`。
- **证据**：`<meta name="viewport" content="width=device-width" />`
- **影响**：移动端 1:1 缩放的最佳实践缺失（部分 Android/WebView 会有默认缩放差异）。
- **建议**：改为 `content="width=device-width, initial-scale=1"`。

### P2-6 可访问性与 i18n：大量英文 `aria-label`/`alt` 与硬编码占位文案 【确定】
- **位置与证据**：
  - `src/components/control/BackToTop.astro:8` `aria-label="Back to Top"`
  - `src/components/widget/DisplaySettings.svelte:26` `aria-label="Reset to Default"`
  - `src/components/widget/Profile.astro:10` `aria-label="Go to About Page"`；`:19` `alt="Profile Image of the Author"`
  - `src/components/LightDarkSwitch.svelte:62` `aria-label="Light/Dark Mode"`
  - `src/components/Navbar.astro:51` `aria-label="Display Settings"`、`:57` `aria-label="Menu"`、`:57` `name="Nav Menu"`
  - `src/components/RouteSwitch.svelte:113` `aria-label="Change Route"`
  - `src/components/Search.svelte:154` `aria-label="Search Panel"`、`:169` `placeholder="Search"`
  - `src/layouts/MainGridLayout.astro:56` `alt="Banner image of the blog"`、`:70` `aria-label="Visit image source"`
  - `src/components/PostCard.astro:91` `alt="Cover Image of the Post"`
  - `src/layouts/Layout.astro:324` `container.setAttribute('aria-label', 'scrollable container for formulas')`
  - `src/components/widget/Categories.astro:30`、`src/components/widget/Tags.astro:26`、`src/components/PostMeta.astro:56、73`、`src/components/control/Pagination.astro:55、72、77` 均为英文 aria-label。
- **影响**：中文站点的屏幕阅读器用户听到中英混排的可访问名称；i18n 键虽然齐全（10 个语言文件 × 25 个 key，已脚本校验无缺键），但界面仍大量硬编码英文/中文，`siteConfig.lang` 实际只影响 `<html lang>` 和少量文案。
- **建议**：把这些可访问名称/alt/占位文案收进 `I18nKey`（新增 `backToTop`、`displaySettings`、`searchPlaceholder` 等键），统一走 `i18n()`。

### P2-7 分类为 null 时 `aria-label` 会输出 “null” 【确定】
- **位置**：`src/components/PostMeta.astro:56`。
- **证据**：
```astro
<a href={getCategoryUrl(category)} aria-label={`View all posts in the ${category} category`}>
  {category || i18n(I18nKey.uncategorized)}
</a>
```
- **影响**：未分类文章的可访问名称变成 “View all posts in the null category”；同时是英文。
- **建议**：先用 `category || i18n(I18nKey.uncategorized)` 计算展示名，再生成 aria-label（并本地化）。

### P2-8 分页组件的键盘/读屏细节与禁用态 【确定】
- **位置**：`src/components/control/Pagination.astro:55-58、63-83`。
- **证据**：当前页用 `<div class="h-11 w-11 ...">` 渲染，没有 `aria-current="page"`；上一页/下一页在不存在时仍输出 `<a href="" aria-label={null}>`，样式类 `.disabled` 只做 `pointer-events-none`（`src/styles/main.css:37-39`），键盘用户仍能 Tab 到并按 Enter 触发一次当前页跳转；分页链接 `aria-label={`Page ${p}`}` 英文。
- **影响**：读屏无法获知当前页；键盘用户会触发无意义导航。
- **建议**：当前页改 `<span aria-current="page">`；无上一页/下一页时不输出 `<a>`（或 `aria-disabled="true" tabindex="-1"`）；补 `i18n` 文案。

### P2-9 `<a>` 内嵌 `<button>` 的非法交互嵌套 【确定】
- **位置**：`src/components/control/ButtonLink.astro:9-10`（侧边栏分类使用）。
- **证据**：
```astro
<a href={url} aria-label={label}>
    <button class:list={...}>
```
- **影响**：HTML 规范不允许交互元素嵌套交互元素，读屏会同时暴露 link 与 button；点击行为依赖冒泡，容易出现双重焦点/双重激活语义。
- **建议**：去掉内层 `<button>`，把样式直接加在 `<a>` 上（或改为真正的 button + JS 导航）。

### P2-10 外链 `target="_blank"` 缺 `rel="noopener noreferrer"` 【确定】
- **位置**：`src/components/widget/Profile.astro:27、31`（只有 `rel="me"`）、`src/components/Navbar.astro:37`（外链导航，无 rel）、`src/components/widget/NavMenuPanel.astro:17`（同上）、`src/components/misc/License.astro:39`、`src/components/Footer.astro:19、27、38、46`。
- **影响**：现代浏览器已默认 `noopener`，但显式声明仍是安全基线；`rel="me"` 更不该单独使用。
- **建议**：统一加 `rel="noopener noreferrer"`（`Profile` 可写 `rel="me noopener noreferrer"`）。

### P2-11 图片没有 `loading`/`decoding`，列表页封面全部即时加载 【确定】
- **位置**：`src/components/misc/ImageWrapper.astro:52-53`；`src/components/PostCard.astro:91-92`；`src/pages/posts/[...slug].astro:102`。
- **证据**：`<img src={...} alt={alt || ""} class={imageClass} style={imageStyle}/>`，全站产物 `<img>` 均无 `loading` 属性（抽取帖子页统计：7 个 `<img>`，0 个带 `loading`）。
- **影响**：首页 8 张封面与文章内图片全部立即下载，移动端首屏带宽压力大；本地图片虽经 `astro:assets` 优化，但仍未懒加载。
- **建议**：非首屏图片加 `loading="lazy" decoding="async"`；封面图可加 `fetchpriority="high"`；同时给 `<Image>` 传 `widths/sizes` 避免 CLS。

### P2-12 Search 组件遗留问题（模板文案/死变量/legacy 语法/无键盘关闭） 【部分确定】
- **位置**：`src/components/Search.svelte:16-32、12、128-138、169、184、190-197`。
- **证据**：
  - `:169` 移动端 `placeholder="Search"` 硬编码英文，而桌面端 `:147` 已用 `i18n(I18nKey.search)`；
  - `:16-32` `fakeResult` 是英文开发占位数据（"This Is a Fake Search Result" / "Try running npm build && npm preview"），仅 DEV 使用，但代码保留在组件里；
  - `:12` `isSearching` 只写不读；
  - `:128-138` 用 legacy `$:` 响应式，与其他组件的 Svelte 5 runes 风格混用；
  - 搜索面板只能点按钮开关，没有 `Escape` 关闭、没有焦点进入/返回、没有 `aria-expanded`。
- **影响**：中文站点出现英文占位；开发残留易误当成真实结果；a11y 不达标。
- **建议**：占位与 fake 数据都走 i18n 或移除；`isSearching` 用于 loading 态；统一 runes 写法；补 `Escape`/焦点管理/`role="dialog"` 语义。

### P2-13 构建期重复渲染 Markdown 与直接改写入参 【确定】
- **位置**：`src/pages/posts/[...slug].astro:27、29`；`src/components/PostCard.astro:43`；`src/utils/content-utils.ts:24-29`。
- **证据**：
```ts
// posts/[...slug].astro
const { Content, headings } = await entry.render();
const { remarkPluginFrontmatter } = await entry.render();   // 同一篇文章 render 两次
// PostCard.astro:43
const { remarkPluginFrontmatter } = await entry.render();   // 列表每张卡 render 一次
// content-utils.ts:24-29
sorted[i].data.nextSlug = sorted[i - 1].slug;   // 直接写集合 entry 的 data
```
- **影响**：文章数增长时构建时间线性膨胀（列表页 = 每页 8 次额外 render）；`getSortedPosts()` 每次调用都修改共享的 collection entry，存在跨调用污染风险。
- **建议**：一次 render 解构 `{ Content, headings, remarkPluginFrontmatter }`；阅读时长/字数改用 remark 插件在 frontmatter 缓存或单独 `getCollection` 计算；相邻文章关系改为派生数据而非写回 `data`。

### P2-14 归档页 `client:only` 导致无 SSR/无 JS 空白，且日期口径与页面不一致 【确定/需确认】
- **位置**：`src/pages/archive.astro:12`；`src/components/ArchivePanel.svelte:54、30-34`；`src/utils/date-utils.ts:2`。
- **证据**：
```astro
<ArchivePanel sortedPosts={sortedPostsList} client:only="svelte"></ArchivePanel>
```
产物 `dist/archive/index.html` 中文章列表只存在于 `astro-island` 的序列化 props 里，正文没有渲染出的列表节点。
`ArchivePanel.svelte:54` 用 `post.data.published.getFullYear()`（本地时区），而 `date-utils.ts:2` 用 `date.toISOString().substring(0,10)`（UTC）——两处对同一日期可能跨日/跨年不一致（当 frontmatter 带时区偏移时更明显）。
- **影响**：归档页对爬虫/无 JS 用户不可用（SEO 与降级）；日期显示与归档分组存在潜在不一致。
- **建议**：把 `URLSearchParams` 读取移进 `onMount`，让 `ArchivePanel` 支持 SSR 并改用 `client:load`；日期统一改用本地时区格式化函数（`toLocaleDateString('zh-CN')` 或手写本地格式化），或统一使用 UTC 口径。

### P2-15 Navbar 遗留脚本与调试输出 【确定】
- **位置**：`src/components/Navbar.astro:66-107`、`126、134`；`src/components/Search.svelte:96、102、108、121`。
- **证据**：`switchTheme()` 直接改 `localStorage` 与 `documentElement.classList`，只在 `#scheme-switch` 存在时挂到 `onclick`；而 `#scheme-switch` 现在由 `LightDarkSwitch.svelte:62` 渲染并自带 `onclick={toggleScheme}`。两者若同时生效会一次点击切换两次状态；`Pagefind loaded...` / `Pagefind status on init` 等 `console.log` 留在生产代码里。
- **影响**：主题切换可能出现“点一下跳两档”的竞态（取决于 client:only 水合时机，需实测确认）；控制台噪声。
- **建议**：删除 `Navbar` 里的 `switchTheme`/`loadButtonScript` 遗留逻辑（主题交给 Svelte 组件）；移除 `console.log` 或收敛到 DEBUG 开关。

### P2-16 RouteSwitch 的测速结果不可靠、面板 a11y 与 UI 文案 【确定/建议】
- **位置**：`src/components/RouteSwitch.svelte:39-67、104-108、111-126、125`。
- **证据**：两次 `fetch` 共用一个 `AbortController`（第一个慢时第二个会立即 abort，误报“超时”）；`mode:"no-cors"` 的 opaque 响应永远 `ok=false`，只能测时间不能判可用；`$effect` 未做 cleanup，快速开关面板会产生竞态；`role="menu"` 下放的是普通 `<a>`（没有 `menuitem`/`aria-expanded`），`onmouseleave` 关闭对键盘不友好；标题里用了装饰性 Emoji `📡 线路切换 / 测速`（与工作区 OUTPUT-STYLE 的“不加装饰性 emoji”相冲突）。
- **影响**：线路推荐可能失真；a11y 与视觉规范不达标。
- **建议**：每次 ping 独立 AbortController + 并发/防抖控制；用 `Promise.race` 或真实可读资源替代 favicon；面板补键盘操作（Escape、焦点管理、`aria-expanded`）；去掉装饰 emoji。

### P2-17 类型/配置/命名卫生问题 【确定】
- **位置**：`src/global.d.ts:6`、`src/components/Search.svelte:7`、`astro.config.mjs:52`、`src/components/widget/SideBar.astro:9`、`src/pages/posts/[...slug].astro:52-54`、`src/components/control/Pagination.astro:21`、`src/components/Navbar.astro:57`。
- **证据**：
  - `global.d.ts:4-6` `swup: AstroIntegration;` 下方注释自认 “type from '@swup/astro' is incorrect”；
  - `Search.svelte:7` `import type { SearchResult } from "@/global";`，但 `global.d.ts` 里 `interface SearchResult` 在模块作用域、未 `export`（`astro check` 不检查 `.svelte`，所以没暴露）——需确认 Svelte 侧类型检查是否报错；
  - `astro.config.mjs:52` `"preprocess: vitePreprocess(),": ["*"]` 是误粘贴的垃圾 key；
  - `SideBar.astro:9` 接收 `headings?: MarkdownHeading[]` 但从未使用（`MainGridLayout.astro:83` 仍传参）；
  - `posts/[...slug].astro:52-54` `class:list={["card-base ...", {}]}` 空对象；
  - `Pagination.astro:21` `// for test` 注释残留；`Navbar.astro:57` `name="Nav Menu"` 属性无意义。
- **影响**：类型不安全、配置噪声、可读性下降。
- **建议**：按项清理；`SearchResult` 改为 `global.d.ts` 中 `declare global` 或显式 `export`；`astro-icon` 的 include 只保留真实前缀。

### P2-18 模板残留与静态资源冗余 【确定】
- **位置**：`src/config.ts:20`、`src/assets/images/demo-avatar.png`（416 KB）、`src/assets/images/demo-banner.png`（898 KB）、`public/favicon_logosc/`、`src/components/GlobalStyles.astro`。
- **证据**：`banner.src` 仍指向 `assets/images/demo-banner.png`（且 `banner.enable=false`），`demo-avatar.png` 全仓库无引用；`GlobalStyles.astro` 只有 12 字节（空 frontmatter）且无人引用（上游该组件用于集中 `import` `styles/*.css`/`variables.styl`，本项目的样式导入链路在源码里找不到显式 import，但 `dist` 产物中这些样式确实存在，属于需确认的隐式/历史链路）；`public/favicon_logosc/` 是误放的 favicon 目录。
- **影响**：仓库里留着 1.3 MB 未使用图片与上游 demo 资产；空组件文件是“看起来该用却没接上”的维护陷阱。
- **建议**：删除未引用的 demo 图片与空 `GlobalStyles.astro`；若要保留集中式样式入口，把 `styles/*` 的 import 明确写进 `Layout.astro` 或 `GlobalStyles.astro` 并在 Layout 引入，避免以后换环境/清缓存后丢样式；`favicon_logosc` 移到 `public/favicon.ico`。

### P2-19 RSS 与 URL/标题一致性 【确定/内容层】
- **位置**：`src/pages/rss.xml.ts:26-40`；`src/content/posts/对中式教育的批判.md` 等。
- **证据**：`rss.xml.ts:35-37` 直接 `sanitizeHtml(parser.render(...))`，正文中的相对链接与相对图片路径没有绝对化，RSS 阅读器里会失效；另外 frontmatter 标题与文件名不一致（例如 `对中式教育的批判.md` 的 `title: 标准件的诞生：当学校开始按照分数称量学生`），RSS 里会有“标题是 A、链接是 B”的观感，`post.slug` 仍是文件名。
- **影响**：RSS 订阅体验与一致性；SEO 的标题/URL 语义偏差。
- **建议**：RSS content 中的链接/图片统一转绝对 URL（可加 `<base>` 或渲染后替换）；文件名/slug 与标题保持一致（重命名文件时注意保留旧链接 301，或用 frontmatter 自定义 slug）。

### P2-20 `innerHTML` 拼接第三方数据与 giscus 生命周期 【低风险/建议】
- **位置**：`src/components/Footer.astro:264-301`；`src/components/misc/Comment.astro:64-101`。
- **证据**：`providerContainer.innerHTML = providerHtml`，其中 Cloudflare 分支把 `/cdn-cgi/trace` 返回的 `coloCode` 直接插进模板字符串（`${coloCode ? `(${coloCode})` : ""}`），其余为静态模板；`Comment.astro` 的 `MutationObserver` 只创建一次、从不 `disconnect()`，`window.giscusThemeObserver`/`window.giscusSwupBound` 也未在 `global.d.ts` 声明。
- **影响**：如果 `/cdn-cgi/trace` 响应被中间人/边缘配置篡改，存在注入可能（风险很低）；输入框主题同步依赖全局监听，长期运行无清理。
- **建议**：用 `textContent`/DOM API 构建 provider 徽标；给 `MutationObserver` 加生命周期清理；在 `global.d.ts` 补 `giscusThemeObserver`/`giscusSwupBound` 类型。

### P2-21 `archive`/`about` 等页面的体验细节 【建议】
- **位置**：`src/pages/404.astro:7-18`（无 `noindex`、`min-h-[30rem]` 在窄屏可能溢出）、`src/pages/about.astro:17`（`description` 直接用“关于”两个字，SEO 描述偏弱）。
- **影响**：SEO/移动端观感。
- **建议**：404 页加 `<meta name="robots" content="noindex">`（通过扩展 Layout 的 head slot）；about 页 description 换成一句真实介绍。

### P2-22 `siteConfig.lang` 与模板语言残留的长期一致性 【需确认】
- **位置**：`src/i18n/translation.ts:54-62`、`src/config.ts:13`、`src/i18n/languages/*.ts`（10 个文件）。
- **证据**：键覆盖完整（脚本校验：10 个语言文件各 25 key = 枚举 25 key，无缺键、无多余键），但 `i18n()` 只按 `siteConfig.lang` 选语言，页面上仍存在大量硬编码文案（见 P2-6）；多语言切换能力实际未暴露给用户。
- **影响**：多语言目录是“死能力”，只增加维护面。
- **建议**：要么删掉未使用的语言文件（保留 `zh_CN`/`en`），要么把硬编码文案全部接入 i18n 并提供语言切换；`lang` 类型在 P0-1 修复后同步更新。

---

## 亮点与已确认无问题的部分

- **i18n 键完整**：`src/i18n/i18nKey.ts` 共 25 个 key，10 个语言文件全部覆盖，无缺键/多余键（脚本逐文件对比）。
- **静态资源引用基本正确**：`/avatar.jpg` 存在（53,892 B）；`/SVG/edgeone.svg`、`/SVG/ipv6-s1.svg`、`/SVG/vip.png` 均存在；首页/文章页 SSR 正常（`dist/index.html` 含全部文章标题）。
- **构建产物正确**：`sitemap-index.xml`/`sitemap-0.xml`、`rss.xml`、`robots.txt` 均已生成；`robots.txt` 的 Sitemap 指向 `https://blog.ybovo.com/sitemap-index.xml`，与实际产物一致。
- **XSS 面较小**：无 `v-html`、无 `eval`、无 `document.write`；`set:html` 仅 JSON-LD 一处（见 P1-4），`innerHTML` 两处（一处清空、一处静态模板）。
- **giscus 配置完整**：`repo`/`repoId`/`category`/`categoryId` 均有值，评论组件按 PROD 条件加载并做主题跟随；`Comment.astro` 已处理 swup 的 `content:replace`。
- **swup 约定基本正确**：`containers: ["main", "#toc"]`（`MainGridLayout.astro:85、113` 都提供了对应容器）、`globalInstance: true` 与 `Layout.astro:452` 的 `window.swup.hooks` 判断一致；TOC/PhotoSwipe 在 `page:view` 重建，`BackToTop`、`#toc-wrapper` 放在 swup 容器外，避免引用失效。
- **Pagefind 集成合理**：仅 PROD 动态 `import`，带 HEAD 探活与 `pagefindloaderror` 兜底；搜索面板在 dev 有 mock 数据。
- **图片优化**：本地图片走 `astro:assets` 的 `<Image>` 在构建期生成优化图（`ImageWrapper.astro:52`）。

## 覆盖范围与未覆盖说明

- 已逐文件阅读：`src/components/**`（含 control/misc/widget 共 24 个组件）、`src/layouts/**`（2 个）、`src/pages/**`（6 个）、`src/styles/**`（8 个）、`src/config.ts`、`src/constants/**`、`src/types/**`、`src/env.d.ts`、`src/global.d.ts`、`src/i18n/**`、`src/utils/**`，并核对 `public/` 与 `dist/` 产物。
- 未覆盖：`src/plugins/**`（仅在 XSS/JSON-LD 相关处引用其产物，未逐行审阅）、`node_modules` 全量类型、真实浏览器运行时（未启动 `dev/preview`，按分工由 Lead 做构建验证）；因此标 `【需确认】` 的条目（swup 事件名、Svelte 侧类型、hover/键盘行为、`archive` 序列化 Date 等）建议在 Lead 的预览环境里点验。
- 未修改任何源码；本次仅写入本报告文件。
