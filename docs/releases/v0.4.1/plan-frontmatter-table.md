# Plan: Skill 详情页 Frontmatter 元数据表格展示

## Context
当前 `SkillDetailView` 使用 `remarkFrontmatter` 插件，该插件只是让 react-markdown 忽略 YAML frontmatter（不报错），但不会渲染它。用户希望像 GitHub 一样，将 frontmatter 中的字段以表格形式展示在 markdown 内容顶部。

## 修改方案

### 仅需修改 1 个文件
**`src/components/skills/SkillDetailView.tsx`** — `FileContentRenderer` 组件

### 实现步骤

1. **添加 frontmatter 解析函数** — 在 `FileContentRenderer` 中，对 markdown 文件的 content 进行简单的 YAML frontmatter 提取：
   - 检测 `---` 开头和结束标记
   - 逐行解析 `key: value` 对，得到 `Record<string, string>`
   - 分离出 frontmatter 数据和剩余的 markdown body

2. **渲染 frontmatter 表格** — 在 `<Markdown>` 组件之前，如果存在 frontmatter 数据，渲染一个 HTML 表格：
   - 表头为 frontmatter 的 key（如 name, description, license）
   - 表体为对应的 value
   - 复用现有的 `.markdown-body table/th/td` 样式（已在 App.css 中定义）

3. **传递剩余内容给 Markdown** — 将去除 frontmatter 后的 body 传给 `<Markdown>` 组件，同时保留 `remarkFrontmatter` 插件（作为安全兜底）

### 不需要的改动
- 不需要安装新依赖（不用 `gray-matter` 等库，简单的字符串解析即可）
- 不需要修改后端
- 不需要新增 CSS（已有 table 样式）
- 不需要 i18n（表头直接使用 frontmatter 的 key 名）

## 验证
- `npm run check` 通过
- 打开一个包含 frontmatter 的 skill（如 SKILL.md），确认顶部显示元数据表格，下方正常渲染 markdown 内容
- 打开没有 frontmatter 的文件，确认不会显示表格，渲染正常
