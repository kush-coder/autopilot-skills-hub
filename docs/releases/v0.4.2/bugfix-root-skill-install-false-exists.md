# Bugfix：从探索页安装根目录级 Skill 时误报"已存在于 Hub"

## 问题描述

在探索页搜索并点击安装某个 Skill（如 `titanwings/colleague-skill`）时，弹出错误提示：

> 「.」已存在于 Hub，可前往"我的 Skills"中更新。

实际上该 Skill 从未安装过。

## 根因分析

`titanwings/colleague-skill` 是一个**根目录级 Skill**，即 `SKILL.md` 位于仓库根目录。`list_git_skills` 为此类 Skill 返回的候选项中 `subpath = "."`。

`install_git_skill_from_selection` 在推导 `display_name` 时，直接对 subpath 做字符串处理：

```rust
// 修复前
let mut display_name = name.unwrap_or_else(|| {
    subpath
        .rsplit('/')
        .next()
        .map(|s| s.to_string())
        .unwrap_or_else(|| derive_name_from_repo_url(&parsed.clone_url))
});
```

当 `subpath = "."` 时，`rsplit('/').next()` 返回 `"."`，导致：

- `display_name = "."`
- `central_path = central_dir.join(".") = central_dir`（即中央仓库目录本身）
- `central_path.exists()` 永远为 `true`
- 触发错误：`skill already exists in central repo: /path/to/central/.`

前端 `formatErrorMessage` 从路径中提取名称时调用 `.split('/').pop()` 得到 `"."`，最终显示「.」已存在于 Hub。

## 修复方案

当 `subpath == "."` 时，改为从 repo URL 推导初始名称，后续逻辑会继续用 `SKILL.md` 中的名称做最终重命名：

```rust
// 修复后
let mut display_name = name.unwrap_or_else(|| {
    if subpath == "." {
        derive_name_from_repo_url(&parsed.clone_url)
    } else {
        subpath
            .rsplit('/')
            .next()
            .map(|s| s.to_string())
            .unwrap_or_else(|| derive_name_from_repo_url(&parsed.clone_url))
    }
});
```

## 修改文件

- `src-tauri/src/core/installer.rs`：`install_git_skill_from_selection` 函数中对 `subpath == "."` 单独处理，避免用 `"."` 作为 skill 名称
