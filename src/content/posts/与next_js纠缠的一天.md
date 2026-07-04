---
title: 折腾日记：Next.js 项目 from Pages 到 Workers 再到 EdgeOne 的“填坑”血泪史
published: 2026-07-04
description: 记录折腾 Next.js 项目从 Pages 部署到 Cloudflare Workers 再到 EdgeOne 的全过程，总结了 open-next 校验冲突、Edge 运行时、图片优化以及 npm 依赖冲突的避坑实战经验。
tags:
  - Nextjs
  - Cloudflare
  - EdgeOne
  - 边缘计算
category: 开发
draft: false
---

作为一个热爱折腾的个人开发者，我一直有个梦想：把我的 Next.js 个人主页（`HomePage`）扔到边缘计算（Edge）和 Serverless 环境里运行，享受秒开的快感和零成本的快乐。

然而，我万万没想到，这个看似简单的部署决定，让我开启了一整天过山车式的“血泪遭遇”。

以下就是我这一路走来踩过的坑，以及最终的完美通关指南。
[欢迎访问我的网站](https://ybovo.com)

---

## 遭遇一：`next-on-pages` 与“幽灵模块” 404

故事的起因是，我想用 `next-on-pages` 将网站部署到 Cloudflare Pages 上。
本地构建一切顺利，但一推到线上运行就直接崩溃，报出 `Error: No such module`。

**原因分析**：
`next-on-pages` 会把 Next.js 的动态路由切片存放在 `__next-on-pages-dist__/` 目录。然而，在 Workers 沙箱环境里，如果配置不当，主程序在运行时无法动态 import 这些切片，导致页面直接报致命错误。

---

## 遭遇二：史上最强手抖——“我想删 Pages，却把 Worker 删了”

既然 Pages 折腾不顺，我决定改用传统的 Worker。
在命令行登录 Wrangler 并配置好一切后，由于控制台项目太多，我想去 Cloudflare 后台清理一下旧的 Pages 垃圾项目。

结果……**手一抖，直接把刚刚部署成功的核心 Worker 项目给删了！** 

当时脑子一片空白，只能大喊救命。好在 Wrangler 足够智能，重新在本地跑一遍部署流程，系统会自动在云端重建一个同名的 Worker 容器，虚惊一场。

---

## 遭遇三：转战 OpenNext 与配置校验大混战

在痛定思痛后，我决定放弃限制多多的 `next-on-pages`，转用目前最先进的 Next.js 边缘计算适配器 **OpenNext** (`@opennextjs/cloudflare`)。

然而，OpenNext 的严格校验（Validator）又给了我当头一棒：

1. **老旧版本警告**：由于 Next.js 14 的支持周期问题，构建直接被硬生生卡死。
   - *解法*：强行挂载 `--dangerouslyUseUnsupportedNextVersion` 构建参数。
2. **严格的 Schema 校验**：要求在 `open-next.config.ts` 里必须声明 `incrementalCache` 等 dummy 块，否则直接报错。
   - *解法*：开启 `dangerousDisableConfigValidation: true` 绕过校验，并将中间件设为非 external 模式直接打包进 `worker.js`。
3. **Edge 运行时冲突**：Next.js 路由里的 `export const runtime = 'edge'` 导致 OpenNext 编译失败。
   - *解法*：删掉页面里的 edge 标识。因为在 OpenNext 架构下，Next.js 会原生地运行在 Cloudflare Workers 新版 `nodejs_compat` 环境中，无需额外声明。

---

## 遭遇四：神秘消失的头像与破图之谜

当我终于看到网站响应 `Status: 200` 时，还没来得及高兴，却发现**我主页的头像和项目截图全部破图了**！

**原因分析**：
Next.js 默认的 `<Image>` 组件为了提供图片压缩，会把图片链接指向动态优化路由 `/_next/image?url=...`。而在边缘服务器（如 Workers）上，如果没有特别配置图片缩放包（如 sharp），这个动态优化接口会直接返回 404！

**解法**：
在 `next.config.js` 里全局开启静态直连：

```javascript
images: {
  unoptimized: true
}
```

头像和卡片缩略图终于完美复活！

---

## 遭遇五：多线路（Vercel、Cloudflare、EdgeOne）与 IPv6 智能检测

为了提高可用性，我同时把网站部署到了三个平台：

- **主线路（Vercel）**：`ybovo.com`
- **全球线路（Cloudflare）**：`cf.ybovo.com`
- **国外线路（EdgeOne）**：`eo.ybovo.com`

因为 Vercel 的原生网络不支持 IPv6，而 CF 和 EdgeOne 都完美支持，我希望在页脚进行动态展示。

**技术实现**：
我利用 Next.js 服务端读取 Request Headers 的特性：

- 检测 `cf-ray`（Cloudflare）或 `eo-connecting-ip` / `eo-log-uuid`（腾讯云 EdgeOne）。
- 如果是，则亮起大号的 **IPv6 绿色徽标**，点击可直达 `https://ipw.wsmdn.top/` 进行入站检测。
- 如果检测到是 Vercel，则隐藏图标，显示文字：`本线路不支持ipv6，如有需要可点击右侧WiFi图标切换cloudflare或edgeone`，并附带文字检测链接。

*注：期间腾讯云 EdgeOne 默认 of CNAME 解析可能没有广播 AAAA 记录，需要在 EdgeOne 控制台手动把域名的 “IPv6 访问” 开关打开，才能正常解析和渲染。*

---

## 遭遇六：自动部署时的 npm 版本冲突之墙

当我把最新代码推送到 GitHub，等待平台自动构建时，自动构建又崩了，报了 `ERESOLVE could not resolve` 的 Peer Dependency 依赖版本冲突错误。

这是因为线上自动构建执行的是严格的 `npm ci` 安装。为了让云端构建服务器也闭嘴，我在根目录下新增了 `.npmrc` 文件：

```text
legacy-peer-deps=true
```

终于，全平台自动构建彻底畅通无阻！

---

## 后记

经过一整天的编译、改 Bug、改配置、删库、重建，我的个人主页终于完美活在了边缘网络上。在 Bing 站长平台提交了最新的 `sitemap.xml` 和 URL 申请后，我相信搜索“毅白”排在第一页首位的目标指日可待。

折腾的乐趣就在于此：虽然过程满是痛苦的 Error Log，但当一切绿灯亮起、全线路无缝访问的那一刻，一切都是值得的！
