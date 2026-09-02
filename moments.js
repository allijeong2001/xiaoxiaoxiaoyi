/* =====================================================
 * 朋友圈（Moments）共享功能
 * 1. 字卡本地存储（增 / 删 / 渲染）
 * 2. 朋友圈随机弹窗（每日至少 1~3 次，显示虚拟世界时间与恋人在做什么）
 * ===================================================== */
(function () {
  'use strict';

  function cfg() {
    return (window.SITE_CONFIG && SITE_CONFIG.moments) || {};
  }

  /* ---------- 工具 ---------- */
  /* 虚拟恋人世界时间 = 现实时间 + 偏移小时 */
  function virtualTime() {
    var off = Number(cfg().worldTimeOffsetHours) || 5;
    var now = new Date(Date.now() + off * 3600000);
    var hh = now.getHours();
    var mm = now.getMinutes();
    var h = hh % 12 || 12;
    var ap = hh < 6 ? '凌晨' : hh < 12 ? '上午' : hh < 18 ? '下午' : '晚上';
    return ap + ' ' + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /* 现实时间（24 小时制） */
  function realTime() {
    var now = new Date();
    var hh = now.getHours(), mm = now.getMinutes();
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /* 系统只做随机展示：从用户的心情/状态字卡中随机抽一条 */
  function randomUserCard() {
    var mood = [], status = [];
    if (window.WordCardStore) {
      mood = window.WordCardStore.get('lover_mood_cards') || [];
      status = window.WordCardStore.get('lover_status_cards') || [];
    }
    var all = [];
    mood.forEach(function (c) { all.push({ text: c.text, type: 'mood' }); });
    status.forEach(function (c) { all.push({ text: c.text, type: 'status' }); });
    if (!all.length) return null;
    return all[Math.floor(Math.random() * all.length)];
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 弹窗 ---------- */
  function showPopup() {
    var c = cfg();
    var world = c.worldName || '萧逸的世界';
    var title = c.popupTitle || '📸 萧逸的朋友圈';

    var pick = randomUserCard();
    var content, tag;
    if (pick) {
      content = pick.text;
      tag = '<span class="popup-tag ' + (pick.type === 'mood' ? 'popup-tag-mood' : 'popup-tag-status') + '">' +
            (pick.type === 'mood' ? '心情' : '状态') + '</span>';
    } else {
      content = c.emptyCardsText || '还没有设置心情或状态字卡，去写一张吧～';
      tag = '';
    }

    var overlay = document.createElement('div');
    overlay.className = 'moments-popup';
    var card = document.createElement('div');
    card.className = 'moments-popup-card';
    card.innerHTML =
      '<div class="popup-title">' + title + '</div>' +
      '<div class="popup-world">' + world + ' · <b>' + virtualTime() + '</b></div>' +
      '<div class="popup-text">' + tag + escapeHtml(content) + '</div>' +
      '<div class="popup-time">⏰ ' + world + '时间 ' + virtualTime() + ' · 现实 ' + realTime() + '</div>' +
      '<button class="popup-close">知道了</button>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function () { overlay.classList.add('show'); });

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.classList.remove('show');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 320);
      scheduleNext(false); // 关闭后随机安排下一次
    }
    overlay.querySelector('.popup-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var auto = Number(c.popupAutoCloseMs) || 12000;
    setTimeout(close, auto);
  }

  /* ---------- 随机弹窗调度 ----------
   * 不是每次刷新必弹，而是按概率随机出现：
   * - 首次：页面加载后随机延迟 6~26 秒，按 popupChance（10%）概率弹出
   * - 之后：每次关闭后每隔 5 小时，才按概率再尝试一次
   */
  var popupTimer = null;
  function scheduleNext(first) {
    if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
    var chance = Number(cfg().popupChance);
    if (!(chance > 0)) chance = 0.1;
    var delay = first
      ? (6 + Math.random() * 20) * 1000        // 首次 6~26 秒
      : 5 * 3600 * 1000;                       // 之后每隔 5 小时
    popupTimer = setTimeout(function () {
      if (Math.random() < chance) showPopup();
    }, delay);
  }

  /* ---------- 字卡本地存储 ---------- */
  var WordCardStore = {
    get: function (key) {
      try {
        var v = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(v) ? v : [];
      } catch (e) { return []; }
    },
    add: function (key, text) {
      text = String(text == null ? '' : text).trim();
      if (!text) return null;
      var list = this.get(key);
      var card = { id: Date.now() + '' + Math.floor(Math.random() * 1000), text: text };
      list.push(card);
      try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
      return card;
    },
    remove: function (key, id) {
      var list = this.get(key).filter(function (c) { return String(c.id) !== String(id); });
      try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
      return list;
    },
    /* 渲染字卡网格；empty 为空提示文字 */
    render: function (container, key, emptyText) {
      var list = this.get(key);
      container.innerHTML = '';
      if (!list.length) {
        var empty = document.createElement('div');
        empty.className = 'card-empty';
        empty.textContent = emptyText || '还没有字卡，写一张吧～';
        container.appendChild(empty);
        return;
      }
      list.forEach(function (card) {
        var el = document.createElement('div');
        el.className = 'word-card';
        el.textContent = card.text;
        var del = document.createElement('button');
        del.className = 'card-del';
        del.setAttribute('aria-label', '删除字卡');
        del.textContent = '✕';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          WordCardStore.remove(key, card.id);
          WordCardStore.render(container, key, emptyText);
        });
        el.appendChild(del);
        container.appendChild(el);
      });
    }
  };

  /* ---------- 挂载全局 ---------- */
  window.LoverMoments = {
    showPopup: showPopup,
    scheduleNext: scheduleNext,
    virtualTime: virtualTime,
    randomUserCard: randomUserCard
  };
  window.WordCardStore = WordCardStore;

  /* 页面加载后自动安排首次随机弹窗（所有页面通用） */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scheduleNext(true); });
  } else {
    scheduleNext(true);
  }
})();
