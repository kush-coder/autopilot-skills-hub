# 发布构建与平台兼容性

本文汇总 v0.10.0 的发布构建检查和平台构建兼容性修复。

## 安装包 OAuth 配置检查

正式安装版仅使用编译期的 OAuth 配置，不读取用户机器上的 `.env`。开发版能授权不代表打包时配置已经注入。

`npm run tauri:dev` 和所有 `npm run tauri:build*` 命令现在统一通过受检查的启动脚本，同时要求 `SKILLS_HUB_GITHUB_CLIENT_ID` 与 `SKILLS_HUB_GITLAB_CLIENT_ID`。这修复了 GitLab Client ID 已写入 `.env`，却因开发启动入口绕过注入、构建脚本只识别 GitHub 字段而仍显示“不支持浏览器授权”的问题。

CI 可继续从构建环境注入；本地未设置对应环境变量且未显式指定配置文件时，自动读取仓库根目录 `.env`：

```bash
cp .env.example .env
npm run tauri:build:mac:universal:dmg
```

先只检查配置、不构建：

```bash
node scripts/build-desktop.mjs --check-oauth-only
```

如需使用其他配置文件，仍可传入 `--oauth-env-file /absolute/path/to/.env`。脚本只提取精确命名的两个公开 Client ID，不执行文件内容、不展开变量、不导入 Client Secret、用户 Token 或其他字段、不访问钥匙串；日志不打印配置值。两个字段分别采用“已有显式环境变量优先，缺失项再从文件补充”的规则。不要将 `.env` 复制进安装包。

直接运行 `tauri dev`、`tauri build` 或 `cargo build` 会绕过 npm 的前置检查；开发、发布和分发包须使用上述受检查的 npm 入口。

验证包括任一字段缺失或无效时拒绝、重复声明拒绝、逐字段环境变量优先、无秘密值日志、开发与构建子命令及实际命令退出码。Client ID 存在不能证明 GitHub/GitLab 服务、网络或用户授权已成功，仍需在目标设备走一次登录流程。

## Windows/MSVC Rust 测试目标编译

[Issue #142](https://github.com/qufei1993/skills-hub/issues/142) 报告 Windows/MSVC 无法编译 Rust Clippy 和测试目标。[PR #143](https://github.com/qufei1993/skills-hub/pull/143) 作为社区贡献修复了三个平台差异：

- 将 `Cred::credtype()` 与 `CredentialType::bits()` 转换到共同的跨平台整数类型后比较，兼容 MSVC 与 GCC/Clang 的 C 枚举底层类型差异。
- 仅在 Unix 测试中导入 `PathBuf`，避免 Windows 上出现未使用导入。
- 移除 `try_link_dir` Windows 分支末尾多余的 `return`，通过启用 `-D warnings` 的 Clippy 检查。

修复后，`cargo clippy --all-targets --all-features -- -D warnings` 可在报告环境中通过，Rust 测试目标也可完成编译。该修改不改变 Unix 平台行为。

### 已知边界

报告环境中的 Rust 测试程序随后仍可能以 `0xc0000139 STATUS_ENTRYPOINT_NOT_FOUND` 启动失败。该现象与既有 Tauri 测试运行环境有关，不是上述三处编译错误，也未由 PR #143 修复；因此发布记录只声明 Windows 测试目标恢复编译，不声明所有 Windows Rust 测试已经成功运行。
