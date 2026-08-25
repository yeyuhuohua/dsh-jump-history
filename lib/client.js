window.__ModuleLoader__.load({
  id: "dsh-jump-history",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    // ---- 可调参数 ----
    var MAX_LOAD_PAGES = 200;     // loadOlder 循环安全上限（每页约 50 条消息）
    var SCROLL_BASE_MS = 350;     // 平滑滚动基础时长（毫秒，短距离用）
    var SCROLL_FACTOR = 0.45;     // 每滚动 1px 追加的毫秒数（距离越远越久）
    var SCROLL_MAX_MS = 900;      // 平滑滚动时长上限（毫秒）
    var SCROLL_TARGET_RATIO = 0.15; // 目标消息停在视口上 1/3（此处为 15% 高度）处
    var scrollAnimStop = null;    // 当前平滑滚动动画句柄（新跳转先取消旧动画）

    var CSS =
      // 面板：fixed 悬浮于视口顶部居中，脱离头部文档流。
      // 底色用官方菜单专用 --dsw-specific-menu（#353638，与产品下拉卡同款，而非通用的 layer/overlay）
      ".dshJump_panel{position:fixed;top:76px;left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 32px));max-height:min(520px,calc(100vh - 128px));display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);border-radius:14px;box-shadow:var(--dsw-shadow-lv3);z-index:100;overflow:hidden}" +
      // 搜索：圆角输入框（更深的内嵌底 + 细边框）
      ".dshJump_searchRow{box-sizing:border-box;padding:10px 12px 6px}" +
      ".dshJump_searchBox{box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:7px 11px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px}" +
      ".dshJump_searchBox:focus-within{border-color:var(--dsw-alias-brand-primary)}" +
      ".dshJump_searchIcon{flex:none;color:var(--dsw-alias-label-tertiary);display:inline-flex}" +
      ".dshJump_input{flex:1;min-width:0;box-sizing:border-box;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}" +
      ".dshJump_input::placeholder{color:var(--dsw-alias-label-tertiary)}" +
      ".dshJump_head{box-sizing:border-box;display:flex;align-items:baseline;gap:8px;padding:6px 16px 8px}" +
      ".dshJump_headTitle{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}" +
      ".dshJump_headCount{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}" +
      ".dshJump_list{flex:1;min-height:0;overflow-y:auto;padding:2px 8px 8px}" +
      ".dshJump_row{box-sizing:border-box;position:relative;display:flex;align-items:flex-start;gap:8px;width:100%;padding:8px 10px;border:none;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;user-select:none}" +
      ".dshJump_row:hover,.dshJump_row.dshJump_active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}" +
      ".dshJump_row.dshJump_now{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".dshJump_row.dshJump_now:before{content:\"\";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:999px;background:var(--dsw-alias-brand-primary)}" +
      ".dshJump_row.dshJump_now .dshJump_text{color:var(--dsw-alias-label-primary);font-weight:600}" +
      ".dshJump_idx{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;min-width:28px}" +
      ".dshJump_body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" +
      ".dshJump_text{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;line-height:20px}" +
      ".dshJump_time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px}" +
      ".dshJump_empty{box-sizing:border-box;padding:28px 14px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;text-align:center}" +
      ".dshJump_hint{box-sizing:border-box;padding:7px 14px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-align:center}" +
      // 触发按钮：会话头部动作行里的图标按钮
      ".dshJump_trigger{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;box-sizing:border-box;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}" +
      ".dshJump_trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}";

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

    // 清除进行中的平滑滚动动画
    function cancelScrollAnim() {
      if (scrollAnimStop !== null) {
        var stop = scrollAnimStop;
        scrollAnimStop = null;
        stop();
      }
    }

    // requestAnimationFrame 以渲染帧驱动（official bundles 同款通道），
    // easeInOutCubic 插值——起步缓、中途快、落点缓，肉眼连续无跳变。
    var raf = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : function (fn) { return window.setTimeout(function () { fn(Date.now()); }, 16); };
    var caf = typeof globalThis.cancelAnimationFrame === "function"
      ? globalThis.cancelAnimationFrame.bind(globalThis)
      : function (id) { window.clearTimeout(id); };

    // 平滑滚动动画：把 scroller.scrollTop 从当前值动画到目标值。
    // 不用 scrollIntoView({behavior:"smooth"})：它对"已在视口内"的消息位移为零，
    // 且会被官方 follow-scroll 吸底竞争；逐帧设置 scrollTop 保证确定性位移 + 平滑。
    function animateScrollTo(scroller, goalTop, ctx) {
      cancelScrollAnim();
      var maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      var clamped = Math.min(goalTop, maxTop);
      var startTop = scroller.scrollTop;
      var delta = clamped - startTop;
      if (delta === 0) return;
      var t0 = Date.now();
      var rafId = null;
      // 距离自适应时长：近距快但不突兀，远距舒缓；总时长封顶。
      var duration = Math.min(SCROLL_MAX_MS, SCROLL_BASE_MS + Math.abs(delta) * SCROLL_FACTOR);
      // 注意：rAF 回调的第一个参数是 performance.now() 基准，与 Date.now()
      // （Unix epoch 毫秒）相差百亿级，直接混用会让 t 变成巨大负数、scrollTop
      // 被 clamp 到 0（表现=不跳转）。这里统一用 Date.now() 计算进度。
      var tick = function () {
        var t = Math.min(1, (Date.now() - t0) / duration);
        var inv = 1 - t;
        var ease = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
        scroller.scrollTop = startTop + delta * ease;
        if (t < 1) rafId = raf(tick);
        else { scrollAnimStop = null; }
      };
      scrollAnimStop = function () {
        if (rafId !== null) caf(rafId);
        rafId = null;
      };
      rafId = raf(tick);
    }

    // 找出当前视口中心最接近的用户消息（原始序号），用于打开面板时高亮"此刻"所在。
    // 官方滚动容器属性 [data-conversation-scroll]，消息行带 data-chat-flow-kind="user"。
    function currentUserIndex() {
      var els = document.querySelectorAll("[data-chat-flow-kind=\"user\"]");
      if (els.length === 0) return null;
      var scroller = document.querySelector("[data-conversation-scroll]");
      if (scroller === null) return null;
      var srect = scroller.getBoundingClientRect();
      var center = srect.top + srect.height / 2;
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        var rowCenter = r.top + r.height / 2;
        var dist = Math.abs(rowCenter - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    }

    // 按官方渲染属性定位并滚动到第 index 条用户消息：
    // ChatNodeSeat 为每个节点容器写入 data-chat-flow-kind（user 节点为 "user"），
    // 查询顺序与 legacy 消息顺序一致（均按事件序）。
    // 定位采用官方 scrollerOf/flowTop 同款：目标行落在滚动视口上部，位移确定可见。
    function jumpToUserMessage(index, ctx) {
      var target = null;
      var els = document.querySelectorAll("[data-chat-flow-kind=\"user\"]");
      if (els.length <= index) return;
      target = els[index];
      var scroller = target.closest("[data-conversation-scroll]");
      if (scroller === null || typeof scroller.scrollTop !== "number") {
        cancelScrollAnim();
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        var rect = target.getBoundingClientRect();
        var srect = scroller.getBoundingClientRect();
        var top = scroller.scrollTop + (rect.top - srect.top);
        var goalTop = top - Math.round(srect.height * SCROLL_TARGET_RATIO);
        animateScrollTo(scroller, goalTop, ctx);
      }
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
      var currentPair = React.useState(null); // 当前视口对应的消息原始序号（"此刻"）
      var current = currentPair[0];
      var setCurrent = currentPair[1];
      var panelRef = React.useRef(null);
      var inputRef = React.useRef(null);
      var listRef = React.useRef(null);

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

      // 打开时清空搜索、聚焦搜索框、重置选中、定位"此刻"消息
      React.useEffect(function () {
        if (!open) return;
        setQuery("");
        setActive(0);
        setCurrent(null);
        if (inputRef.current !== null) {
          try { inputRef.current.focus(); } catch (e) { /* 焦点失败不致命 */ }
        }
      }, [open]);

      // 历史窗口补全完成后，把当前视口中心对应的消息设为"此刻"并默认选中
      React.useEffect(function () {
        if (!open || loading) return;
        var idx = currentUserIndex();
        if (idx === null) return;
        setCurrent(idx);
        var ri = -1;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].origIndex === idx) { ri = i; break; }
        }
        if (ri !== -1) setActive(ri);
      }, [open, loading, allRows.length]);

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

      // 选中行变化时，把列表滚动到该行可见位置（面板内小视口）
      React.useEffect(function () {
        if (!open || rows.length === 0) return;
        var item = null;
        if (listRef.current !== null) {
          var items = listRef.current.querySelectorAll(".dshJump_row");
          if (items.length > active) item = items[active];
        }
        if (item !== null) {
          try { item.scrollIntoView({ block: "nearest" }); } catch (e) { /* 忽略 */ }
        }
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
        React.createElement("div", { className: "dshJump_searchBox" },
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
        )
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
            var isNow = row.origIndex === current;
            var rowClass = "dshJump_row" + (index === active ? " dshJump_active" : "") + (isNow ? " dshJump_now" : "");
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
      children.push(React.createElement("div", { className: "dshJump_list", ref: listRef, role: "listbox", "aria-label": "本对话消息列表" }, listChildren));
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
