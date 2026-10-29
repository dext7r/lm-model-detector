# 模型指纹检测 · LM Fingerprint Detector

基于上游项目 [lm-detector](https://github.com/Ikaleio/lm-detector) 的 [lmfpd-sdk](https://www.npmjs.com/package/lmfpd-sdk) 开发的模型指纹检测应用。填写 Base URL 和 API Key，拉取模型列表，批量采样并与参考库中的模型进行统计比对。支持多组配置与中英双语界面；绑定 KV 后还支持账户隔离、检测历史和云端分享。

检测结果是**参考库内的候选排名，不能确证模型身份**。核心检测算法由上游 SDK 提供，本项目负责浏览器适配、界面、请求代理及账户存储。[检测逻辑说明](docs/DETECTION.md)介绍采样、评分和结果限制。

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
wrangler.example.jsonc      默认免登录、无存储部署模板
wrangler.account.example.jsonc  可选账户版部署模板
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

访问 `http://127.0.0.1:5180`，默认无需登录即可检测。启动器运行 Worker（8787 端口）与 Vite（5180 端口），`/api/` 请求由 Vite 转发给 Worker。需要本地体验账户版时，改用 `wrangler.account.example.jsonc` 复制为本地配置；本地 KV 数据位于 `.wrangler/state` 中。已有 `wrangler.jsonc` 的模式取决于其中是否绑定 KV，不会被代码更新自动更改。

也可以通过 `npm run dev:api` 和 `npm run dev:web` 分别启动两端。

## 自行部署

同一份代码通过 **是否绑定 `KV`** 自动选择模式，无需额外的前端构建开关：

| 功能 | 未绑定 KV：免登录版 | 已绑定 KV：账户版 |
| --- | --- | --- |
| 登录与注册 | 无需登录 | 启用账户鉴权 |
| 配置与 API Key | 仅当前页面内存 | 按账户写入 KV |
| 检测结果 | 当前页面展示，刷新即清空 | 自动保存历史 |
| 历史、云端分享、分享 RSS | 不启用 | 启用 |
| 主题和语言偏好 | 仅当前页面内存 | 浏览器 localStorage |
| 参考数据边缘缓存 | 不主动写入缓存，响应为 no-store | 缓存 24 小时 |

1. **免登录版（默认）**：复制 `wrangler.example.jsonc` 为 `wrangler.jsonc`，无需创建 KV，也无需配置 Turnstile。模板默认关闭 Worker 可观测性日志。
2. **账户版（可选）**：复制 `wrangler.account.example.jsonc` 为 `wrangler.jsonc`；使用自己的 Cloudflare 账户创建 KV 命名空间：`npx wrangler kv namespace create KV`，将 ID 填入 `kv_namespaces`，保留绑定名 `KV`。模板中的全零 ID 仅用于占位。访问 `/login` 注册账户。
3. 按需修改 Worker 名称；需要自定义域名时添加自己的 `routes`，模板不绑定现有站点。
4. 账户版可选启用 Turnstile：填写 `vars.TURNSTILE_SITE_KEY`，并执行 `npx wrangler secret put TURNSTILE_SECRET` 保存匹配私钥。也支持用 `TURNSTILE_SITE_KEY_MAP` 按域名选择 site key。两类密钥都未配置时仅跳过人机验证，账户登录仍然必需；只配置一类会拒绝登录和注册。免登录版忽略 Turnstile 配置。
5. 完成配置后，自行运行所需构建和部署命令。

已有部署要切换为免登录版时，删除本地配置中的 `KV` 绑定后重新部署即可；代码不会删除旧 KV 中已有的数据。重新绑定原 KV 可恢复账户功能。KV 已绑定但访问失败时仍按账户模式报错，不会降级成免登录。

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

评分在浏览器内运行，模型列表与检测请求经部署实例的 Worker 转发，API Key 会经过该服务端。取消本站登录不影响目标模型服务要求的 API Key。仅使用自己信任的部署实例。

**免登录版**不创建账户、不访问 KV、不保存历史或分享，不读写浏览器 localStorage，也不主动写入参考数据边缘缓存。配置、密钥、模型列表和结果仅在当前页面内存中存活，刷新或关闭即清空。应用不主动持久化这些数据，不代表浏览器、Cloudflare 或上游模型服务没有自身的缓存与访问记录。默认模板关闭可观测性；已有部署需自行核实平台上的日志设置。

免登录代理接受本站浏览器发起的请求，仅允许标准 HTTPS 端口的域名地址，拒绝 IP 字面量、本地名称和 URL 内嵌凭据，并拒绝上游重定向。这是请求来源和 URL 格式限制，不是用户鉴权，也不保证域名实际解析到公网；公开部署可按自己的使用范围额外配置域名允许列表或平台限流。

**账户版**保存配置时，Base URL 与 API Key 一并写入实例 KV，当前没有应用层加密。

密码使用 PBKDF2-SHA256（100,000 次迭代）摘要，会话使用 HMAC 签名。会话令牌保存在浏览器 localStorage，配置和历史按账户 ID 隔离。历史保存评分摘要、前三候选和样本状态，不保存完整回答。主动创建的分享链接可被任何持有链接的人读取。

## 版权与来源

上游项目及相关资料：

- [Ikaleio/lm-detector：上游源码仓库](https://github.com/Ikaleio/lm-detector)
- [lmfpd：上游命令行工具（npm）](https://www.npmjs.com/package/lmfpd)
- [lmfpd-sdk 0.2.0：本项目使用的检测 SDK（npm）](https://www.npmjs.com/package/lmfpd-sdk/v/0.2.0)
- [上游使用与原理文档](https://lm.ikale.io/docs)
- [本项目的第三方版权与授权声明](THIRD_PARTY_NOTICES.md)

本项目通过 SDK 复用上游检测能力。核心检测组件 **lmfpd-sdk 0.2.0** 采用 **MIT License**，原作者版权为 **Copyright (c) 2026 xqy2006**。完整授权条款及浏览器 bundle 中相关组件的版权见上述第三方声明；现有页面版权标识与 bundle 内的许可证注释予以保留。

本次整理未为应用自身新增许可证；第三方组件的 MIT 授权只覆盖对应组件。若要正式以开源许可证发布应用其余代码，仍需由其版权持有人明确授权。
