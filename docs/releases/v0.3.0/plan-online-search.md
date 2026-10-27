# 需求二：在线技能搜索与安装 — 实施计划（已完成）

## Context

需求一已实现"探索"标签页，展示精选技能列表。但精选列表覆盖有限，用户有明确需求时（如"找 React 相关技能"），需要实时搜索能力。搜索功能内嵌在探索标签页中：用户输入关键词 → 精选本地过滤秒出 + 在线搜索结果分区展示，清空搜索框 → 恢复精选列表。

数据源：`skills.sh/api/search?q={query}&limit=20`（无需认证，模糊搜索，最少 2 字符）。无 CORS，必须从 Rust 后端调用。

### API 返回字段

```json
{
  "id": "vercel-labs/agent-skills/vercel-react-best-practices",
  "skillId": "vercel-react-best-practices",
  "name": "vercel-react-best-practices",
  "installs": 205992,
  "source": "vercel-labs/agent-skills"
}
```

> **重要发现**：`id` 和 `name` 不能直接映射到仓库内的文件路径。例如 API `name: "json-render-react"` 对应仓库目录 `skills/react/`、SKILL.md `name: "react"`。skills.sh 平台对名称做了转换，与仓库实际 SKILL.md frontmatter name 不一致。

## 核心设计决策

### 方案：分区展示，精选 + 在线互补

输入框升级为双模式，两个数据源分区展示：
- 输入 < 2 字符：仅前端本地过滤精选列表（现有行为不变）
- 输入 >= 2 字符：上方显示精选列表本地过滤结果（秒出，有 summary），下方分割线后显示在线搜索结果（500ms 防抖，有 installs）
- 清空输入框：隐藏在线搜索区域，恢复完整精选列表

```
用户输入 "react"
  ↓ 立刻
  ┌─ 精选推荐（本地过滤） ──────────────┐
  │  vercel-react-best-practices        │  ← 有 summary
  │  vercel-react-native-skills         │
  └─────────────────────────────────────┘
  ↓ 500ms 后
  ┌─ 在线搜索 skills.sh ───────────────┐
  │  react-expert (203K installs)       │  ← 无 summary，有 installs
  │  react (57K installs)               │
  └─────────────────────────────────────┘
```

### 在线搜索去重

在线结果中与精选列表 name 重复的条目自动过滤（`useMemo` 按 name 去重）。

### 点击安装 — 多技能仓库自动匹配

点击在线搜索结果时，`source_url` 是仓库地址（`https://github.com/owner/repo`），不含子目录路径（因为 API 数据无法可靠映射到仓库文件路径）。安装流程：

1. 设置 `gitUrl` = 仓库地址，`autoSelectSkillName` = API 返回的 skill name
2. 用户点安装 → `list_git_skills_cmd` 克隆仓库列出所有候选 skill
3. **自动匹配策略**（三级回退）：
   - 精确匹配：API name === SKILL.md name（如 `vercel-react-best-practices`）
   - 唯一包含匹配：API name 包含某个 SKILL.md name，且仅一个候选命中（如 `json-render-react` 包含 `react`）
   - 回退 picker：匹配失败或多个候选命中时，弹出选择弹窗让用户手动选
4. 单技能仓库：直接安装（现有逻辑不变）

## 实现步骤

### 步骤 1：后端 — `core/skills_search.rs`（新建）

参考 `github_search.rs` 模式。

```rust
#[derive(Debug, Deserialize)]
struct SkillsShResponse { skills: Vec<SkillsShItem> }
struct SkillsShItem { name: String, installs: u64, source: String }

pub struct OnlineSkillResult {
    pub name: String,
    pub installs: u64,
    pub source: String,        // "owner/repo"
    pub source_url: String,    // "https://github.com/owner/repo"
}

pub fn search_skills_online(query: &str, limit: usize) -> Result<Vec<OnlineSkillResult>>
// 内部函数 search_skills_online_inner(base_url, query, limit) 支持测试注入
```

`source_url` 由 `source` 字段拼接（`https://github.com/{source}`）。不使用 `id` 字段构造路径（无法映射到仓库实际目录结构）。

在 `core/mod.rs` 添加 `pub mod skills_search;`。

### 步骤 2：后端 — 注册 Tauri 命令

`commands/mod.rs` 新增：

```rust
#[derive(Debug, Serialize)]
pub struct OnlineSkillDto { name, installs, source, source_url }

impl From<OnlineSkillResult> for OnlineSkillDto { ... }

#[tauri::command]
pub async fn search_skills_online(query: String, limit: Option<u32>) -> Result<Vec<OnlineSkillDto>, String>
```

不需要 `State<SkillStore>`（纯 HTTP 调用）。在 `lib.rs` 的 `generate_handler!` 中注册。

### 步骤 3：前端 — 类型定义

`src/components/skills/types.ts` 新增：

```typescript
export type OnlineSkillDto = {
  name: string
  installs: number
  source: string      // "owner/repo"
  source_url: string  // "https://github.com/owner/repo"
}
```

### 步骤 4：前端 — App.tsx 状态与逻辑

1. **新增状态**：
   - `searchResults: OnlineSkillDto[]` — 在线搜索结果
   - `searchLoading: boolean` — 搜索加载中
   - `searchTimerRef: useRef` — 500ms 防抖 timer
   - `autoSelectSkillName: string | null` — 从在线搜索点击时记录的目标 skill 名称

2. **`handleExploreFilterChange`**：
   - 设置 `exploreFilter`（驱动精选列表本地过滤，秒出）
   - < 2 字符 → 清除 timer + 清空搜索结果
   - >= 2 字符 → 500ms 防抖后调用 `invoke('search_skills_online', { query, limit: 20 })`

3. **`handleSelectSearchResult(sourceUrl, skillName)`**：
   - `setGitUrl(sourceUrl)` + `setAutoSelectSkillName(skillName)` + 切换到 git tab

4. **`handleCreateGit` 中多技能分支增加自动匹配**：
   - 当 `autoSelectSkillName` 存在且 `candidates.length > 1` 时，按三级回退策略自动匹配
   - 匹配成功 → 直接 `install_git_selection` 安装
   - 匹配失败 → 回退到 picker 弹窗

### 步骤 5：前端 — AddSkillModal 分区布局

Props 新增：`searchResults`, `searchLoading`, `onSelectSearchResult(sourceUrl, skillName)`

```
{/* 区域 1：精选推荐（始终显示，本地过滤） */}
{isSearchActive && <SectionTitle>精选推荐</SectionTitle>}
<explore-list>精选过滤结果</explore-list>

{/* 区域 2：在线搜索（仅 >= 2 字符时显示） */}
{isSearchActive && <>
  <SectionTitle>在线搜索</SectionTitle>
  {searchLoading ? <Loading /> : deduplicatedResults.map(skill => (
    <SkillItem name={skill.name} source={skill.source} installs={skill.installs}
               onClick={() => onSelectSearchResult(skill.source_url, skill.name)} />
  ))}
</>}

{/* 全局空状态 */}
{无精选 && 无搜索 && <Empty />}
```

去重：`useMemo` 从 `searchResults` 中过滤掉 name 已存在于 `filteredSkills` 的条目。

### 步骤 6：i18n 翻译

```
EN:
  exploreFilterPlaceholder: 'Filter or search skills online...'
  exploreFeaturedTitle: 'Featured'
  exploreOnlineTitle: 'Online Results'
  searchLoading: 'Searching skills.sh...'
  searchEmpty: 'No additional results found.'
  searchError: 'Online search failed.'

ZH:
  exploreFilterPlaceholder: '筛选精选或在线搜索技能...'
  exploreFeaturedTitle: '精选推荐'
  exploreOnlineTitle: '在线搜索'
  searchLoading: '正在搜索 skills.sh...'
  searchEmpty: '未找到更多结果。'
  searchError: '在线搜索失败。'
```

### 步骤 7：CSS 样式

- `.explore-section-title` — 分区标题（小字灰色，带上边框分隔，uppercase）
- `.explore-skill-source` — source 字段（灰色小字 12px）
- 复用现有 `.explore-skill-item` / `.explore-list` 样式

### 步骤 8：后端测试

`src-tauri/src/core/tests/skills_search.rs`，使用 `mockito` mock：
- `parses_search_results` — 正常解析 + source_url 拼接
- `source_url_is_constructed_from_source` — source → GitHub URL
- `http_error_returns_error` — HTTP 500 错误处理
- `empty_results` — 空结果

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/src/core/skills_search.rs` | 新建 | 搜索核心逻辑（请求 skills.sh API） |
| `src-tauri/src/core/mod.rs` | 修改 | 导出 `skills_search` 模块 |
| `src-tauri/src/commands/mod.rs` | 修改 | 新增 `OnlineSkillDto` + `search_skills_online` 命令 |
| `src-tauri/src/lib.rs` | 修改 | 在 `generate_handler!` 注册命令 |
| `src-tauri/src/core/tests/skills_search.rs` | 新建 | 4 个后端测试 |
| `src/components/skills/types.ts` | 修改 | 新增 `OnlineSkillDto` 类型 |
| `src/App.tsx` | 修改 | 搜索状态 + 防抖 + `autoSelectSkillName` 自动匹配 |
| `src/components/skills/modals/AddSkillModal.tsx` | 修改 | 分区展示 UI + 去重 |
| `src/i18n/resources.ts` | 修改 | 搜索相关中英文翻译 |
| `src/App.css` | 修改 | 分区标题 + source 样式 |

## 验证方式

1. `npm run check` — 全部通过（lint + build + rust fmt/clippy/test）
2. 打开探索标签，输入 1 个字符 → 仅本地过滤精选列表，无在线搜索区域
3. 输入 2+ 字符 → 精选过滤结果秒出（上方），500ms 后在线搜索区域出现
4. 在线搜索结果中不包含精选列表已有的条目（去重）
5. 搜索结果正确展示（name, installs, source）
6. 清空输入框 → 在线搜索区域消失，恢复完整精选列表
7. 点击搜索结果 → 跳转到 Git 标签填充仓库 URL → 安装时自动匹配目标 skill
8. 多技能仓库自动匹配失败时 → 回退到手动选择弹窗
9. 断网时搜索 → 在线区域显示错误提示，精选列表不受影响

## 已知限制

- skills.sh API 的 `name` 与仓库 SKILL.md frontmatter `name` 不一定一致（如 `json-render-react` vs `react`），自动匹配使用精确 + 唯一包含策略，极端情况可能回退到手动选择
- `source_url` 只包含仓库地址，不含子目录路径（API `id` 字段无法可靠映射到仓库文件路径）
- 多技能仓库首次安装需克隆完整仓库以获取候选列表（后续命中缓存）
