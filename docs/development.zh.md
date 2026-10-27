# 开发与构建

[项目介绍](README.zh.md) · [English](development.en.md)

使用文档统一在 [Skills Hub 官网](https://aiskillshub.link/docs)维护。本页仅介绍桌面项目的开发与构建。

## 环境要求

- Node.js 18+（建议 20+）
- Rust（stable）
- Tauri 系统依赖（按官方文档安装）

首次启动桌面应用或构建安装包前，创建本地 OAuth 配置：

```bash
cp .env.example .env
```

将两个占位值分别替换为团队提供的 GitHub、GitLab OAuth 公开 Client ID。`npm run tauri:dev` 和本地 `npm run tauri:build*` 命令只会从根目录 `.env` 读取这两个白名单字段；进程环境中已存在的对应值优先。两个 ID 都是必填项，以确保两个平台均可使用浏览器授权。不要填写 Client Secret 或用户 Token，也不要提交 `.env`。

## 启动（桌面端）

```bash
npm install
npm run tauri:dev
```

## 构建

本地安装测试请在对应操作系统上执行：

```bash
# 自动选择当前系统和架构。
npm run tauri:build:local
# 或指定安装包格式。
npm run tauri:build:local:mac:dmg
npm run tauri:build:local:win:exe
npm run tauri:build:local:win:msi
npm run tauri:build:local:win:all
npm run tauri:build:local:linux:deb
npm run tauri:build:local:linux:appimage
npm run tauri:build:local:linux:all
```

本地测试打包只编译所选目标平台的一份 CLI，默认使用本机系统和架构，也可通过 `--target` 指定支持的目标。CLI 原始文件嵌入经过 release 优化的桌面程序。安装后的 **Skills Hub Local Test** 在一键启用 AI 管理时校验并安装这份本地 CLI，无需下载 CLI，也不依赖源码目录。应用标识和安装包名称独立，禁用正式版更新地址和 updater 产物；桌面与 CLI 均使用开发凭据和 CLI bridge 命名空间。技能库、配置、缓存、回收站和写锁仍与正式版共用，启用 AI 管理会影响真实 Agent 目录和终端 PATH。此模式不能同时传入 `--cli-manifest`、`SKILLS_HUB_CLI_MANIFEST_PATH`、`--dev` 或 debug 参数。暂不支持 macOS universal 和 Windows ARM 目标，请使用已支持的原生目标。

常规正式打包需提供已发布 CLI 的清单，版本、源码提交和目标平台必须与桌面构建一致：

```bash
# 示例：macOS ARM，先另行下载配套的官方发布清单。
npm run tauri:build:mac:dmg -- --target aarch64-apple-darwin --cli-manifest /path/to/cli-manifest-aarch64-apple-darwin.json
```

下方所有常规平台命令都需追加 `-- --cli-manifest <清单路径>`，或设置 `SKILLS_HUB_CLI_MANIFEST_PATH`。本地生成的清单可能与线上签名后的 CLI 不同，导致启用时下载校验失败；未发布的代码请使用本地测试模式。缺少清单时会给出当前平台的替代命令，不会自动切换为测试包。`npm run tauri:dev` 继续自动准备本地 debug CLI。本地测试包用于验证安装和本地 CLI 联动；正式包的线上 CLI 下载、校验和安装流程仍需单独验证。两种构建模式均需配置前文的 OAuth 公开 Client ID。

### 各系统构建命令（来自 `package.json`）

- macOS（dmg）：`npm run tauri:build:mac:dmg`
- macOS（universal dmg）：`npm run tauri:build:mac:universal:dmg`
- Windows（MSI）：`npm run tauri:build:win:msi`
- Windows（NSIS exe）：`npm run tauri:build:win:exe`
- Windows（MSI+NSIS）：`npm run tauri:build:win:all`
- Linux（deb）：`npm run tauri:build:linux:deb`
- Linux（AppImage）：`npm run tauri:build:linux:appimage`
- Linux（deb+AppImage）：`npm run tauri:build:linux:all`

## 测试（Rust）

```bash
cd src-tauri
cargo test
```

