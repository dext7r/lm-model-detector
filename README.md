# 模型指纹检测 · LM Fingerprint Detector

基于 `lmfpd-sdk` 的模型指纹检测应用。填写 Base URL 和 API Key，拉取模型列表，批量采样并与参考库中的模型进行统计比对。支持多组配置、账户隔离、检测历史、结果分享和中英双语界面。

检测结果是**参考库内的候选排名，不能确证模型身份**。核心检测算法来自 `lmfpd-sdk`，本项目提供浏览器适配、界面、请求代理及账户存储。[检测逻辑说明](docs/DETECTION.md)介绍采样、评分和结果限制。

## 技术与目录

Vue 3、Vite、Tailwind CSS v4、Vue Router、Cloudflare Workers 和 KV。

```text
web/                       当前 Vue 前端
  public/og.png             分享图静态资源
  src/detector.js            SDK 初始化与跨域请求转发
  src/store.js               账户、配置与批量检测调度
  src/vendor/                浏览器 SDK 产物，本地开发直接引用
browser/                    SDK 浏览器入口及 Node 模块适配层
src/worker.js               账户、配置、历史、分享及代理 API
src/seo.js                  服务端 SEO、sitemap 和 RSS
scripts/                    本地启动器与分享图生成脚本
docs/DETECTION.md           检测逻辑及字段说明
wrangler.example.jsonc      脱敏部署配置模板
.dev.vars.example           本地密钥模板
THIRD_PARTY_NOTICES.md       第三方版权及许可证原文
```

`web/src/vendor/lmfpd.browser.js` 保留在仓库中，避免首次开发前必须打包 SDK。其来源为 `browser/entry.js`、适配层及锁文件中的依赖；更新时使用 `build:sdk` 脚本生成。`dist/`、本地缓存、真实配置和密钥不纳入版本控制。

## 本地使用

需要 Node.js 22.12+ 和 npm。`npm ci` 会安装锁文件中的 Wrangler、Vite 等本地工具，开发与部署脚本无需全局安装 Wrangler。

首次克隆后执行以下命令。已有本地配置时请保留原文件，勿用模板覆盖。

```bash
npm ci
cp wrangler.example.jsonc wrangler.jsonc
# 仅需要本地启用 Turnstile 时复制并填写私钥
cp .dev.vars.example .dev.vars
npm run dev
```

访问 `http://127.0.0.1:5180`，在 `/login` 注册账户。启动器运行 Worker（8787 端口）与 Vite（5180 端口），`/api/` 请求由 Vite 转发给 Worker。本地 KV 存在 `.wrangler/state` 中。模板中的全零 KV ID 仅用于占位，远程部署前必须替换。

也可以通过 `npm run dev:api` 和 `npm run dev:web` 分别启动两端。

## 自行部署

1. 复制模板为本地 `wrangler.jsonc`，按需修改 Worker 名称。
2. 使用自己的 Cloudflare 账户创建 KV 命名空间：`npx wrangler kv namespace create KV`，把返回的 ID 填到本地配置的 `kv_namespaces` 中，保留绑定名 `KV`。
3. 需要自定义域名时，在本地配置中添加自己的 `routes`；模板不绑定任何现有站点。
4. 如需 Turnstile，填写 `vars.TURNSTILE_SITE_KEY`，并执行 `npx wrangler secret put TURNSTILE_SECRET` 保存匹配的私钥。也支持用 `TURNSTILE_SITE_KEY_MAP` 配置按域名选择的 site key。两类密钥都未配置时跳过验证；只配置其中一类会拒绝登录和注册。
5. 完成配置后，自行运行所需构建和部署命令。

| 命令 | 用途 |
| --- | --- |
| `npm run build:sdk` | 生成浏览器 SDK |
| `npm run build:og` | 生成分享图 |
| `npm run build` | 依次生成 SDK、分享图和 Vite 静态产物 |
| `npm run deploy` | 构建后部署 Worker 与静态资源 |
| `npm run preview` | 使用已有 `dist/` 产物运行 Worker 本地预览，不执行构建 |
| `npm run preview:prod` | 构建后使用 Wrangler 本地预览 |

`wrangler.jsonc`、`.dev.vars` 及 `.env*` 的真实配置均被 Git 忽略。只提交不含真实值的模板；不要将账户标识、KV ID、API Key 或 Turnstile 私钥写入源码。

## 数据流与隐私

评分在浏览器内运行，但检测请求经部署实例的 Worker 转发，API Key 会经过该服务端；保存配置时，Base URL 与 API Key 一并写入该实例的 KV，当前没有应用层加密。仅使用自己信任的部署实例。

密码使用 PBKDF2-SHA256（100,000 次迭代）摘要，会话使用 HMAC 签名。会话令牌保存在浏览器 localStorage，配置和历史按账户 ID 隔离。历史保存评分摘要、前三候选和样本状态，不保存完整回答。主动创建的分享链接可被任何持有链接的人读取。

## 版权与来源

核心检测组件 **lmfpd-sdk 0.2.0** 采用 **MIT License**，原作者版权为 **Copyright (c) 2026 xqy2006**。SDK 来源与完整授权条款，以及浏览器 bundle 中相关组件的版权，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。现有页面版权标识与 bundle 内的许可证注释予以保留。

本次整理未为应用自身新增许可证；第三方组件的 MIT 授权只覆盖对应组件。若要正式以开源许可证发布应用其余代码，仍需由其版权持有人明确授权。
