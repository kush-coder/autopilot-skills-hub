# 需求一：精选技能推荐列表 — 实施计划

## Context

用户打开"添加技能"时，只有手动输入本地路径或 Git URL，缺乏发现能力。需要在 AddSkillModal 中新增"探索"标签页，展示由 CI 预生成的热门技能列表，用户点击后自动走现有 Git 安装流程。

数据源：ClawHub API (`clawhub.ai/api/v1/skills`)，由 GitHub Actions 每日拉取生成 `featured-skills.json` 提交到仓库。应用运行时从 GitHub raw URL 获取该 JSON（带本地缓存兜底），避免直接依赖 ClawHub API。

## 关键发现

- AddSkillModal 已有一个 **disabled 的搜索标签按钮**（第 88-90 行），可直接改造为"探索"
- `addModalTab` 类型当前为 `'local' | 'git'`，需扩展为三值联合
- 后端已有 `reqwest::blocking::Client` + `github_search.rs` 的 HTTP 模式可复用
- `SkillStore` 已有 `get_setting` / `set_setting` 可用于缓存
- `parse_github_url` 已支持 `https://github.com/owner/repo/tree/branch/path` 格式
- 安装 URL 格式：`https://github.com/openclaw/skills/tree/main/skills/{username}/{slug}`

## 步骤 1：CI — GitHub Actions 工作流 + 拉取脚本

### 新建 `.github/workflows/update-featured-skills.yml`

- 每日 UTC 0:00 定时运行 + 支持手动触发
- 执行 Node.js 脚本 `scripts/fetch-featured-skills.mjs`
- 若 JSON 有变化则自动提交

### 新建 `scripts/fetch-featured-skills.mjs`

逻辑：
1. 调用 `GET https://clawhub.ai/api/v1/skills?sort=downloads&limit=100`
2. 调用 GitHub API 获取 `openclaw/skills` 仓库 `skills/` 目录结构（用于匹配 slug → 实际路径）
3. 对每个 ClawHub 技能，在 `openclaw/skills` 目录中按 slug 匹配找到 `{username}/{slug}` 路径
4. 生成 `featured-skills.json`，结构：

```json
{
  "updated_at": "2026-03-13T00:00:00Z",
  "skills": [
    {
      "slug": "self-improving-agent",
      "name": "self-improving-agent",
      "summary": "Captures learnings, errors...",
      "downloads": 197815,
      "stars": 1934,
      "source_url": "https://github.com/openclaw/skills/tree/main/skills/username/self-improving-agent"
    }
  ]
}
```

5. 未匹配到 GitHub 路径的技能，`source_url` 留空，前端不显示安装按钮

### 同时先手动运行一次脚本，生成初始 `featured-skills.json` 提交到仓库根目录

## 步骤 2：后端 — 新建 `core/featured_skills.rs`

参考 `github_search.rs` (src-tauri/src/core/github_search.rs) 模式。

```rust
// 数据结构
pub struct FeaturedSkillsData { updated_at: String, skills: Vec<FeaturedSkill> }
pub struct FeaturedSkill { slug, name, summary, downloads: u64, stars: u64, source_url: String }

// 核心函数
pub fn fetch_featured_skills(store: &SkillStore) -> Result<Vec<FeaturedSkill>>
```

逻辑：
1. `reqwest::blocking::Client` 请求 `https://raw.githubusercontent.com/{owner}/{repo}/main/featured-skills.json`
2. 成功 → 解析 JSON，缓存到 `store.set_setting("featured_skills_cache", &json_str)`
3. 失败 → 从 `store.get_setting("featured_skills_cache")` 读缓存
4. 都失败 → 返回空 Vec（优雅降级，不 bail）
5. 过滤掉 `source_url` 为空的条目

### 修改 `core/mod.rs`

添加 `pub mod featured_skills;`

## 步骤 3：后端 — 注册 Tauri 命令

### 修改 `src-tauri/src/commands/mod.rs`

新增 DTO 和命令：

```rust
#[derive(Debug, Serialize)]
pub struct FeaturedSkillDto {
    pub slug: String,
    pub name: String,
    pub summary: String,
    pub downloads: u64,
    pub stars: u64,
    pub source_url: String,
}

#[tauri::command]
pub async fn get_featured_skills(store: State<'_, SkillStore>) -> Result<Vec<FeaturedSkillDto>, String>
```

使用标准的 `spawn_blocking` + `format_anyhow_error` 模式。

### 修改 `src-tauri/src/lib.rs`

在 `generate_handler!` 中注册 `commands::get_featured_skills`。

## 步骤 4：前端 — 类型定义

### 修改 `src/components/skills/types.ts`

```typescript
export type FeaturedSkillDto = {
  slug: string
  name: string
  summary: string
  downloads: number
  stars: number
  source_url: string
}
```

## 步骤 5：前端 — App.tsx 状态管理

### 修改 `src/App.tsx`

1. **Tab 类型扩展**：`useState<'local' | 'git' | 'explore'>('explore')` — 默认打开探索标签
2. **新增状态**：
   - `const [featuredSkills, setFeaturedSkills] = useState<FeaturedSkillDto[]>([])`
   - `const [featuredLoading, setFeaturedLoading] = useState(false)`
   - `const [exploreFilter, setExploreFilter] = useState('')`
3. **新增 `loadFeaturedSkills`**：调用 `invoke('get_featured_skills')`，在 `handleOpenAdd` 中触发（仅首次或数据为空时）
4. **新增 `handleSelectFeaturedSkill(sourceUrl: string)`**：
   - `setGitUrl(sourceUrl)`
   - `setAddModalTab('git')` — 自动跳转到 Git 标签
5. **传递新 props 给 AddSkillModal**：`featuredSkills`, `featuredLoading`, `exploreFilter`, `onExploreFilterChange`, `onSelectFeaturedSkill`

## 步骤 6：前端 — 修改 AddSkillModal

### 修改 `src/components/skills/modals/AddSkillModal.tsx`

1. **Props 类型扩展**：添加 explore 相关的 6 个新 props
2. **启用探索标签**：替换第 88-90 行 disabled 按钮为可点击的 explore 标签
3. **三分支条件渲染**：
   - `addModalTab === 'explore'` → 探索内容
   - `addModalTab === 'local'` → 本地表单（现有）
   - `addModalTab === 'git'` → Git 表单（现有）
4. **探索标签内容**：
   - 筛选输入框（前端过滤 name + summary）
   - 可滚动列表（max-height ~400px）
   - 每项显示：name（粗体）、summary（截断）、downloads + stars 统计
   - 点击 → 调用 `onSelectFeaturedSkill(source_url)`
   - Loading / Empty 状态
5. **条件隐藏底部区域**：explore 标签时隐藏 "Install to tools" 复选框区域和 footer 按钮（用户在此标签只浏览，安装在 git 标签完成）

## 步骤 7：前端 — i18n 翻译

### 修改 `src/i18n/resources.ts`

```
EN:
  exploreTab: 'Explore'
  exploreFilterPlaceholder: 'Filter skills...'
  exploreEmpty: 'No featured skills available.'
  exploreLoading: 'Loading featured skills...'
  exploreError: 'Failed to load featured skills.'

ZH:
  exploreTab: '探索'
  exploreFilterPlaceholder: '筛选技能...'
  exploreEmpty: '暂无精选技能。'
  exploreLoading: '加载精选技能中...'
  exploreError: '加载精选技能失败。'
```

## 步骤 8：前端 — CSS 样式

### 修改 `src/App.css`

添加探索标签页样式：
- `.explore-filter` — 输入框
- `.explore-list` — 可滚动容器 (max-height: 400px, overflow-y: auto)
- `.explore-skill-item` — 单条技能行 (cursor: pointer, hover 高亮)
- `.explore-skill-name` — 名称
- `.explore-skill-summary` — 简介 (text-overflow: ellipsis)
- `.explore-skill-stats` — 统计数字
- `.explore-empty` / `.explore-loading` — 状态提示

## 步骤 9：后端测试

### 新建 `src-tauri/src/core/tests/featured_skills.rs`

使用 `mockito` mock HTTP：
- 测试正常 JSON 解析
- 测试 HTTP 失败时缓存 fallback
- 测试空/畸形 JSON 的优雅降级

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `.github/workflows/update-featured-skills.yml` | 新建 | CI 定时任务 |
| `scripts/fetch-featured-skills.mjs` | 新建 | 数据拉取脚本 |
| `featured-skills.json` | 新建 | CI 生成的精选列表 |
| `src-tauri/src/core/featured_skills.rs` | 新建 | 后端核心逻辑 |
| `src-tauri/src/core/mod.rs` | 修改 | 导出新模块 |
| `src-tauri/src/commands/mod.rs` | 修改 | 新增命令 + DTO |
| `src-tauri/src/lib.rs` | 修改 | 注册命令 |
| `src/components/skills/types.ts` | 修改 | 新增前端 DTO |
| `src/App.tsx` | 修改 | 状态 + 回调 + props |
| `src/components/skills/modals/AddSkillModal.tsx` | 修改 | UI 改造核心 |
| `src/i18n/resources.ts` | 修改 | 中英文翻译 |
| `src/App.css` | 修改 | 探索标签样式 |
| `src-tauri/src/core/tests/featured_skills.rs` | 新建 | 后端测试 |

## 验证方式

1. `npm run check` — lint + build + rust:clippy + rust:test 全部通过
2. `npm run tauri:dev` — 打开 AddSkillModal，默认显示"探索"标签
3. 确认列表加载正常（或网络失败时显示友好提示）
4. 输入关键词，确认筛选功能工作
5. 点击某个技能，确认自动跳转到 Git 标签并填充 URL
6. 在 Git 标签点击安装，确认走通完整安装流程
