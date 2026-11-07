# 内容与数据层审阅

- 审阅对象：`task/1105-newblog`（Astro 5 + Fuwari + Svelte 5，线上站 `https://blog.ybovo.com/`）
- 审阅范围：`src/content/**`、`src/i18n/**`、`src/plugins/**`、`src/utils/**`，以及与之直接相关的 `src/config.ts`、`frontmatter.json`、`astro.config.mjs` 中插件/内容配置部分
- 方式：只读审阅。**未运行 `pnpm build/dev/install`**；渲染结论以仓库内已有 `dist/` 产物为证据（`dist/` 与最新提交同步，已包含 2026-11-05 新增的《标准件的诞生》）
- 限制：外部站点在本会话中无法访问（`ybovo.com`、`ipw.wsmdn.top` 等域名解析被拦截、HTTPS 探测失败），所有外链与平台行为一律标注「需人工复核」，不下结论
- 报告内路径均相对 `task/1105-newblog/`

## 一、总览

### 1.1 与任务背景的三处校正

1. **实际不是 6 篇文章，而是 5 篇**：`src/content/posts/` 下只有 5 个 `.md`（`git log --all --name-only -- src/content/posts` 全历史也只出现过这 5 个文件名）；加上 `src/content/spec/about.md` 才是 6 个 md 文件，任务里的「6 篇」很可能把 about 页算进去了。
2. **教育随笔是 2 篇，不是 3 篇**：《成绩之外，无人在乎》（文件名 `牢笼.md`）、《标准件的诞生》（文件名 `对中式教育的批判.md`）属教育随笔；《与next_js纠缠的一天》是 Next.js 部署踩坑的技术文。
3. **`.obsidian/` 确实被提交进了仓库**（见 P2-C13），且其中残留着 Fuwari 模板示例文章的文件名。

### 1.2 问题计数

| 级别 | 数量 | 说明 |
|---|---|---|
| P0 | 0 | 无阻断构建、无数据丢失、无线上不可用问题 |
| P1 | 10 | 线上可见的错字/渲染错误/资源 404/数据字段不一致/内容口径冲突 |
| P2 | 44 | 低影响配置问题、i18n 细节、术语与行文打磨、SEO 建议 |

### 1.3 整体判断

- **数据层骨架是健康的**：`src/content/config.ts` 的 schema 与 5 篇 frontmatter 全部匹配（构建产物已证明），日期统一 `YYYY-MM-DD`、无图片字段因此不存在图片路径失效问题；`dist/` 中 5 篇文章页、归档页、RSS、sitemap 均正常生成，中文 slug 的 URL 编码一致。
- **i18n 键是齐全的**：`i18nKey.ts` 定义 25 个键，`languages/` 下 10 个语言文件逐文件核对，**每个文件都是 25 个键、无缺项、无空值**，且 `Translation` 是 `{[K in I18nKey]: string}` 的映射类型，缺键会直接 TS 报错。问题只在「值的质量」：土耳其语 3 处拼写错误、日语 3 个值仍是英文、`translation.ts` 的语言归一化太脆。
- **风险集中在内容层**：两篇教育随笔在一周内写完，亲历素材大量重合，且「均为本人亲历」与「基于普遍现象分析」两种声明互相打架；新技术文里有中英混杂残留和一处 Markdown 转义错误，已在线上渲染出错（见 P1）。
- 建议修复顺序：P1-1～P1-6（文章字词）→ P1-7/P1-8（配置数据）→ P1-9/P1-10（两篇随笔合并与脱敏）→ P2。

## 二、代码层问题

### P0

无。

### P1

#### P1-1　小米手环文章出现英文残句 「快应用 environment」

- 位置：`src/content/posts/小米手环9_VelaOS_快应用开发避坑与优化实战总结.md:24`
- 证据：`小米手环 9 的底层快应用 environment 运行在 **JerryScript** 引擎上。`
- 影响：正式文章句子被英文单词截断，读者可见，语义为「快应用的 environment 运行在…」，属于明显的机器翻译/润色残留。
- 修复：改为「小米手环 9 的快应用运行在 **JerryScript** 引擎上」或「快应用的运行时环境是 JerryScript」。
- 性质：确定问题。

#### P1-2　小米手环文章反引号未转义，线上已渲染错乱

- 位置：`src/content/posts/小米手环9_VelaOS_快应用开发避坑与优化实战总结.md:63`
- 证据：源码为 `反引号（`）以及 `${}` 插值的支持存在缺陷`。实际构建产物 `dist/posts/小米手环9_velaos_快应用开发避坑与优化实战总结/index.html` 中渲染为：
  `反引号（<code>）以及 </code>${}` 插值的支持存在缺陷`
- 影响：行内代码从右括号处开始、在「以及」处诡异结束，后面留下裸的 `${}` 和一个孤立反引号。这是**已上线的正文渲染错误**，不是风格问题。
- 修复：用代码块包裹反引号，例如 ``反引号（\`）以及 \`${}\` ``，或写成 HTML 实体 `&#96;`。改完必须重新构建确认。
- 性质：确定问题。

#### P1-3　小米手环文章残留英文虚词 「of」

- 位置：同上 `:63`
- 证据：`导致页面关联 of JS 脚本完全不执行`
- 影响：同一句里第二个低级残留；与 P1-1 一起构成「文章经过机翻式润色」的观感，伤专业度。
- 修复：`导致页面关联的 JS 脚本完全不执行`。
- 性质：确定问题。

#### P1-4　小米手环文章重复字 「遇到到了」

- 位置：`src/content/posts/小米手环9_VelaOS_快应用开发避坑与优化实战总结.md:73`
- 证据：`但遇到到了严重的体积问题：`
- 影响：错别字，读者可见。
- 修复：`但遇到了严重的体积问题`。
- 性质：确定问题。

#### P1-5　Next.js 文章标题中英混杂 「from Pages 到…」

- 位置：`src/content/posts/与next_js纠缠的一天.md:2`
- 证据：`title: 折腾日记：Next.js 项目 from Pages 到 Workers 再到 EdgeOne 的"填坑"血泪史`
- 补充证据：`git diff b2f8cfe 7beca7b` 显示该句原文是正确的「从 Pages 到 Workers」，提交 `7beca7b chore: optimize next.js blog post wording` 把「从」改成了「from」——即「润色」引入的回归。
- 影响：标题会出现在首页卡片、`<title>`、RSS、分享卡片中，中英混排语法错误。
- 修复：改回「从 Pages 到 Workers 再到 EdgeOne」。
- 性质：确定问题。

#### P1-6　Next.js 文章残留英文虚词 「of」

- 位置：`src/content/posts/与next_js纠缠的一天.md:96`
- 证据：`*注：期间腾讯云 EdgeOne 默认 of CNAME 解析可能没有广播 AAAA 记录…*`
- 补充证据：同一提交 `7beca7b` 把原文「默认的 CNAME 解析」改成了「默认 of CNAME 解析」，`dist/posts/与next_js纠缠的一天/index.html` 已按此渲染。
- 影响：正文可见语法错误。
- 修复：`默认的 CNAME 解析`。
- 性质：确定问题。

#### P1-7　favicon 指向不存在的文件，线上 404

- 位置：`src/config.ts:34`（`src: "/favicon.ico"`，`siteConfig.favicon`）
- 证据：`dist/index.html` 输出 `<link rel="icon" href="/favicon.ico" sizes="any">`；但 `dist/favicon.ico` 不存在（`Test-Path dist/favicon.ico` = False），真正的 ico 在 `public/favicon_logosc/favicon.ico`（`dist/favicon_logosc/favicon.ico` 存在）；另外 `public/favicon/` 下 8 张 PNG 对应的正是 `src/constants/icon.ts` 里的 `defaultFavicons`，但被 `siteConfig.favicon` 覆盖后不再使用。
- 影响：所有页面的 favicon 请求 404，浏览器标签页图标缺失；同时亮/暗色两套 favicon 配置形同虚设。
- 修复（二选一）：把 `src` 改成 `/favicon_logosc/favicon.ico`；或删掉 `siteConfig.favicon` 的覆盖项，直接用 `defaultFavicons`。
- 性质：确定问题。

#### P1-8　frontmatter 工具字段 `language` 与 schema 字段 `lang` 不一致

- 位置：`frontmatter.json:60-61` 定义 `"title": "language", "name": "language"`；而 `src/content/config.ts:13` 的 schema 字段名是 `lang`。
- 证据：`frontmatter.json` 是 Front Matter（VSCode 插件）的字段模板，插件会按 `name` 写入 `language:`；Astro 的 Zod object 默认会静默剥离未知字段（不报错），因此 `entry.data.lang` 永远是空字符串。
- 影响：一旦用该插件写稿，文章语言标记会被无声丢弃；`[...slug].astro:43-45` 的 `inLanguage` 永远回落到站点语言，且不会报错、很难发现。
- 修复：把 `frontmatter.json` 的 `name` 改为 `lang`（title 可保留「language」），并顺手补上 `updated` 字段。
- 性质：确定问题（当前 5 篇未触发，属潜在数据缺陷）。

#### P1-9　两篇教育随笔事实大量重合，且「亲历 / 普遍现象」声明互相冲突

- 位置：
  - `src/content/posts/牢笼.md:13`：`> 文中所写均为本人亲历，学校、人物及部分细节已做模糊处理，请勿对号入座。`
  - `src/content/posts/对中式教育的批判.md:12`：`> 以下内容基于基层校园普遍现象分析，涉及情境切勿对号入座。`
- 重合的事实清单（同一批细节写了两遍，但一篇文章说「亲历」、另一篇说「普遍现象」）：
  - 前三十名被抽走单独成班：`牢笼.md:25` vs `对中式教育的批判.md:34-35`
  - 老师原话「那个班的人没比你们聪明…但人家就是比你们能熬」：`牢笼.md:31` vs `对中式教育的批判.md:37`
  - 调查问卷 A-D 没有「其他」输入框：`牢笼.md:47` vs `对中式教育的批判.md:16`
  - 检查前把违规卷子塞书包/扔垃圾桶：`牢笼.md:47` vs `对中式教育的批判.md:16`
  - 早七点进校、晚九点半放学：`牢笼.md:57` vs `对中式教育的批判.md:89`
  - 请病假要三甲医院带章证明：`牢笼.md:61` vs `对中式教育的批判.md:106`
- 影响：①同一批素材两种口径，读者对照阅读会发现声明不统一，削弱可信度；②一篇博客一周内两篇同题长文，重复度高，内容价值被摊薄；③后记（`对中式教育的批判.md:126`）说「上一篇写的是我自己怎么过日子，这一篇想弄明白这样的日子是怎么来的」，说明作者本意是分工，但实际两篇都写了大量同一批亲历细节。
- 修复建议：统一口径——若确为亲历，两篇都写「亲历＋模糊处理」；并把 `对中式教育的批判.md` 中与 `牢笼.md` 重合的亲历段落删掉，改为引用「前一篇已写过」+ 只做制度/政策层面的分析（这篇的定位本来就是「这样的日子是怎么来的」）。或者直接合并为一篇长文。
- 性质：确定问题。

#### P1-10　两篇随笔的可识别信息偏多，存在隐私与追责风险

- 位置：`牢笼.md:17`（摇号、兜底校）、`:25`（年级前三十名单独成班）、`:41-43`（无食堂、无空调、厕所无门）、`:57`（南方多雨、九点半放学）、`:61`（三甲医院公章）；`对中式教育的批判.md:34-35`（前三十名、整栋楼最大教室、骨干老师）、`:49`（晚自习九点半）
- 证据：文章一方面声明「学校、人物及部分细节已做模糊处理」，另一方面给出的细节组合（南方城市＋摇号＋年级前三十名单独成班＋无食堂无空调＋厕所无门＋九点半放学）在国内同一城市范围内足以被同校读者、老师或校方定位。
- 影响：这些段落对具体机构有「违规复印试卷」「应付检查」等明确指控，即使事实属实，公开传播也有隐私暴露和被追责的合规风险；作者是在校学生，风险不对等。
- 修复建议：去掉「南方」「摇号失败者」等地理/身份定位信息，统一称「某市一所普通初中」；把「可核实的制度质疑」与「个人经历」分开表述；在文首明确「为保护当事人，部分细节系文学化处理」。
- 性质：个人建议（风险提示，建议本轮处理）。

### P2

> 说明：P2 只列有实际修改价值的点；「确定问题」与「个人建议」分别标注。

#### P2-C1　i18n 值质量：土耳其语拼写错误、日语 3 个值未翻译

- 位置与证据：
  - `src/i18n/languages/tr.ts:10` `"Taglar"`、`:11` `"Katagoriler"`、`:17` `"Katagorisiz"`——土耳其语中 tag = `etiket`、kategori = `kategori`，`Taglar/Katagoriler` 是英文词干＋土语后缀的错拼；`:36` `"Yayınlanma:"` 末尾多一个冒号，与其他语言不一致。
  - `src/i18n/languages/ja.ts:5-7` 的 `home/about/archive` 仍为 `"Home"/"About"/"Archive"`，而同文件其余值均已日译。
- 影响：站点当前 `lang: "zh-CN"`，这些值不会展示，属潜在质量问题；一旦切换语言或增加多语言，会直接露出错译。
- 修复：`Taglar→Etiketler`、`Katagoriler→Kategoriler`、`Katagorisiz→Kategorisiz`、`Yayınlanma:→Yayınlanma`；日语改为 `ホーム/概要/アーカイブ`。
- 性质：确定问题（低影响）。

#### P2-C2　i18n 语言归一化过脆，未知语言静默回退

- 位置：`src/i18n/translation.ts:60`
- 证据：`siteConfig.lang.replace("-", "_")` 只替换第一个连字符。`zh-CN` 可用，但 `zh-Hans-CN` 会变成 `zh_hans-cn`（map 中不存在）→ 回退 `en`；且 `getTranslation` 的回退没有任何告警（`:54-56`）。
- 影响：一旦把 `siteConfig.lang` 写成更完整的 BCP-47 标签，整站 UI 会静默变成英文，排查成本高。
- 修复：`replace(/-/g, "_")`，并在回退时 `console.warn`。
- 性质：个人建议。

#### P2-C3　存在未使用的 i18n 键，评论区块没有标题

- 位置：`src/i18n/i18nKey.ts:13`（`untitled`）、`:11`（`comments`）、`:9`（`recentPosts`）
- 证据：全仓 grep 显示 `untitled` 没有任何组件引用；`comments` 只在语言文件里出现，`src/components/misc/Comment.astro` 直接渲染 giscus iframe，没有用 `i18n(comments)` 做标题；`recentPosts` 也未被组件引用。
- 影响：键齐全但存在死键；评论区块缺少「评论」标题，与其它卡片标题风格不一致。
- 修复：删除死键，或在 Comment.astro 顶部补 `<h2>`；若保留，写明用途。
- 性质：个人建议（低影响）。

#### P2-C4　about 页的 GitHub 卡片依赖客户端请求 api.github.com，国内网络可能一直停在占位文案

- 位置：`src/plugins/rehype-component-github-card.mjs:50-51`、`:57-77`（生成的 inline script 中 `fetch('https://api.github.com/repos/${repo}')`）
- 证据：卡片初始文案是 `Waiting for api.github.com...`（`:50`），数据完全靠浏览器端 fetch；`catch` 分支只加一个 `fetch-error` class（`:72-76`），没有中文兜底文案。about 页结尾正是 `::github{repo="ybttkx/newblog"}`（`src/content/spec/about.md:36`）。
- 影响：国内网络访问 GitHub API 不稳定/被限流（未认证 60 次/小时/IP）时，关于页会长期显示英文「Waiting for api.github.com...」或直接进入错误态；这出现在一个中文站点上，观感与可用性都受影响。
- 修复：改为构建期拉取 star/描述并静态渲染（构建失败则回退静态文案），或至少给错误态补中文兜底「仓库信息加载失败，点击前往 GitHub」。
- 性质：确定问题（低影响，取决于网络环境）。

#### P2-C5　content-utils 排序比较器永不返回 0，且直接改写入参

- 位置：`src/utils/content-utils.ts:12-16`、`:24-29`
- 证据：`return dateA > dateB ? -1 : 1;` 没有相等分支；`:24-29` 直接给 `data.nextSlug/prevSlug` 赋值（修改 collection 数据）。
- 影响：同日发布的两篇文章顺序依赖输入顺序、不稳定；改写入参在并行渲染时有隐患（当前单进程构建无实际故障）。
- 修复：比较器补 `dateA.getTime() - dateB.getTime()`，next/prev 改为在调用方组装或返回副本。
- 性质：个人建议。

#### P2-C6　date-utils 用 `toISOString()` 有潜在时区偏移

- 位置：`src/utils/date-utils.ts:2`
- 证据：`date.toISOString().substring(0, 10)`。当前 frontmatter 全是纯 `YYYY-MM-DD`（YAML 解析为 UTC 0 点），`dist/` 中显示正确（如 2026-11-05）；但若作者写成 `2026-11-05 08:00 +0800`，UTC 转换后可能显示成前一天。
- 影响：潜在日期显示错误。
- 修复：用 `Intl.DateTimeFormat` 按 `siteConfig.lang`/`Asia/Shanghai` 格式化，或限定 frontmatter 只写日期。
- 性质：个人建议。

#### P2-C7　url-utils 用「翻译后的文案」比较分类

- 位置：`src/utils/url-utils.ts:24-32`
- 证据：`category.trim().toLowerCase() === i18n(I18nKey.uncategorized).toLowerCase()`。分类名是用户填写的中文，用 UI 文案反查「未分类」属于隐式耦合；若将来有人的分类真的叫「未分类」，会被误判成未分类链接。
- 修复：传 `null/""` 判断，或在 content-utils 里区分「真实分类」与「占位分类」。
- 性质：个人建议。

#### P2-C8　GitHub 卡片插件的两处小问题

- 位置：`src/plugins/rehype-component-github-card.mjs:22`、`:63`
- 证据：`:22` 提示文案 `"repo" attributte must be…` 拼写错误（attribute）；`:63` `innerText = data.language` 在仓库无主语言时会显示字面量 `null`。
- 影响：前者只在非法 directive 时显示且外层有 `hidden` 类；后者会在 GitHub API 返回 `language: null` 的仓库卡片上露 `null`。当前 about 页的 `ybttkx/newblog` 有语言，暂未触发。
- 修复：`attributte→attribute`；`data.language || "—"`。
- 性质：确定问题（低影响）。

#### P2-C9　代码复制按钮的英文 aria-label 与剪贴板失败无兜底

- 位置：`src/plugins/expressive-code/custom-copy-button.ts:27`、`src/components/misc/Markdown.astro:26`
- 证据：按钮硬编码 `"aria-label": "Copy code"`（站点其余文案均中文）；`navigator.clipboard.writeText(code)` 没有 `.catch`、也没有非安全上下文（http）的降级方案。
- 影响：屏幕阅读器在中文站读到英文；本地 http 预览或权限被拒时点击无反馈、控制台报错。
- 修复：aria-label 接入 i18n；`writeText(...).catch(() => 回退 execCommand 或提示失败)`；复制成功再切 success 态。
- 性质：确定问题（低影响）。

#### P2-C10　astro.config 中 icon include 存在可疑键，插件导入扩展名不统一

- 位置：`astro.config.mjs:52`、`:25`
- 证据：`icon({ include: { "preprocess: vitePreprocess(),": ["*"], … } })`——`"preprocess: vitePreprocess(),"` 明显是从 `svelte.config.js` 误粘贴进来的字符串，不是合法 iconify 集合名；`:25` 导入 `.../custom-copy-button.js`，实际文件是 `custom-copy-button.ts`（构建能过是因为 Vite 会回退解析 `.js→.ts`，但全仓其他插件都用 `.ts` 显式导入）。
- 影响：icon 集合配置里混入垃圾键（当前无害但会误导后来人）；导入风格不一致。
- 修复：删掉该键；导入改为 `.ts` 或统一省略扩展名。
- 性质：确定问题（配置层，构建审阅员可一起复核）。

#### P2-C11　文章页对同一条目调用了两次 `entry.render()`

- 位置：`src/pages/posts/[...slug].astro:27`、`:29`
- 证据：`:27` `const { Content, headings } = await entry.render();`，`:29` 又 `const { remarkPluginFrontmatter } = await entry.render();`
- 影响：可读性差、逻辑冗余（Astro 内部有缓存，暂未造成明显性能问题）。
- 修复：一次解构 `const { Content, headings, remarkPluginFrontmatter } = await entry.render();`。
- 性质：个人建议。

#### P2-C12　PostMeta 的 aria-label 是英文模板（中文站）

- 位置：`src/components/PostMeta.astro:56`、`:73`
- 证据：`aria-label={`View all posts in the ${category} category`}`、`aria-label={`View all posts with the ${tag.trim()} tag`}`；且 `category` 为空时会拼出 "in the null category"（`:56` 的 category 为 `""` 时是空串，不至于 null）。
- 影响：中文站无障碍标签是英文；分类为空时语句不通。
- 修复：改用中文模板并处理空值。
- 性质：个人建议。

#### P2-C13　`.obsidian/` 被提交，且 workspace.json 残留 Fuwari 模板文件名

- 位置：`src/content/posts/.obsidian/`（4 个文件均被跟踪，`git ls-files src/content` 可见）
- 证据：`workspace.json:16/98/117/160` 的当前文件、`:56` 的搜索词 `tag:Example`、`:188-192` 的 `lastOpenFiles: ["2023-08-01.md","video.md","第一篇.md","markdown.md"]`——`video.md`、`markdown.md`、`2023-08-01.md` 都是 Fuwari 模板示例文章（现已删除），说明这是作者在模板目录上打开的 Obsidian 工作区残留。`.gitignore` 里没有 `.obsidian`。
- 影响：仓库噪音；每次本地开 Obsidian 都会改 `workspace.json`，容易产生无意义 diff；也没有泄露绝对路径（Obsidian 用库内相对路径），否则就是 P1。
- 修复：`.gitignore` 加 `.obsidian/`，`git rm -r --cached src/content/posts/.obsidian`。若想保留配置，只跟踪 `app.json`、`appearance.json` 等无状态文件。
- 性质：确定问题（低影响，属仓库卫生）。

#### P2-C14　模板示例残留（正文里已经没有，但周边还有 3 处）

- 证据：
  - `src/components/Search.svelte:16-30`：`fakeResult` 两条英文假数据（"This Is a Fake Search Result"…），仅 dev 环境使用，`dist/` 中不出现，但仓库里就是英文占位。
  - `src/config.ts:20`：`src: "assets/images/demo-banner.png"`，且 `:19` `enable: false`；`src/assets/images/` 下 `demo-banner.png`（898 KB）、`demo-avatar.png`（416 KB）共约 1.3 MB 未被使用。
  - `src/content/posts/` 正文中已无 Fuwari 示例文章（这一点是达标的）。
- 影响：仓库体积与「模板味」；不会进入构建产物（banner 关闭、图片未 import）。
- 修复：删除未用的 demo 图片；Search.svelte 的假结果可保留（上游行为），或改成中文提示；配置文件里若刻意保留关闭的 banner，可加注释。
- 性质：个人建议。

## 三、文章逐篇问题

> 统一说明：5 篇文章的 frontmatter 全部通过 `src/content/config.ts` 校验（`title`、`published`、`description`、`tags`、`category`、`draft` 均符合；`updated`/`image`/`lang` 为可选项，5 篇都未使用，属合法）。日期全部为 `YYYY-MM-DD`，YAML 解析为 UTC 日期，`dist/` 显示与 frontmatter 一致。以下只列除 P1 共性项外的问题。

### 1. `第一篇博客.md`（《第一篇博客》，2026-01-16）

- **P2-A1　frontmatter 后多出一条 `---`，页首出现一条孤立分隔线（确定问题）**
  - 位置：`:10`
  - 证据：`dist/posts/第一篇博客/index.html` 的文章内容区第一个元素就是 `<hr>`，之后才是 `<h2 id="写在前面">`。
  - 影响：文章开头出现一条无意义的分隔线，观感像是「空了一行再开始」。
  - 修复：删掉第 10 行的 `---`（正文内的其他 `---` 是分段线，可保留）。
- **P2-A2　description 与 title 完全相同，卡片/搜索摘要没有信息量（确定问题）**
  - 位置：`:3`
  - 证据：`title: 第一篇博客` / `description: 第一篇博客`；`dist/index.html` 的卡片摘要即「第一篇博客」。
  - 影响：首页卡片、RSS、搜索结果都拿不到有效摘要；SEO 上等于浪费一次描述机会。
  - 修复：换成一句具体的话，如「记录为什么开这个博客、打算写什么，以及我对更新频率的约定」。
- **P2-A3　缺 `category`，全站显示为「未分类」（确定问题·低影响）**
  - 位置：frontmatter `:5-7` 只有 `tags: [开发]`
  - 证据：`dist/index.html` 该卡片分类显示「未分类」（由 `PostMeta.astro:59` 的 i18n 回退产生）。
  - 修复：补 `category: 随笔` 或 `开发`。
- **P2-A4　列表行尾的双空格（建议）**：`:24`、`:26`、`:36`、`:38` 的 `  `（Markdown 硬换行）会让列表项内产生无意义 `<br>`，与后几篇风格不一致，建议删除或统一使用。

### 2. `与next_js纠缠的一天.md`（《折腾日记：Next.js 项目 from Pages 到 Workers 再到 EdgeOne 的"填坑"血泪史》，2026-07-04）

- 已列 P1：`:2` 标题 `from Pages 到…`；`:96` `默认 of CNAME`。
- **P2-A5　「国外线路（EdgeOne）」与「全球线路（Cloudflare）」的逻辑自相矛盾（确定问题）**
  - 位置：`:83-85`
  - 证据：`- **主线路（Vercel）**：ybovo.com` / `- **全球线路（Cloudflare）**：cf.ybovo.com` / `- **国外线路（EdgeOne）**：eo.ybovo.com`。EdgeOne 是腾讯云产品，被标成「国外线路」而同页又把 Cloudflare 叫「全球线路」，两条线的定位互相打架；下文 `:87` 又说「Vercel 的原生网络不支持 IPv6，而 CF 和 EdgeOne 都完美支持」，读者会以为 EdgeOne 也是海外节点。
  - 修复：按实际用途改成「国内线路（EdgeOne）」或「EdgeOne 线路」，并统一三条线的命名维度（主/备 or 国内/海外）。
- **P2-A6　一批技术细节需要人工复核（需人工复核）**
  - `:29` `__next-on-pages-dist__/` 目录名
  - `:51` 参数 `--dangerouslyUseUnsupportedNextVersion`
  - `:52` 「`open-next.config.ts` 里必须声明 `incrementalCache` 等 dummy 块」
  - `:53` 选项 `dangerousDisableConfigValidation: true`
  - `:92` EdgeOne 请求头 `eo-connecting-ip` / `eo-log-uuid`
  - `:96` EdgeOne 控制台的「IPv6 访问」开关
  - `:19` `https://ybovo.com`、`:93` `https://ipw.wsmdn.top/` 两个外链的可达性
  - 说明：本会话无法联网验证，只能标「需人工复核」。其中至少 `--dangerouslyUseUnsupportedNextVersion` 这个参数名和 `dangerousDisableConfigValidation` 的写法建议对照 `@opennextjs/cloudflare` 当前文档确认；若参数名写错，读者照抄会直接失败。
- **P2-A7　主观绝对化与夸张用词（个人建议）**：`:16` 「万万没想到」、`:33` 「史上最强手抖」、`:46` 「目前最先进的…适配器」、`:67` 「全局开启静态直连」、`:118` 「虽然过程满是痛苦的 Error Log」。「最先进」「史上最强」属绝对化表述，建议改为「主流」「印象最深的一次」；「静态直连」是自造词，实际就是 `images.unoptimized: true`。
- **P2-A8　段落与链接之间缺空行（确定问题·排版）**：`:18-19` 正文段落与 `[欢迎访问我的网站](https://ybovo.com)` 之间没有空行，Markdown 会把链接并入同一段，渲染成句尾突然出现的链接；建议空一行或删掉这条硬广式链接。
- **P2-A9　`open-next` / `OpenNext` 大小写不一致（个人建议）**：`:4` description 写 `open-next 校验冲突`，正文 `:46` 用 `OpenNext`，`:44` 标题写 `next-on-pages`。建议统一为官方名 `OpenNext` / `@opennextjs/cloudflare`。
- **P2-A10　文件名与标题不一致导致 URL 语义错位（确定问题·SEO）**：文件名 `与next_js纠缠的一天.md` → 线上 URL `/posts/与next_js纠缠的一天/`，而页面 H1 是「折腾日记：Next.js 项目…」。URL 里同时出现旧标题和下划线，不影响访问但难看、也不利于搜索。若不在意旧链接，可改名并做 301（静态站可用 `public/_redirects`/平台规则）。

### 3. `小米手环9_VelaOS_快应用开发避坑与优化实战总结.md`（2026-07-02）

- 已列 P1：`:24` 「environment」；`:63` 反引号渲染错乱 + 「of」；`:73` 「遇到到了」。
- **P2-A11　「都是 HTML/CSS/JS」表述不准确（个人建议/需人工复核）**
  - 位置：`:16`
  - 证据：`手环开发看似与传统的移动端前端开发类似（都是 HTML/CSS/JS）`。快应用使用的是 `ux` 标签（类 XML，如文中的 `<list>`、`<scroll>`）而非 HTML 标签，`@swipe` 等也是快应用自己的指令语法。
  - 修复：改为「都是类前端的三件套：标记语言 + CSS 子集 + JS」，避免误导读者。
- **P2-A12　术语偏差：`堆栈` 应为 `堆内存`（个人建议）**
  - 位置：`:75`
  - 证据：`会直接撑满 JerryScript 堆栈引起 OOM 崩溃`；同文 `:25` 用的却是正确的「堆内存」。OOM 是堆内存耗尽，不是调用栈。
  - 修复：`撑满 JerryScript 堆内存`。
- **P2-A13　中英混杂与夸张描述（个人建议）**
  - `:101` `为了给用户提供 premium（高级）的交互质感`——`premium` 与括号里的「高级」重复；`:126` 「这种视觉震撼感是传统极简计算器完全无法比拟的」、`:14` 「有趣的挑战」属营销腔。建议删英文词、收敛形容词。
- **P2-A14　「顶部防碰 / 底部弹跳」用词不当，且两处冒号是半角（确定问题）**
  - 位置：`:104`、`:105`
  - 证据：`* **顶部防碰**: …`、`* **底部弹跳**: …`。`弹跳` 与正文说的「键盘弹起时给底部留白」不是一回事，应为「底部避让/键盘避让」；`防碰` 建议写「顶部避让」。两处 `**:` 是全角正文里的半角冒号，与其他条目 `**…**：` 不一致。
- **P2-A15　「接近官方最舒适的 55px 限制」语义矛盾（确定问题）**
  - 位置：`:111`
  - 证据：`**输入框与按钮的高度统一设为 52px**（接近官方最舒适的 55px 限制）`。「最舒适的 55px」后面接「限制」，到底是推荐值还是上限？且 52 距 55 还差 3px，说「接近限制」不成立。
  - 修复：改成「官方建议的最小点击高度为 55px 左右，这里取 52px」之类，并给出出处或删掉括号。
- **P2-A16　description 把软件限制写成硬件限制，且 300KB 建议无出处（需人工复核）**
  - 位置：`:4` 与 `:26-27`
  - 证据：description 说「硬件极度受限（JerryScript 引擎）」——JerryScript 是 JS 引擎（软件），不是硬件；`:26` 说「虽然官方上限更大，但 RPK 包编译压缩后的大小建议严格控制在 300KB 以下」，未给出官方上限数值与来源。
  - 修复：改成「硬件资源极度受限（内存以百 KB 计）」，并补 RPK 体积上限的官方文档链接，或写明「经验值」。
- **P2-A17　URL slug 被小写化，与正文「VelaOS」不一致（确定问题·低影响）**
  - 证据：`dist/` 中该文章目录为 `小米手环9_velaos_…`，正文与 frontmatter 写的是 `VelaOS`。中文 + 下划线 + 小写的 URL 既长又不稳定，建议后续改为短英文 slug 并重定向。

### 4. `牢笼.md`（《成绩之外，无人在乎》，2026-11-04）

- 已列 P1：`:13` 亲历声明与另一篇冲突；可识别信息风险。
- **P2-A18　description 句子成分残缺（确定问题）**
  - 位置：`:4`
  - 证据：`在如今"双减"与"阳光分班"严禁公开考试掐尖的政策下，一所专门承接所有摇号失败者的普通初中，记录高压体制下的荒诞、规训与反思。`——前半句是状语，后半句的主语是「普通初中」，谓语却成了「记录」，读起来像是「这所初中在记录」，而不是「文章记录这所初中」。
  - 修复：`…记录一所专门承接摇号失败者的普通初中在高压体制下的荒诞、规训与反思。`
- **P2-A19　政策表述混用「双减」与「阳光分班/摇号」（需人工复核）**
  - 位置：`:17`
  - 证据：`在如今"双减"与"阳光分班"严禁公开考试掐尖的政策下，小升初全凭摇号。`「双减」针对的是作业负担与校外培训，「严禁掐尖、免试就近入学、公民同招/摇号」属于义务教育招生政策，「阳光分班」针对的是分班，三者不是同一政策。建议拆开表述，否则懂政策的读者会一眼看出不严谨。
- **P2-A20　「致命剂量的味精」修辞失当（个人建议）**
  - 位置：`:41`
  - 证据：`一锅排骨海带汤捞出干货，倒进致命剂量的味精`。「致命剂量」如果按字面理解，学生已经中毒；这里想表达的是「味精下得极重」。夸张到失真会削弱整篇文章的可信度。
  - 修复：`倒进大得离谱的味精`。
- **P2-A21　同一段里「印刷问卷」与「系统」「输入框」混用（确定问题·低影响）**
  - 位置：`:47`
  - 证据：`心理调查问卷上…选项赫然列着：A. 6小时…D. 其他。至于D选项，系统根本不给手动填写的输入框。`前文说「问卷上」（纸质），后文说「系统」「输入框」（线上），媒介不一致；`对中式教育的批判.md:16` 同样问题（「上面印着一道题」→「系统根本没有留出打字的地方」）。
  - 修复：统一成纸质或线上问卷之一。
- **P2-A22　文件名与标题不一致（确定问题·SEO）**
  - 证据：文件名 `牢笼.md` → URL `/posts/牢笼/`，H1 是「成绩之外，无人在乎」。`git log` 显示标题从《铁笼、泔水与三甲公章…》改到《成绩之外，无人在乎》，但文件名没跟着改。建议统一，避免 URL 语义与标题长期分叉。
- **P2-A23　后记的文言腔与正文文风割裂（个人建议）**：`:79` 整段文言（「本人博客长期未曾更新…故撰此篇」）与正文现代口语风格差异很大；作为个人风格可以保留，但建议至少让正文末段与后记的语气有过渡，否则像是在文章后贴了一张便签。

### 5. `对中式教育的批判.md`（《标准件的诞生：当学校开始按照分数称量学生》，2026-11-05）

- 已列 P1：`:12` 声明口径与《牢笼》冲突；可识别信息风险。
- **P2-A24　文件名仍是旧标题《对中式教育的批判》（确定问题·SEO）**
  - 位置：`:2` 标题；文件名
  - 证据：URL 为 `/posts/对中式教育的批判/`（`dist/sitemap-0.xml`、`dist/rss.xml` 均可验证），而页面标题是《标准件的诞生》。旧文件名带「批判」二字，情绪化且与正文标题不符；同时这篇是全文分析，正文里「标准件」这一核心比喻只在 `:106` 出现一次，标题与正文的呼应也可以再加强。建议改名 + 重定向。
- **P2-A25　「倒 U 形」结论无出处，政策引用缺了「一般」（需人工复核）**
  - 位置：`:88`
  - 证据：`教育部早就三令五申：初中生每天睡眠要达到 9 小时，早上开课不得早于 8:00，晚上就寝不得晚于 22:00。国内多项针对几十万中小学生的大规模调查也早就证实了：学习时间和学业表现之间是一条倒转的 U 形线。`
  - 问题：①教育部的原文是「初中生一般不早于 8:00 上课」「就寝时间一般不晚于 22:00」，是指导性表述，文章写成「不得」，语气从建议变成禁令，属于事实精度问题；②「多项针对几十万中小学生的大规模调查」没有给任何一项的名称/来源，「倒转的 U 形线」也建议改成通行的「倒 U 形」，并补一条可查的文献或调查链接（如中国教育追踪调查 CEPS 相关研究）。这一段是全文唯一的实证论据，越具体越可信。
  - 修复：引用具体调查名称 + 链接，或弱化为「已有研究提示…」。
- **P2-A26　「九点半早就过了那个点」指代不清（个人建议）**
  - 位置：`:89`
  - 证据：`那种靠牺牲睡眠换来的伪勤奋，过了那个拐点就只会越熬越差，而晚上九点半早就过了那个点。`读者需要自己推断「那个点」是倒 U 形的峰值时点，但九点半是「放学时间」而不是「学习时长」；逻辑链条缺了一环（放学后还要写卷子到半夜，见《牢笼》）。
  - 修复：改成「以晚上九点半才放学、回家还要写卷子的强度，早已越过收益递减的拐点」。
- **P2-A27　结尾「今天一口气发了两篇」与两篇发布日期矛盾（确定问题·低影响）**
  - 位置：`:126`
  - 证据：`今天一口气发了两篇，是因为这些事在心里压得太久…`；但《牢笼》`published: 2026-11-04`（`牢笼.md:3`），本篇 `published: 2026-11-05`（`:3`），页面上两篇相隔一天。若作者本意是「同一天写完两篇」，建议把《牢笼》的 `published` 也改成 11-05（它正文写「写于 2026 年 11 月 4 日」，也可以保留正文日期、只统一发布日）；否则读者会发现时间线对不上。
  - 备注：`LOG.md` 记录两篇都是 2026-11-05 录入，说明这是「写于 4 日、发布 5 日」的刻意安排，但正文的「今天」让这种安排露馅。
- **P2-A28　正文与《牢笼》的重复段落（已在 P1-9 计，不重复计数）**：若按 P1-9 建议做分工，本文可删除 `:16`、`:33-37`、`:106` 中的亲历细节，只保留制度分析与「上一篇写过」的引用。

### 6. `src/content/spec/about.md`（关于页）

- **P2-A29　「一名学生」与站点 bio 的「一个学生」措辞不一致（确定问题·低影响）**
  - 位置：`about.md:4` 与 `src/config.ts:56`
  - 证据：about 页 `一名喜欢折腾技术与性能优化的学生。`；`profileConfig.bio` `一个喜欢折腾技术与性能优化的学生。`两处同义文案，读者在侧栏和关于页会看到两个版本。
  - 修复：统一为一种说法（推荐「一个」或「一名」二选一）。
- **P2-A30　关于页的能力描述没覆盖穿戴/嵌入式方向（个人建议）**
  - 位置：`about.md:15-17`
  - 证据：about 页只说「学习 Web 开发相关技术」「研究前端性能、加载速度与体验优化」，但 5 篇文章里有 1 篇是小米手环 Vela OS 快应用开发（`小米手环9_VelaOS_…md`）。关于页与真实内容有偏差，建议补一条「折腾智能穿戴/嵌入式小应用」。
- **P2-A31　关于页 emoji 标题（个人建议）**：`:13` 🛠、`:21` 📌、`:32` 🔗 三个标题全部带装饰性 emoji，与站点其他页面的克制风格不完全一致；属于个人审美，可保留。

## 四、收尾建议

1. **本轮必修（P1）**：先改 5 处文章字词（小米 3 处、Next.js 2 处）→ 修 favicon 路径 → 修 `frontmatter.json` 的 `language/lang` → 处理两篇教育随笔的重复与脱敏。这些改动量小、不涉及架构，建议一次提交、重新构建后逐页点检。
2. **数据层的健康度可以放心**：schema、日期、中文 slug、RSS/sitemap 都没有结构性问题；后续新增文章只要照现有 frontmatter 模板写，不会踩坑。建议在 `src/content/posts/` 下放一个 `_template.md`（或 README）把 frontmatter 字段和「description 必填且不要等于标题」写清楚，防止 `第一篇博客` 的问题复现。
3. **i18n 建议做一次收口**：虽然键齐全，但「值」没有校验。若确定只做中文站，可以把 10 个语言文件精简为 en/zh_CN 两个，减少维护面；若保留多语言，至少修掉 tr 的拼写和 ja 的英文值，并在 CI 加一条「所有语言文件键数 = i18nKey 数量」的脚本（当前类型系统已能保证，但运行时无法保证值与语言匹配）。
4. **模板残留清理**：`.obsidian/` 从 Git 移除并加 ignore；删掉 `src/assets/images/demo-*.png`。这是仓库卫生问题，不影响线上，但会让项目看起来仍像模板。
5. **外部链接与平台参数统一复核**：《与next_js纠缠的一天》里的 Cloudflare/EdgeOne 参数名、请求头名、`ipw.wsmdn.top` 与 `ybovo.com` 可达性，本会话无法联网验证，建议由能访问外网的人逐条核对后再对外推广这篇文章。
6. **风险提示**：两篇教育随笔建议在合并/脱敏后重新发布一次（同一 URL 更新内容即可），并在文首统一声明「亲历/文学化处理」的边界；这是内容层唯一涉及合规风险的点，优先级高于所有 P2。
