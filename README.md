# dsh-jump-history

在 DeepSeek Harness Web GUI 中提供**对话内消息跳转**能力的持久化插件：会话头部标题栏右侧新增一个时钟按钮，点击弹出面板，列出**当前对话内用户发送过的所有消息**，点击任意一条即可跳转到该消息在对话中的位置。交互参考 DeepSeek 网页版（chat.deepseek.com）的对话消息导航体验。

```
┌──────────────────────────────────────────────────────────┐
│ 会话标题 …                      [⏱] [任务列表] [预设]    │  ← 头部动作行
└──────────────────────────────────────────────────────────┘

                点击时钟按钮弹出：
        ┌────────────────────────────────────────┐
        │ 🔍 搜索消息内容…                        │
        │ 该对话中的消息              12 条        │
        │ ───────────────────────────────────────│
        │ #1  帮我写一个 Python 爬虫…   14:32      │
        │ #2  加个多线程重试          14:35        │
        │ #3  （空消息）              15:02        │
        │ ↑↓ 选择 · Enter 跳转 · Esc 关闭          │
        └────────────────────────────────────────┘

        点击 #1 后：对话平滑滚动到第一条消息
```

- **列出全部用户消息**：面板打开后自动调用官方 `loadOlder()` 把历史窗口向后补全到最早一条，不受默认「约 50 条」窗口限制
- **点击跳转**：平滑滚动到目标消息（视口上 1/3 处），无其他特效
- **搜索过滤**：顶部搜索框实时过滤（不区分大小写），标题栏显示 `命中数 / 总数`
- **键盘操作**：`↑↓` 选择、`Enter` 跳转、`Esc` 关闭；鼠标点击行直接跳转
- **安全**：纯客户端 UI 插件，全部数据来自 DSH 自带会话快照与公开 RPC，无额外网络请求，无 host 行为

---

## 目录结构

```
dsh-jump-history/
├── package.json        # 包声明：dsh.client 双面包（web 平台）
├── lib/
│   ├── index.js        # Host 半：空挂载（插件功能全部在客户端）
│   └── client.js       # Client 半：ModuleLoader bundle，头部按钮 + 消息跳转面板
└── README.md           # 本文档
```

---

## 安装

### 1. 放置代码

把本文件夹放到任意位置，例如 `~/code/dsh-jump-history/`（或 `git clone` 该仓库）。

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
| 点击头部时钟按钮 | 打开/关闭消息跳转面板 |
| 打开面板 | 自动加载历史窗口外的旧消息（显示「正在加载全部消息…」） |
| 面板内输入关键词 | 实时过滤消息内容（不区分大小写） |
| 点击消息行 / Enter | 平滑滚动到该消息，然后关闭面板 |
| ↑ / ↓ | 上下移动选择（到边界停住） |
| Esc | 关闭面板 |
| 点击面板外 | 关闭面板 |

---

## 可调参数

都在 `lib/client.js` 顶部：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_LOAD_PAGES` | `200` | `loadOlder` 循环安全上限（每页约 50 条消息，200 页 ≈ 10000 条） |
| `SCROLL_BASE_MS` | `350` | 平滑滚动基础时长（毫秒，短距离用） |
| `SCROLL_FACTOR` | `0.45` | 每滚动 1px 追加的毫秒数（距离越远越久） |
| `SCROLL_MAX_MS` | `900` | 平滑滚动时长上限（毫秒） |
| `SCROLL_TARGET_RATIO` | `0.15` | 目标消息停在视口上部的高度比例（0.15 = 视口上 1/3 处） |

改完重启 dsh 生效。

---

## 工作原理

```
浏览器 ──(1) 加载 /plugins/dsh-jump-history/client.js bundle
        │        在 conversation.session.header.actions 注册时钟按钮
        │
        └──(2) 打开面板：
                ① session.loadOlder() 循环补全历史窗口（官方「加载更早」同 API）
                ② useSession(s => s.chat.legacy.nodes) 取全部节点，
                   过滤 kind === "user" 的用户消息
                ③ 点击 → 查 [data-chat-flow-kind="user"] 定位官方消息容器
                  → rAF 逐帧平滑滚动到该消息（视口上 1/3 处）
```

- 采用 DSH 官方**双面包持久化插件**机制（`dsh.client` 声明 + `window.__ModuleLoader__` bundle），与产品自带 UI 插件同架构，随 dsh 启动自动挂载，任何会话都生效
- 面板为纯前端浮层：开关状态是组件内 `useState`，不写任何持久化存储
- 定位依赖官方 `ChatNodeSeat` 写入的 `data-chat-flow-kind` 属性（官方自身定位同款机制），不依赖产品内部 DOM 结构猜测

---

## 已知限制

1. 消息列表顺序 = 会话事件顺序；**子代理（subagent）会话的消息不在当前对话列表中**
2. 面板列出的是**已落地（finalized）**的用户消息；正在发送/输入中的草稿不会出现在列表中
3. 点击「当前可见」之外的旧消息时，窗口补全会把对话滚动位置重置到消息处——跳转后如需回到底部，可手动滚

---

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 按钮不显示 | 先确认刷新过页面；再 `curl http://127.0.0.1:3080/ \| grep dsh-jump-history` 看 boot 清单 |
| 面板一直「正在加载全部消息…」 | 会话非常大的话补全要花时间；可调低 `MAX_LOAD_PAGES` 上限 |
| 改了 `cordis.patch.yml` 没生效 | 追加一行注释保存再试；或重启 dsh |
| 改了 `lib/*.js` 没生效 | 必须重启 dsh（bundle 挂载时哈希缓存，热加载不覆盖） |
| 点击消息后没有滚动 | 检查该消息是否已加载（旧窗口外的消息需等补全完成）；否则看浏览器 Console 报错 |

---

## 卸载

1. 删除 `~/.dsh/profiles/web/cordis.patch.yml` 中的 `dsh-jump-history` 行
2. 删除两个符号链接：
   ```bash
   rm -f ~/.dsh/profiles/web/node_modules/dsh-jump-history \
         ~/.dsh/profiles/node_modules/dsh-jump-history
   ```
3. 重启 dsh；本文件夹可保留作为源码备份
