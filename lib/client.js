window.__ModuleLoader__.load({
  id: "dsh-jump-history",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    // ---- 可调参数 ----
    var FLASH_MS = 1200;          // 跳转后目标消息高亮时长（毫秒）
    var MAX_LOAD_PAGES = 200;     // loadOlder 循环安全上限（每页约 50 条消息）

    var CSS =
      // 面板：fixed 悬浮于视口顶部居中，脱离头部文档流；深底浅字走主题变量，柔和低对比
      ".dshJump_panel{position:fixed;top:76px;left:50%;transform:translateX(-50%);width:min(420px,calc(100vw - 32px));max-height:min(480px,calc(100vh - 128px));display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.28);z-index:100;overflow:hidden}" +
      ".dshJump_searchRow{box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}" +
      ".dshJump_searchIcon{flex:none;color:var(--dsw-alias-label-tertiary);display:inline-flex}" +
      ".dshJump_input{flex:1;min-width:0;box-sizing:border-box;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}" +
      ".dshJump_input::placeholder{color:var(--dsw-alias-label-tertiary)}" +
      ".dshJump_head{box-sizing:border-box;display:flex;align-items:baseline;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}" +
      ".dshJump_headTitle{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;line-height:18px}" +
      ".dshJump_headCount{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}" +
      ".dshJump_list{flex:1;min-height:0;overflow-y:auto;padding:6px}" +
      ".dshJump_row{box-sizing:border-box;display:flex;align-items:flex-start;gap:8px;width:100%;padding:8px 10px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;user-select:none}" +
      ".dshJump_row:hover,.dshJump_row.dshJump_active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}" +
      ".dshJump_idx{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;padding-top:2px;min-width:26px}" +
      ".dshJump_body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" +
      ".dshJump_text{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;line-height:20px}" +
      ".dshJump_time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px}" +
      ".dshJump_empty{box-sizing:border-box;padding:28px 14px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;text-align:center}" +
      ".dshJump_hint{box-sizing:border-box;padding:7px 14px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-align:center}" +
      // 触发按钮：会话头部动作行里的图标按钮
      ".dshJump_trigger{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;box-sizing:border-box;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}" +
      ".dshJump_trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}" +
      // 跳转后目标消息的瞬态高亮（作用在官方节点容器上，动画结束后自动消失）
      ".dshJump_flash{animation:dshJumpFlash " + FLASH_MS + "ms var(--ds-ease-in-out)}@keyframes dshJumpFlash{0%,55%{outline:1px solid var(--dsw-alias-state-success-primary);outline-offset:-2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}}";

    // 用户消息正文摘要：拼接 text 块，图片标注，压缩空白
    function extractText(content) {
      if (!Array.isArray(content)) return "";
      var parts = [];
      for (var i = 0; i < content.length; i++) {
        var block = content[i];
        if (block === null || block === undefined) continue;
        if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
        else if (block.type === "image") parts.push("【图片】");
      }
      return parts.join(" ").replace(/\s+/g, " ").trim();
    }

    // 时间显示：今天 → HH:MM；今年 → M月D日 HH:MM；更早 → YYYY年M月D日
    function formatTime(time) {
      var d = new Date(time);
      var pad = function (n) { return n < 10 ? "0" + n : String(n); };
      var hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
      var now = new Date();
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return hm;
      var md = (d.getMonth() + 1) + "月" + d.getDate() + "日";
      if (d.getFullYear() === now.getFullYear()) return md + " " + hm;
      return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }

    // 从 legacy 消息数组中提取本对话的用户消息行（顺序即消息顺序；origIndex 用于过滤后仍能定位到原始消息）
    function collectUserRows(nodes) {
      if (!Array.isArray(nodes)) return [];
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node === null || node === undefined) continue;
        if (node.kind !== "user") continue;
        out.push({
          origIndex: out.length,
          time: typeof node.time === "number" ? node.time : 0,
          text: extractText(node.content)
        });
      }
      return out;
    }

    // 按官方渲染属性定位并滚动到第 index 条用户消息：
    // ChatNodeSeat 为每个节点容器写入 data-chat-flow-kind（user 节点为 "user"），
    // 查询顺序与 legacy 消息顺序一致（均按事件序）。
    function jumpToUserMessage(index, ctx) {
      var els = document.querySelectorAll("[data-chat-flow-kind=\"user\"]");
      var target = els.length > index ? els[index] : null;
      if (target === null) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("dshJump_flash");
      ctx.timeout(function () {
        target.classList.remove("dshJump_flash");
      }, FLASH_MS);
    }

    // ---- 跳转按钮 + 面板（同一组件内开合管理，与同槽官方 JobListAction 模式一致）----
    function JumpHistoryAction(props) {
      var ctx = props.ctx;
      var useSession = typeof props.useSession === "function" ? props.useSession : null;
      var session = ctx.sessions.binding(props.sessionId)?.session;

      var openPair = React.useState(false);
      var open = openPair[0];
      var setOpen = openPair[1];
      var queryPair = React.useState("");
      var query = queryPair[0];
      var setQuery = queryPair[1];
      var activePair = React.useState(0);
      var active = activePair[0];
      var setActive = activePair[1];
      var loadingPair = React.useState(false);
      var loading = loadingPair[0];
      var setLoading = loadingPair[1];
      var panelRef = React.useRef(null);
      var inputRef = React.useRef(null);

      // 本对话用户消息（legacy 数组，快照更新自动刷新）
      var allRows = useSession !== null
        ? collectUserRows(useSession(function (s) { return s.chat.legacy.nodes; }))
        : [];

      // 搜索过滤：不区分大小写
      var q = (query || "").trim().toLowerCase();
      var rows = q === ""
        ? allRows
        : allRows.filter(function (row) { return row.text.toLowerCase().indexOf(q) !== -1; });

      // 打开面板时：把历史窗口向后扩展到包含全部消息（官方 loadOlder 公开 API）
      React.useEffect(function () {
        if (!open || session === undefined) return;
        var cancelled = false;
        var run = async function () {
          setLoading(true);
          try {
            var pages = 0;
            while (!cancelled && pages < MAX_LOAD_PAGES) {
              var snap = session.getSnapshot();
              if (snap === undefined || snap.hasMore !== true) break;
              if (snap.loadingOlder === true) {
                await new Promise(function (resolve) { window.setTimeout(resolve, 120); });
                continue;
              }
              await session.loadOlder();
              pages++;
            }
          } finally {
            if (!cancelled) setLoading(false);
          }
        };
        run();
        return function () {
          cancelled = true;
        };
      }, [open, session]);

      // 打开时清空搜索、聚焦搜索框、重置选中
      React.useEffect(function () {
        if (!open) return;
        setQuery("");
        setActive(0);
        if (inputRef.current !== null) {
          try { inputRef.current.focus(); } catch (e) { /* 焦点失败不致命 */ }
        }
      }, [open]);

      // Esc 关闭
      React.useEffect(function () {
        if (!open) return;
        var onKeyDown = function (e) {
          if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return function () { document.removeEventListener("keydown", onKeyDown); };
      }, [open]);

      // 点击面板外关闭（触发按钮自身除外）
      React.useEffect(function () {
        if (!open) return;
        var onPointerDown = function (e) {
          var t = e.target;
          if (t !== null && typeof t.closest === "function" && t.closest(".dshJump_trigger, .dshJump_panel") !== null) return;
          setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return function () { document.removeEventListener("pointerdown", onPointerDown); };
      }, [open]);

      // 过滤后列表变短时收敛选中索引，避免高亮悬空
      React.useEffect(function () {
        if (!open) return;
        if (active >= rows.length && rows.length > 0) setActive(rows.length - 1);
        else if (active > 0 && rows.length === 0) setActive(0);
      }, [open, rows.length, active]);

      function go(row) {
        jumpToUserMessage(row.origIndex, ctx);
        setOpen(false);
      }

      function onKeyDown(e) {
        if (rows.length === 0) return;
        var next = active;
        if (e.key === "ArrowDown") {
          next = active + 1 >= rows.length ? rows.length - 1 : active + 1;
          e.preventDefault();
        } else if (e.key === "ArrowUp") {
          next = active <= 0 ? 0 : active - 1;
          e.preventDefault();
        } else if (e.key === "Enter") {
          go(rows[active]);
          e.preventDefault();
          return;
        } else {
          return;
        }
        setActive(next);
      }

      var trigger = React.createElement("button", {
        type: "button",
        className: "dshJump_trigger",
        title: open ? "关闭消息跳转" : "跳到本条对话中的消息",
        "aria-label": "跳到本对话中的消息",
        "aria-expanded": open,
        onClick: function () { setOpen(!open); }
      },
        React.createElement("svg", { viewBox: "0 0 16 16", width: "15", height: "15", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
          React.createElement("path", { d: "M8 4.5v3.8l2.4 1.6" }),
          React.createElement("circle", { cx: "8", cy: "8", r: "6.2" })
        ));

      if (!open) return trigger;

      var children = [];
      children.push(React.createElement("div", { className: "dshJump_searchRow", key: "search" },
        React.createElement("span", { className: "dshJump_searchIcon", "aria-hidden": true },
          React.createElement("svg", { viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", "aria-hidden": true },
            React.createElement("circle", { cx: "7", cy: "7", r: "4.4" }),
            React.createElement("path", { d: "M13.8 13.8L10.3 10.3" })
          )),
        React.createElement("input", {
          ref: inputRef,
          className: "dshJump_input",
          type: "text",
          placeholder: "搜索消息内容…",
          value: query,
          onChange: function (e) { setQuery(e.target.value); setActive(0); },
          onKeyDown: onKeyDown,
          "aria-label": "搜索消息"
        })
      ));
      children.push(React.createElement("div", { className: "dshJump_head", key: "head" },
        React.createElement("span", { className: "dshJump_headTitle" }, "该对话中的消息"),
        React.createElement("span", { className: "dshJump_headCount" }, rows.length + (q === "" ? "" : " / " + allRows.length) + " 条")
      ));

      var listChildren = [];
      if (loading) {
        listChildren.push(React.createElement("div", { className: "dshJump_empty", key: "loading" }, "正在加载全部消息…"));
      } else if (rows.length === 0) {
        listChildren.push(React.createElement("div", { className: "dshJump_empty", key: "empty" }, q === "" ? "本对话还没有用户消息" : "没有匹配的消息"));
      } else {
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          (function (row, index) {
            var rowClass = "dshJump_row" + (index === active ? " dshJump_active" : "");
            listChildren.push(React.createElement("button", {
              key: row.time + "_" + index,
              type: "button",
              className: rowClass,
              onClick: function () { go(row); },
              onMouseEnter: function () { setActive(index); }
            },
              React.createElement("span", { className: "dshJump_idx" }, "#" + (index + 1)),
              React.createElement("span", { className: "dshJump_body" },
                React.createElement("span", { className: "dshJump_text" }, row.text === "" ? "（空消息）" : row.text)
              ),
              React.createElement("span", { className: "dshJump_time" }, formatTime(row.time))
            ));
          })(row, i);
        }
      }
      children.push(React.createElement("div", { className: "dshJump_list", role: "listbox", "aria-label": "本对话消息列表" }, listChildren));
      children.push(React.createElement("div", { className: "dshJump_hint", key: "hint" }, "↑↓ 选择 · Enter 跳转 · Esc 关闭"));

      return React.createElement(React.Fragment, null,
        trigger,
        React.createElement("div", {
          className: "dshJump_panel",
          ref: panelRef,
          role: "dialog",
          "aria-label": "本对话消息跳转",
          tabIndex: -1,
          onKeyDown: onKeyDown
        }, children)
      );
    }

    var inject = ["slots", "sessions", "timer"];

    function apply(ctx) {
      var slots = ctx.slots;
      if (slots === undefined) return;
      var style = document.createElement("style");
      style.textContent = CSS;
      document.head.appendChild(style);
      ctx.effect(function () { return function () { style.remove(); }; }, "dsh-jump-history: styles");

      ctx.effect(function () {
        return slots.inject("conversation.session.header.actions", function () {
          return slots.register(
            { name: "conversation.session.header.actions", id: "dsh-jump-history", order: 10, label: "对话跳转" },
            function (props) {
              return React.createElement(JumpHistoryAction, {
                ctx: ctx,
                useSession: props !== undefined && props !== null ? props.useSession : undefined,
                sessionId: props !== undefined && props !== null ? props.sessionId : undefined
              });
            }
          );
        });
      }, "dsh-jump-history: header action");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
