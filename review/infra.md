# 基础设施审阅

审阅范围：`task/1105-newblog` 的构建、依赖、部署、CI 与工程配置文件。全程只读，未执行 `pnpm install` / `pnpm build` / `pnpm dev`（构建验证由 Lead 负责）；仅运行了只读/无副作用的检查命令（`git ls-files --eol`、`git grep`、`tsc --noEmit`、`biome check/ci` 在临时快照上、`pagefind --help` 与临时目录小实验）。

## 总览

| 等级 | 数量 | 说明 |
|---|---|---|
| P0（阻断/严重） | 1 | CI/平台默认构建命令与 `pnpm build` 不一致，产出的站点缺 Pagefind 搜索索引；一旦按仓库现状部署，全站搜索失效 |
| P1（应修） | 6 | astro 配置写错、`lang` 类型错误导致类型检查失败、Biome CI 必红、部署配置不可复现、README 仍是上游模板、`.env.example` 格式错误 |
| P2（建议） | 13 | 行尾符与 .gitattributes、`.obsidian` 入库、frontmatter 字段不一致、脚本健壮性、CI 版本矩阵、favicon 404 等 |

整体判断：**站点"能构建、能看"，但"能部署、能量产、能协作"这三件事都还没闭环。**

- 依赖侧是健康的：`pnpm-lock.yaml`（lockfileVersion 9.0，408 KB）与 `package.json` 的 55 个依赖逐一比对，无缺失、无多余、specifier 完全一致，`--frozen-lockfile` 可用；`packageManager: pnpm@9.14.4` 有声明。
- 本地 `pnpm build` 是正常的：`dist/pagefind/` 存在完整索引（`dist/pagefind/pagefind-entry.json` 为 `{"version":"1.4.0","languages":{"zh-cn":{...,"page_count":6}}}`），说明 Pagefind 中文索引本身没问题。
- 问题集中在**构建入口不统一**（`pnpm build` vs `astro build` vs 平台默认预设）、**质量门禁已红**（TypeScript / Biome 均可复现报错）和**部署链路没有可复现说明**（`wrangler.json`、`vercel.json`、无 deploy 工作流三者互相矛盾）。
- 安全性结论：`git grep` 扫描 token/key/私钥等模式**零命中**，`.env` 未被跟踪，`dist/`、`node_modules/` 未被跟踪，Git remote 是用户自己的 `github.com/ybttkx/newblog`。无 P0 级泄露。
- 待核实项已单独标注「需确认」，不与确定问题混在一起。

---

## P0（阻断/严重）

### P0-1 CI/部署平台的构建命令与 `package.json` 的构建命令不一致，产物缺搜索索引

**位置**

- `package.json:9`（唯一正确的构建入口）
- `.github/workflows/build.yml:66-67`（CI 构建）
- `vercel.json:1`（部署配置）
- `src/components/Navbar.astro:109-110`、`src/components/Search.svelte:92-96`（消费方）

**问题（确定）**：`pnpm build` 是 `astro build && pagefind --site dist` 两条命令的组合；但仓库里的 CI 和部署配置都只跑前半段 `astro build`，Pagefind 索引不会生成。搜索组件在生产环境依赖 `/pagefind/pagefind.js`，缺索引即搜索整站不可用。

**证据**

```jsonc
// package.json:9
"build": "astro build && pagefind --site dist",
```

```yaml
# .github/workflows/build.yml:66-67
      - name: Run Astro Build
        run: pnpm astro build
```

```jsonc
// vercel.json:1（空对象，未覆盖 Build Command / Output Directory）
{}
```

```astro
<!-- src/components/Navbar.astro:109-110（PROD 下才加载） -->
{import.meta.env.PROD && <script is:inline define:vars={{scriptUrl: url('/pagefind/pagefind.js')}}>
```

```ts
// src/components/Search.svelte:92-96（找不到 pagefind 时搜索降级）
pagefindLoaded = import.meta.env.PROD && !!window.pagefind && typeof window.pagefind.search === "function";
```

对比：本机 `dist/` 是有索引的（`dist/pagefind/pagefind-entry.json` 里 `page_count: 6`，语言 `zh-cn`），说明"有人手动跑过 `pnpm build`"，但只要走 CI 产物或 Vercel 默认预设（Astro 框架预设的默认 Build Command 是 `astro build`，不走 `package.json` 的 `build` 脚本），索引就会消失。

**影响**：部署到任何"按平台预设构建"的环境（Vercel 最典型，其次默认 `astro build` 的 CI 缓存产物）后，搜索按钮仍在、`fetch('/pagefind/pagefind.js')` 404，搜索功能整体失效但不报构建错误——是最难被发现的一类故障。**确定问题**；至于生产环境当前是否已经踩中，取决于实际部署命令（需确认，见 P1-4）。

**建议**：三选一并统一，且 CI 与部署平台必须走同一个入口：

1. `vercel.json` 显式写死：`{"buildCommand": "pnpm build", "outputDirectory": "dist"}`；
2. `.github/workflows/build.yml:67` 改成 `run: pnpm build`，并加 `actions/upload-artifact` 上传 `dist`，让 CI 产物与生产一致、可被直接部署；
3. 若用 Cloudflare，补一个 `deploy` 脚本（`pnpm build && wrangler deploy`）或 deploy 工作流，保证 `wrangler deploy` 之前一定先构建。

---

## P1（应修）

### P1-1 `astro.config.mjs` 的 `icon().include` 混入一个不存在的键（明显的复制粘贴错误）

**位置**：`astro.config.mjs:50-57`（第 52 行）

**问题（确定）**：`include` 的键是图标集名称，这里出现了一个字符串 `"preprocess: vitePreprocess(),"`，显然是 `svelte({ preprocess: vitePreprocess() })` 那行被误粘贴/误删后留下的残渣。同时项目里大量使用 `material-symbols:*` 图标（如 `src/components/PostMeta.astro:33`），却没有在 `include` 里声明。

**证据**

```js
// astro.config.mjs:50-57
icon({
    include: {
        "preprocess: vitePreprocess(),": ["*"],   // <- 不是图标集名
        "fa6-brands": ["*"],
        "fa6-regular": ["*"],
        "fa6-solid": ["*"],
    },
}),
```

**影响**：功能上暂时无害——`astro-icon` 会把"已安装但未显式声明"的图标集自动补全为全量（`node_modules/astro-icon/dist/loaders/loadIconifyCollections.js:9-14`：`for (let name of installedCollections) { if (include[name] !== undefined) continue; include[name] = ["*"]; }`），所以 `material-symbols` 仍能加载。但这是一条**确定写错的配置**，且掩盖了"图标白名单根本没生效"的事实；一旦 `astro-icon` 行为调整或启用按集合裁剪，图标会批量丢失。**确定问题，当前无功能影响。**

**建议**：把第 52 行改为 `"material-symbols": ["*"],`，并顺手补回 `svelte()` 的位置说明（`svelte.config.js` 已提供 `vitePreprocess`，`astro.config.mjs:102` 的 `svelte()` 不需要再传 preprocess，当前写法本身是对的）。

### P1-2 `src/config.ts` 的 `lang: "zh-CN"` 与类型定义不符，`tsc` 直接报错

**位置**：`src/config.ts:13`；类型定义 `src/types/config.ts`（`Lang` 联合类型）；对应脚本 `package.json:12`

**问题（确定）**：`Lang` 类型只接受 `"zh_CN" | "zh_TW" | "en" | ...`（下划线），配置里写的是 `"zh-CN"`（连字符），`tsc` 报 TS2820。

**证据**

```ts
// src/config.ts:11-14
export const siteConfig: SiteConfig = {
	title: "毅白の博客",
	subtitle: "记录折腾、技术与成长",
	lang: "zh-CN",
```

```
$ node_modules\.bin\tsc.CMD --noEmit --isolatedDeclarations
src/config.ts(13,2): error TS2820: Type '"zh-CN"' is not assignable to type '"en" | "zh_CN" | "zh_TW" | "ja" | "ko" | "es" | "th" | "vi" | "tr" | "id"'. Did you mean '"zh_CN"'? [exit code: 2]
```

**影响**：`pnpm type-check` 必然失败；CI 的 `pnpm astro check`（`build.yml:41`）用的是同一份 `tsconfig.json`，**预计同样报错**导致 build 工作流红（需由 Lead 跑构建确认）。运行时 `<html lang="zh-CN">` 恰好是 Pagefind 中文分词与 SEO 想要的取值（`dist/pagefind/pagefind-entry.json` 识别为 `zh-cn`），所以**不要简单改成 `zh_CN`**——会把页面语言标签改坏。

**建议**：在 `src/types/config.ts` 的 `Lang` 中加入 `"zh-CN"`，或在 `src/config.ts` 旁做 `lang: "zh-CN" as Lang` 的映射并保留 HTML 实际取值；然后让 `pnpm type-check` 进 CI，避免类型错误无声堆积。

### P1-3 Biome 质量门禁在 main 上必定失败，且 CI 与本地版本不一致

**位置**：`.github/workflows/biome.yml:15-20`、`biome.json:41-45`、`package.json:15`（lint 脚本）

**问题（确定）**：`biome ci ./src` 在 LF 行尾的干净快照上仍有报错；CI 用 `setup-biome` 的 `version: latest`，与 `devDependencies` 里固定的 `@biomejs/biome 2.2.5`（`package.json:68`）不一致，门禁结果不可复现。本地（Windows + CRLF）更夸张：74 个错误，几乎每个文件都报 format。

**证据**

```yaml
# .github/workflows/biome.yml:15-20
      - name: Setup Biome
        uses: biomejs/setup-biome@f382a98e582959e6aaac8e5f8b17b31749018780 # v2.5.0
        with:
          version: latest
      - name: Run Biome
        run: biome ci ./src --reporter=github
```

用 `git archive HEAD` 导出并强制 LF 行尾后运行（模拟 Linux CI）：

```
$ biome ci ./src --reporter=summary
  - src\components\RouteSwitch.svelte (3 errors)
  - src\config.ts (1 error)
  Rule Name                       Diagnostics
  assist/source/organizeImports   4 (4 errors)
Found 9 errors.
```

同一命令在本地 Windows 工作区（CRLF）：

```
$ node_modules\.bin\biome.CMD check ./src --reporter=summary
... Found 74 errors.
```

分别对应两类问题：

1. **真问题（CI 红）**：`src/components/RouteSwitch.svelte:80,85,89` 使用 `Infinity` 而非 `Number.POSITIVE_INFINITY`（`biome.json:35` 显式开了 `useNumberNamespace: "error"`）；`src/config.ts:1-8` import 未排序（`biome.json:22` 开启 `organizeImports`）；`src/content/posts/.obsidian/*.json` 格式与 Biome 输出不一致。
2. **本地与 CI 不一致**：仓库无 `.gitattributes`，`core.autocrlf=true` 使工作区变成 CRLF（`git ls-files --eol` 显示 `i/lf w/crlf`），而 Biome 默认 `lineEnding: "lf"`，于是本地每个文件都"格式不正确"——开发者无法在本地复现 CI 结果。

**影响**：每次 push 的 "Code quality" 工作流都是红的，门禁形同虚设，团队成员会习惯性忽略 CI；`pnpm format` 在 Windows 上会大范围改写行尾（虽经 autocrlf 归一后 diff 不致命，但极易误提交）。

**建议**：① 修掉 `RouteSwitch.svelte` 的 `Infinity` 与 import 排序，或给 `.obsidian/**` 加 ignore；② `biome.yml` 固定版本（读 `package.json` 或直接写 `2.2.5`），不要 `latest`；③ 增加 `.gitattributes`：`* text=auto eol=lf`（或至少在 `biome.json` 设 `formatter.lineEnding: "auto"`），让本地/CI 判定一致。

### P1-4 部署配置三处并存、互相矛盾，部署过程不可复现

**位置**：`wrangler.json:1-7`、`vercel.json:1`、`.gitignore:23`、`.github/workflows/`（无 deploy 工作流）、`package.json`（无 deploy 脚本、无 wrangler 依赖）

**问题（确定）**：

- `wrangler.json` 的 Worker 名还是模板名 `fuwari`，且只有一个 `assets.directory`，没有 `not_found_handling`（Astro 会产出 `dist/404.html`，见 `src/pages/404.astro`，但 Workers 静态资源默认 `none` 不返回该页——**需确认**你当前的实际行为）；
- `vercel.json` 是空对象 `{}`，既没声明 `buildCommand`（见 P0-1），也没说明站点到底部署在哪；
- 三个部署去向（Vercel、Cloudflare、EdgeOne）在仓库里没有任何一份文档说明；`README.md` 只有上游的"Deploy to Vercel, Netlify, GitHub Pages"泛泛链接；
- `wrangler` 不在 `devDependencies`、没有 `deploy` 脚本、没有 deploy 工作流，`wrangler deploy` 依赖全局安装，且不会自动先构建。

**证据**

```jsonc
// wrangler.json:1-7
{
    "name": "fuwari",                      // 模板名，不是博客名
    "compatibility_date": "2026-01-22",
    "assets": { "directory": "./dist" }    // 无 not_found_handling/html_handling
}
```

```jsonc
// vercel.json（全文 4 字节）
{}
```

```javascript
// src/components/RouteSwitch.svelte:4-21（实际存在 4 条部署线路）
const routes = [
  { name: "主线路 (亚洲)", url: "https://blog.ybovo.com" },
  { name: "三网优化线路", url: "https://vip.blog.ybovo.com" },
  { name: "全球线路 (Cloudflare)", url: "https://cf.blog.ybovo.com" },
  { name: "国外线路 (EdgeOne)", url: "https://eo.blog.ybovo.com" },
];
```

**影响**：新人（或半年后的你）无法按仓库复现生产部署；`wrangler deploy` 若忘记先 `pnpm build`，会把上一次的 `dist`（可能缺 pagefind）直接推上去；Worker 名 `fuwari` 与域名不对应，Cloudflare 面板里会有一堆同名历史 Worker；自定义 404 页面可能只在部分线路生效。**确定问题**。

**建议**：只保留一条主部署链路的配置，另一个删掉或注释说明；`wrangler.json` 改名（如 `ybovo-blog`）、补 `not_found_handling: "404-page"`；`package.json` 增加 `"deploy": "pnpm build && wrangler deploy"` 并把 `wrangler` 放进 devDependencies；README 写清"部署到哪、用什么命令、环境变量是什么"。

### P1-5 README 仍是上游 Fuwari 模板，且与 SUMMARY 的"自动化部署"表述冲突

**位置**：`README.md:1-11`、`:34-50`、`:91-100`

**问题（确定）**：README 整篇是上游 `saicaca/fuwari` 的英文模板：标题 `# 🍥Fuwari`、Demo 指向上游 `fuwari.vercel.app`、Contributing 指向上游仓库、License 徽章是上游 FOSSA 项目；结尾只追加了一行中文" 我的博客"（第 100 行，前面还带空格）。"环境要求/快速启动/配置说明/部署指引"五要素里，**部署与配置两节完全是模板话术**，没有任何本项目信息。

**证据**

```markdown
# README.md:1、9、50、93、99-100
# 🍥Fuwari
[**🖥️ Live Demo (Vercel)**](https://fuwari.vercel.app)
5. Deploy your blog to Vercel, Netlify, GitHub Pages, etc. ...
Check out the [Contributing Guide](https://github.com/saicaca/fuwari/blob/main/CONTRIBUTING.md) ...
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fsaicaca%2Ffuwari.svg?type=large)]
 我的博客
```

**影响**：README 是仓库门面，现在对外展示的是"别人的模板说明"；访客/未来的自己按 README 操作会改错文件、找不到部署方式。`SUMMARY.md:6` 写着"…与自动化部署"，但仓库里没有任何 deploy 自动化（见 P1-4），**文档与事实不符**。

**建议**：重写根 README：项目用途（毅白の博客，6 篇中文文章）、环境要求（Node 版本、pnpm 9）、快速启动（`pnpm install` / `pnpm dev` / `pnpm build` / `pnpm preview`）、环境变量（说明本项目无强制变量）、部署（说明实际部署线路与命令）；上游多语言 README 从 `docs/` 移走或删除。

### P1-6 `.env.example` 不是环境变量模板，且代码块未闭合

**位置**：`.env.example:1-6`

**问题（确定）**：`.env.example` 应该只有"变量名 + 说明"，这里却是一段中文说明 + 一个 **未闭合** 的 ` ```bash ` 代码块，而且没有任何变量行。既不能被工具解析，也不能当模板复制。

**证据**

```
1: # 环境变量模板
2:
3: 本项目为 Astro 纯静态博客，默认构建与运行不需要强制环境变量。
4:
5: ```bash
6: # 如需配置第三方评论系统（如 Giscus / Waline 等）或部署平台环境变量可在此添加
   （文件到此结束，没有闭合的 ```）
```

**影响**：违反工作区"项目五件套"对 `.env.example` 的要求；任何人 `cp .env.example .env` 得到的是一个 Markdown 片段。当前项目确实不需要环境变量（Giscus 的 `repoId` 等是公开值，写在 `src/config.ts:76-82`，不属于密钥），但文件本身应该是合法模板。

**建议**：改成纯 env 文本，例如：

```bash
# 本项目为纯静态博客，构建/运行不需要环境变量。
# 如需接入评论系统或部署平台变量，在此按 KEY=VALUE 追加（真实值请写入本地 .env，已 gitignore）。
```

---

## P2（建议）

### P2-1 缺 `.gitattributes`，CRLF 导致本地 lint 与 CI 结果不一致

**位置**：仓库根（无 `.gitattributes`）；`git config core.autocrlf=true`

**证据**：`git ls-files --eol src/config.ts` → `i/lf w/crlf`；`Test-Path .gitattributes` → `False`。本地 `biome check ./src` 74 errors vs LF 快照 9 errors（见 P1-3）。

**影响**：Windows 开发者本地"格式全错"，`pnpm lint` 会顺手改写行尾；跨平台协作时易产生整文件 diff。

**建议**：提交 `.gitattributes`（`* text=auto eol=lf`），或把 `biome.json` 的 `formatter.lineEnding` 设为 `"auto"`。

### P2-2 Obsidian 工作区配置被提交进仓库

**位置**：`src/content/posts/.obsidian/app.json`、`appearance.json`、`core-plugins.json`、`workspace.json`

**证据**：`git ls-files` 输出包含上述 4 个文件；`workspace.json:16,189-192` 还残留 `video.md`、`2023-08-01.md`、`第一篇.md` 等已不存在的笔记引用。

**影响**：编辑器个人偏好污染仓库、随每次打开 Obsidian 产生无意义 diff；虽无敏感信息，但确实是"该 ignore 的进库文件"。

**建议**：`git rm -r --cached src/content/posts/.obsidian`，并在 `.gitignore` 增加 `.obsidian/`。

### P2-3 `frontmatter.json` 字段名与内容 schema 不一致

**位置**：`frontmatter.json:59-63`、`:16`；对照 `src/content/config.ts:13`

**证据**

```jsonc
// frontmatter.json:59-63（声明 language）
{ "title": "language", "name": "language", "type": "string" }
// src/content/config.ts:13（schema 里是 lang）
lang: z.string().optional().default(""),
// frontmatter.json:16（多包一层引号，疑似错误）
"previewPath": "'blog'",
```

**影响**：Front Matter CMS 面板会写出 `language:` 字段，而 schema/`new-post.js`/README 用的都是 `lang`，产生冗余字段；`previewPath` 的嵌套引号可能导致预览链接拼接异常（**需确认**该字段在 frontmatter.codes 中的正确写法）。

**建议**：把字段改成 `lang`，`previewPath` 改成 `"/posts/[...slug]"`（或删掉该字段），与 `src/content/config.ts` 对齐。

### P2-4 `scripts/new-post.js` 拼 YAML 不健壮

**位置**：`scripts/new-post.js:45-55`（第 46 行）

**证据**

```js
// scripts/new-post.js:45-53
const content = `---
title: ${args[0]}
published: ${getDate()}
description: ''
...
draft: false 
lang: ''
---`
```

**影响**：`pnpm new-post "A: B"` 会生成非法 YAML（冒号未加引号）；传入 `hello.md` 时标题会变成 `hello.md`；`draft: false ` 行尾有一个空格。生成失败在 `astro build` 阶段才暴露。

**建议**：对 `title` 做 JSON.stringify 或统一加双引号（`title: "${title}"`），标题取 `args[0].replace(/\.(md|mdx)$/i, "")`，顺手去掉行尾空格。

### P2-5 `package.json` 仍是模板元信息，且没有 Node 版本约束

**位置**：`package.json:1-4`、`package.json`（无 `engines` / `repository` / `description` / `license`）

**证据**：`"name": "fuwari"`、`"version": "0.0.1"`；README 徽章写 Node ≥ 20（`README.md:2`），CI 矩阵 22/23（`build.yml:20`），本机实际 Node `v24.19.0`，三处不一致且无 `engines` 强制。

**影响**：npm/pnpm 不会阻止在错误 Node 版本上安装；仓库元信息与项目身份不符；依赖安装的 Node 兼容性靠人肉保证。

**建议**：`name` 改为项目名（如 `ybovo-blog`），补 `engines: {"node": ">=22"}`、`repository`、`description`、`license: "MIT"`，并新增 `.nvmrc`（可选）。

### P2-6 `preinstall` 用 `npx` 拉取未固定版本的 `only-allow`

**位置**：`package.json:16`

**证据**：`"preinstall": "npx only-allow pnpm"`——`only-allow` 没有版本号，`npx` 每次可能从 registry 拉最新包；`preinstall` 在 CI 的 `pnpm install --frozen-lockfile`（`build.yml:38`）中也会执行。

**影响**：供应链风险 + 离线/受限网络下安装失败；与 lockfile 的可复现承诺相悖。

**建议**：把 `only-allow` 加进 devDependencies 固定版本，preinstall 改成 `pnpm exec only-allow pnpm`（或用 corepack 的 `packageManager` 约束，已经足够）。

### P2-7 Dependabot 配置不完整、更新策略噪音大

**位置**：`.github/dependabot.yml:3-22`

**证据**：只有 `npm` 生态（`package-ecosystem: "npm"`），没有 `github-actions` 生态——而两个工作流的 actions 全部用 SHA 固定（`build.yml:25,30,33` 等），Dependabot 不配 `github-actions` 就不会提交安全更新 PR。`schedule.interval: daily` + 把 patch 和 minor 全量分组（`patterns: ["*"]`），Astro 生态会被塞进一个大 PR。

**影响**：固定 SHA 的安全更新永远收不到；每日大杂烩 PR 容易长期挂着，反而降低依赖更新的可信度。

**建议**：加 `- package-ecosystem: "github-actions"; directory: "/"; schedule: weekly`；npm 改为 weekly，按 `@astrojs/*`、`astro-*`、`tailwind*` 等分组，或干脆只开 security updates。

### P2-8 `docs/` 与 `.github` 模板仍指向上游仓库

**位置**：`docs/README.es.md:5`、`docs/README.id.md:5`、`docs/README.ja.md:5`、`docs/README.ko.md:5`、`docs/README.th.md`、`docs/README.vi.md`、`docs/README.zh-CN.md:1-5`；`.github/pull_request_template.md`、`.github/ISSUE_TEMPLATE/01-bug_report.yml:5-7`

**证据**：`docs/README.zh-CN.md:1` 为 `# 🍥Fuwari`；PR 模板 checklist 链接 `https://github.com/saicaca/fuwari/blob/main/CONTRIBUTING.md`；Bug 模板 `assignees: [L4Ph, saicaca]` 是上游维护者账号。

**影响**：仓库里 7 份上游翻译文档 + 上游 issue/PR 模板，对个人博客无价值，且会误导贡献者。

**建议**：删除 `docs/` 与上游 issue 模板（或替换为简单模板）；`LICENSE:3` 保留 `saicaca` 版权声明是对的（MIT 二次开发必须保留），可在下方追加自己的版权行。

### P2-9 `/favicon.ico` 被引用但文件不存在，favicon 配置未生效

**位置**：`src/config.ts:32-37`、`public/favicon_logosc/favicon.ico`、`src/constants/icon.ts:5-40`、`src/components/RouteSwitch.svelte:45,54`

**证据**

```ts
// src/config.ts:32-37（站点只配了 /favicon.ico）
favicon: [{ src: "/favicon.ico", sizes: "any" }],
```

```
Test-Path public/favicon.ico  -> False
Test-Path dist/favicon.ico    -> False        # 构建产物根目录也没有
dist/index.html 中出现：<link rel="icon" href="/favicon.ico" sizes="any">
```

而 `src/constants/icon.ts:5-40` 准备了深浅色 8 个 favicon（`/favicon/favicon-light-32.png` 等），只有在 `siteConfig.favicon` 为空时才会被使用（`src/layouts/Layout.astro:57-58`）。另外 `RouteSwitch.svelte:45,54` 把 `/favicon.ico` 当作线路测速的探测端点。

**影响**：浏览器标签页图标 404；深浅色 favicon 白配了；线路测速依赖一个不存在的资源（`mode: "no-cors"` 下不报错，但语义错误）。

**建议**：把 `public/favicon_logosc/favicon.ico` 移到 `public/favicon.ico`（或把 config 改成 `"/favicon_logosc/favicon.ico"`）；或者清空 `siteConfig.favicon` 使用 `src/constants/icon.ts` 的默认列表。

### P2-10 `pagefind.yml` 有无效选择器，索引页数与文章数不一致（需确认）

**位置**：`pagefind.yml:1-6`；索引产物 `dist/pagefind/pagefind-entry.json`

**证据**

```yaml
# pagefind.yml:1-6
exclude_selectors:
  - "span.katex"
  - "span.katex-display"
  - "[data-pagefind-ignore]"
  - ".search-panel"      # src 中不存在该 class
  - "#search-panel"      # src 中不存在该 id
```

grep `src`（`*.astro`、`*.svelte`）无 `search-panel` 命中；`dist/pagefind/pagefind-entry.json` 显示 `page_count: 6`，而 `src/content/posts/` 下只有 5 篇文章（`第一篇博客.md`、`对中式教育的批判.md`、`牢笼.md`、`小米手环9_VelaOS_...md`、`与next_js纠缠的一天.md`），多出的 1 页**需确认**是哪个页面被纳入索引。

**影响**：`pagefind.yml` 确实会被 `pagefind --site dist` 读取（已在临时目录做过对照实验：在 cwd 放 `pagefind.yml` 指定 `output_subdir: custom_pf`，输出目录随之改变，配置生效），所以两项无效选择器属于"配了但没用"；索引多 1 页会让搜索结果混入非文章页。

**建议**：删掉 `.search-panel` / `#search-panel` 两个选择器；用 `--verbose` 或在 `dist` 上重新生成索引时确认多出的页面来源，必要时给列表页/归档页加 `data-pagefind-ignore`。

### P2-11 `biome.json` 有无效路径与未启用的 gitignore 集成

**位置**：`biome.json:3-17`

**证据**

```jsonc
// biome.json:10-16
"includes": ["**", "!**/src/**/*.css", "!**/src/public/**/*", "!**/dist/**/*", "!**/node_modules/**/*"]
// vcs.useIgnoreFile: false（第 6 行）
```

`src/public/` 在仓库中不存在（`public/` 在根目录），该排除项无效；`vcs.useIgnoreFile: false` 意味着 `.gitignore` 的规则（如 `dist/`、`.env`）不会被 Biome 复用，只能靠硬编码排除。

**建议**：删掉 `!**/src/public/**/*`，把 `vcs.enabled/useIgnoreFile` 打开，让忽略规则单一来源。

### P2-12 `type-check` 脚本与 `astro check` 重叠且未被任何流程使用

**位置**：`package.json:12`、`tsconfig.json:7`

**证据**：`"type-check": "tsc --noEmit --isolatedDeclarations"`，但 `isolatedDeclarations`（`tsconfig.json:7` 的 `declaration: true` 配套）对 `.astro`/`.svelte` 文件没有意义；CI 只用 `pnpm astro check`（`build.yml:41`），该脚本没有任何入口调用。

**影响**：脚本名容易误导（以为等价于 CI），实际跑出来的是 P1-2 那类类型错误；而真正进 CI 的 `astro check` 覆盖范围又没人在本地跑。

**建议**：删掉该脚本，或改成 `"type-check": "astro check"` 与 CI 对齐；`declaration`/`isolatedDeclarations` 若不用于产物声明也应一并移除。

### P2-13（前端范围，仅提示）Footer 内联脚本把访客 IP 发给第三方 API

**位置**：`src/components/Footer.astro:97`（`https://api.vore.top/api/IPdata?ip=${ip}`）、`:132`（`https://api.ip.sb/geoip/${ip}`）

**证据**：两处 `fetch` 把访问者 IP 作为查询参数/路径发送给第三方，失败后互相 fallback（另有 `ipify` 相关逻辑在 `:214` 附近）。

**影响**：访客 IP 会暴露给两个不受控第三方；无隐私说明；第三方 API 不稳定时 Footer 有 2 秒超时等待。属前端/隐私范畴，**交由前端审阅人判断**，此处只做记录。

---

## 附：已验证为"没问题"的点（避免重复排查）

1. **依赖锁一致**：脚本逐项比对 `package.json`（55 个 deps）与 `pnpm-lock.yaml` importer 段：无缺失、无多余、specifier 全部一致；`lockfileVersion: '9.0'`，`--frozen-lockfile` 可用。
2. **无硬编码密钥**：`git grep -nE "sk-[A-Za-z0-9]{20,}|ghp_|gho_|AKIA|xox[bap]-|BEGIN .*PRIVATE KEY|api[_-]?key|secret|password|token"` 在全部跟踪文件中**零命中**（仅排除 lockfile）；`.env` 未被跟踪，`.gitignore:17` 已覆盖 `.env`、`:18` 覆盖 `.env.production`。
3. **构建产物未入库**：`git ls-files` 中无 `dist/`、`node_modules/`、`.astro/`；`git status` 干净。
4. **Git remote 合规**：`origin = https://github.com/ybttkx/newblog`，`main` 跟踪 `origin/main`，不是只改不推的状态。
5. **Pagefind 中文索引本身正常**：`dist/pagefind/pagefind-entry.json` → `{"version":"1.4.0","languages":{"zh-cn":{...,"page_count":6}}}`，语言识别为 `zh-cn`；`pagefind.yml` 会被 CLI 读取（临时目录实测）。
6. **站点 URL/SEO 基础正确**：`astro.config.mjs:29` `site` 与 `dist/sitemap-0.xml`/`dist/robots.txt` 一致，URL 无重复斜杠；`dist/index.html` 有正确 canonical。
7. **`svelte.config.js` 的 `vitePreprocess` 配置有效**，`astro.config.mjs:102` 的 `svelte()` 不传参不会丢预处理。

## 附：审阅方法与限制

- 未执行 `pnpm install` / `pnpm build` / `pnpm dev`；`dist/`、`node_modules/`、`.astro/` 仅只读查看。
- Biome 结论来自：(a) 当前 Windows 工作区直接运行 `biome check`（74 errors）；(b) `git archive HEAD` 导出快照 + 强制 LF 后运行 `biome ci`（模拟 Linux CI，9 errors）。CI 实际使用的 Biome 版本是 `latest`，与本地 2.2.5 可能有差异，故 P1-3 的"CI 必红"结论以 LF 快照为准。
- `tsc --noEmit --isolatedDeclarations` 为只读类型检查，输出即 P1-2 证据；`astro check` 未运行（属构建验证范畴，由 Lead 确认）。
- 本机无法访问外网（`vercel.com`、`pagefind.app`、`blog.ybovo.com` 均被沙箱 DNS 拦截），Vercel Astro 预设默认构建命令与生产站现状未能在线核实，相关结论已标注「需确认」。
