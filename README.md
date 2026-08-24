# dsh-jump-history

在 DeepSeek Harness Web GUI 中提供**对话跳转**能力的持久化插件：会话头部标题栏右侧新增一个「跳转」按钮，点击弹出搜索面板，可搜索/选择历史会话并**一键跳转**到该会话。交互参考 DeepSeek 网页版（chat.deepseek.com）的对话历史切换体验。

```
┌──────────────────────────────────────────────────────────┐
│ 会话标题 …                      [跳转⇅] [任务列表] [预设] │  ← 头部动作行
└──────────────────────────────────────────────────────────┘

                点击「跳转」弹出：
        ┌────────────────────────────────────────┐
        │ 🔍 搜索对话标题或内容，或直接选择会话…  │
        │ ───────────────────────────────────────│
        │ 我的会话标题        工作区 · 3 小时前     │
        │ 另一段对话          工作区 · 2 天前       │
        │ 当前会话 …（高亮）  工作区 · 刚刚 · 当前  │
        │ ↑↓ 选择 · Enter 跳转 · Esc 关闭          │
        └────────────────────────────────────────┘
```

- **按最近活动排序**：默认列出当前会话之外的所有历史会话，最近更新的在最上方
- **全文搜索**：输入关键词后合并两种匹配 —— 本地会话标题/工作区名匹配 + Host 侧「对话内容全文检索」（`sessions.search`），内容命中的会话会附带片段摘要（snippet）
- **状态标识**：当前会话（品牌色高亮）、新对话、运行中、等待、已完成等标签；运行中的会话带状态圆点
- **键盘操作**：`↑↓` 选择、`Enter` 跳转、`Esc` 关闭；鼠标点击行直接跳转
- **安全**：纯客户端 UI 插件，不产生网络请求（搜索走 DSH 自带 RPC），无 host 行为

---

## 目录结构

```
dsh-jump-history/
├── package.json        # 包声明：dsh.client 双面包（web 平台）
├── lib/
│   ├── index.js        # Host 半：空挂载（插件功能全部在客户端）
│   └── client.js       # Client 半：ModuleLoader bundle，头部按钮 + 跳转面板
└── README.md           # 本文档
```

---

## 安装

### 1. 放置代码

把本文件夹放到任意位置，例如 `~/code/dsh-jump-history/`。

### 2. 创建符号链接

让 DSH 的 profile 能解析到这个包：

```bash
mkdir -p ~/.dsh/profiles/web/node_modules
ln -sfn /你的路径/dsh-jump-history ~/.dsh/profiles/web/node_modules/dsh-jump-history
ln -sfn /你的路径/dsh-jump-history ~/.dsh/profiles/node_modules/dsh-jump-history
```

### 3. 在 profile patch 层挂载插件行

编辑 `~/.dsh/profiles/web/cordis.patch.yml`，加入：

```yaml
- insert:
    - id: dsh-jump-history
      name: dsh-jump-history
```

### 4. 生效

- **热加载**：`cordis.patch.yml` 被 HMR 监听，通常改完自动生效；若没反应，**追加一行注释**再保存（实测追加比整文件重写更可靠触发 watcher），或直接重启 dsh。
- **重启 dsh** 后也一定生效。
- **刷新浏览器页面**（必须刷新一次，新的客户端 bundle 才会被加载）。

> 注意：**修改 `lib/client.js` / `lib/index.js` 后需要重启 dsh**（bundle 内容在挂载时哈希缓存）。

---

## 使用说明

| 交互 | 行为 |
| --- | --- |
| 点击头部「跳转」按钮 | 打开/关闭跳转面板 |
| 面板内输入关键词 | 250ms 防抖后发起本地+全文合并搜索 |
| 点击会话行 / Enter | 跳转到该会话并关闭面板 |
| ↑ / ↓ | 上下移动选择（wrap 到边界停住） |
| Esc | 关闭面板 |
| 点击面板外 | 关闭面板 |

---

## 可调参数

都在 `lib/client.js` 顶部：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `SEARCH_DEBOUNCE_MS` | `250` | 搜索输入防抖间隔（毫秒） |
| `MAX_ROWS` | `50` | 面板最多展示的会话行数 |

改完重启 dsh 生效。

---

## 工作原理

```
浏览器 ──(1) 加载 /plugins/dsh-jump-history/client.js bundle
        │        在 conversation.session.header.actions 注册「跳转」按钮
        │        在 shell.overlay 注册跳转面板（root 级浮动层）
        │
        └──(2) 打开面板：useSessions / useWorkspaces 标准 hooks 读会话列表
                输入关键词 → ctx.sessions.search() RPC（Host 内容检索）
                点击跳转 → ctx.sessions.open(sessionId) → 切换到该会话
```

- 采用 DSH 官方**双面包持久化插件**机制（`dsh.client` 声明 + `window.__ModuleLoader__` bundle），与产品自带 UI 插件同架构，随 dsh 启动自动挂载，任何会话都生效
- 面板为纯前端浮层：开关状态是模块级 store（`useSyncExternalStore` 订阅），不写任何持久化存储
- 搜索合并策略与官方工作区浏览器一致（本地元数据匹配在前、内容检索命中追加）

---

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 面板弹不出来 / 按钮不显示 | 先确认刷新过页面；再 `curl http://127.0.0.1:3080/ | grep dsh-jump-history` 看 boot 清单 |
| 改了 `cordis.patch.yml` 没生效 | 追加一行注释保存再试；或重启 dsh |
| 改了 `lib/*.js` 没生效 | 必须重启 dsh（bundle 挂载时哈希缓存，热加载不覆盖） |
| 搜索无结果但有会话 | 全文检索只覆盖「可见会话消息内容」（与官方工作区浏览器同一索引）；旧会话在压缩前的内容可先按标题匹配 |
| 面板点击「当前」行 | 无影响：跳转到当前会话等价于关闭面板 |

---

## 卸载

1. 删除 `~/.dsh/profiles/web/cordis.patch.yml` 中的 `dsh-jump-history` 行
2. 删除两个符号链接：
   ```bash
   rm -f ~/.dsh/profiles/web/node_modules/dsh-jump-history \
         ~/.dsh/profiles/node_modules/dsh-jump-history
   ```
3. 重启 dsh；本文件夹可保留作为源码备份
