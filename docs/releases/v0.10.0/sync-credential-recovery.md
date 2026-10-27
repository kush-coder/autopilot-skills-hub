# Sync credential recovery / 同步凭据恢复

## Problem

Development and packaged builds used separate credential namespaces but shared the default application data directory. A development credential reference could therefore replace the packaged app's sync configuration. Missing credentials were reported as inaccessible secure storage, without a recovery action.

## Fix

- Debug builds use a `.dev` application identifier at runtime, isolating database, sync workspace and application logs from packaged builds, including direct Tauri launches.
- No existing configuration or credential is migrated or deleted. Packaged builds retain their original data directory and credential namespace.
- Missing credentials have a distinct safe diagnostic code. Manual and background sync failures expose a user-triggered setup button; background failures never open authorization automatically.
- Recovery opens the existing settings drawer with the Token field expanded. Settings only describe a previously configured reference, not verified credential availability. Page loading and settings display do not read credentials.

## Verification

Regression coverage includes development/packaged identifier separation, missing versus inaccessible credential classification and sanitization, manual recovery, background failures without credential access, and preservation of credential ownership when enabling automatic sync.

## 中文说明

开发版过去仅隔离 Token 存储，却共用正式版应用数据目录，因此可能把开发版凭据引用写入正式版同步配置。本次同时隔离开发版应用数据目录，不迁移、不删除现有配置或凭据。

同步错误现在区分“找不到凭据”和“无法访问凭据”，并提供“重新配置凭据”入口。点击后展开现有设置里的 Token 输入区，无需断开连接。后台失败不自动弹窗，打开页面和设置不读取 Token。

已恢复的正式版配置无需重新设置。受旧问题影响的配置可在正式版重新授权或填写 Token 后保存。已有历史记录中的笼统凭据错误无法反推真实原因，不进行猜测性改写。
