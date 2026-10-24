(function () {
  'use strict';
  if (window.__commentCrawlBridge) return;
  window.__commentCrawlBridge = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const text = element => String(element && (element.innerText || element.textContent) || '')
    .replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

  function visible(element) {
    if (!element || !element.isConnected) return false;
    try {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    } catch (_) { return true; }
  }
  function safeFacebookUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'https:' && !url.port &&
        ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname.toLowerCase()) &&
        !url.username && !url.password;
    } catch (_) { return false; }
  }
  function isPostUrl(value) {
    if (!safeFacebookUrl(value)) return false;
    try {
      const url = new URL(value, window.location.href);
      return /\/(posts|permalink|videos?|reel|photos?|watch)(\/|$)/i.test(url.pathname) ||
        url.searchParams.has('story_fbid') || url.searchParams.has('comment_id') || url.searchParams.has('reply_comment_id');
    } catch (_) { return false; }
  }
  function canonicalPostUrl(value) {
    const url = new URL(value, window.location.href);
    url.hash = '';
    ['__cft__', '__tn__', 'mibextid', 'ref', 'refid', 'paipv', 'rdid', 'locale', 'acontext', 'comment_id', 'reply_comment_id'].forEach(key => url.searchParams.delete(key));
    return url.href.slice(0, 2048);
  }
  function hash(value) {
    let result = 2166136261;
    const source = String(value || '');
    for (let i = 0; i < source.length; i += 1) {
      result ^= source.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  }
  function belongsToRoot(element, root) {
    if (!element.closest) return true;
    const article = element.closest('[role="article"]');
    return !article || article === root;
  }
  function profile(root) {
    const anchors = Array.from(root.querySelectorAll('a[href]')).filter(anchor => belongsToRoot(anchor, root));
    for (const anchor of anchors) {
      const href = new URL(anchor.getAttribute('href'), window.location.href).href;
      const name = text(anchor);
      if (!name || name.length > 200 || !safeFacebookUrl(href)) continue;
      const url = new URL(href);
      const path = url.pathname.toLowerCase();
      const looksLikeProfile = (path === '/profile.php' && !!url.searchParams.get('id')) ||
        /^\/people\/[^/]+\/[^/]+/i.test(path) ||
        /^\/pages\/[^/]+\/[^/]+/i.test(path) ||
        (/^\/[^/]+\/?$/i.test(path) && !/^(groups|posts|photos?|videos?|watch|reel|events|marketplace|stories|search|messages|notifications|friends|settings)$/i.test(path.slice(1)));
      if (!looksLikeProfile) continue;
      const peopleMatch = path.match(/^\/people\/[^/]+\/([^/]+)/i);
      const pageMatch = path.match(/^\/pages\/[^/]+\/([^/]+)/i);
      const usernameMatch = path.match(/^\/([^/]+)\/?$/i);
      const derivedId = url.searchParams.get('id') || (peopleMatch && peopleMatch[1]) ||
        (pageMatch && pageMatch[1]) || (usernameMatch && ('username:' + usernameMatch[1].toLowerCase())) || '';
      return {
        name,
        url: href.slice(0, 2048),
        id: derivedId.slice(0, 200)
      };
    }
    return { name: '', url: '', id: '' };
  }
  function ownTextBlocks(root) {
    const nodes = Array.from(root.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .filter(element => visible(element) && belongsToRoot(element, root));
    const authorName = normalize(profile(root).name);
    let values = nodes.map(text).filter(value => value && value.length <= 4000 &&
      !/^(like|reply|share|send|follow|see translation|hide|report|thích|trả lời|chia sẻ|gửi|theo dõi|xem bản dịch|ẩn|báo cáo|most relevant|all comments|viết bình luận|write a comment|edited)$/i.test(value));
    values = Array.from(new Set(values)).filter(value => normalize(value) !== authorName);
    values = values.filter(value => !values.some(other => other !== value && other.length > value.length && other.includes(value)));
    return values.slice(0, 5);
  }
  function directTimestamp(root) {
    const element = Array.from(root.querySelectorAll('time[datetime], abbr[title], [data-utime]'))
      .find(node => belongsToRoot(node, root));
    if (!element) return { iso: '', label: '' };
    const raw = element.getAttribute('datetime') || element.getAttribute('title') ||
      element.getAttribute('data-utime') || text(element);
    let millis = Date.parse(raw);
    if (/^\d{9,13}$/.test(raw)) millis = Number(raw) * (raw.length === 10 ? 1000 : 1);
    return { iso: Number.isFinite(millis) ? new Date(millis).toISOString() : '', label: raw.slice(0, 200) };
  }
  function directPermalink(root) {
    const anchors = Array.from(root.querySelectorAll('a[href]')).filter(anchor => belongsToRoot(anchor, root));
    const urls = anchors.map(anchor => new URL(anchor.getAttribute('href'), window.location.href).href).filter(safeFacebookUrl);
    return (urls.find(url => /[?&](comment_id|reply_comment_id)=/i.test(url)) ||
      urls.find(url => /\/(posts|permalink|story\.php|photo|videos?|reel)\//i.test(new URL(url).pathname)) || '').slice(0, 2048);
  }
  function extractCommentId(permalink, root, author, timeLabel, content) {
    try {
      const url = new URL(permalink);
      const id = url.searchParams.get('reply_comment_id') || url.searchParams.get('comment_id');
      if (id) return 'comment_' + id.slice(0, 100);
    } catch (_) {}
    const domId = String(root.id || '').match(/(?:comment|reply)[_-]?(\d{3,})/i);
    if (domId) return 'comment_' + domId[1];
    return 'hash_' + hash(author.url + '|' + timeLabel + '|' + content);
  }
  function isLikelyCommentRoot(root, main, author, permalink, content) {
    if (!author.name || !content || root === main) return false;
    const ownButtons = Array.from(root.querySelectorAll('button,[role="button"],a[role="button"]'))
      .filter(element => belongsToRoot(element, root)).map(text).join(' ');
    const hasReplyControl = /(^|\s)(reply|trả lời)(\s|$)/i.test(ownButtons);
    const hasCommentId = /[?&](comment_id|reply_comment_id)=/i.test(permalink);
    const nestedArticles = Array.from(root.querySelectorAll('[role="article"]')).filter(visible).length;
    const hasComposer = !!root.querySelector('[contenteditable="true"],[role="textbox"],textarea');
    if (hasComposer && nestedArticles > 0) return false;
    if (nestedArticles > 0 && !hasReplyControl && !hasCommentId) return false;
    const label = ((root.getAttribute && root.getAttribute('aria-label')) || '') + ' ' + ((root.getAttribute && root.getAttribute('data-testid')) || '');
    if (/feed post|post by|bài viết của/i.test(label) && !hasReplyControl && !hasCommentId) return false;
    if (content.length > 800 && !hasReplyControl && !hasCommentId) return false;
    return true;
  }
  function extractComments(scope, postUrl) {
    const roots = Array.from(scope.querySelectorAll('[role="article"]')).filter(visible);
    const output = [];
    const seen = new Set();
    const rootToSource = new WeakMap();

    for (const root of roots) {
      const author = profile(root);
      const content = ownTextBlocks(root).join('\n').trim().slice(0, 4000);
      const permalink = directPermalink(root);
      if (!isLikelyCommentRoot(root, scope, author, permalink, content)) continue;

      const timestamp = directTimestamp(root);
      const sourceIdentity = extractCommentId(permalink, root, author, timestamp.label, content);
      const sourceKey = hash(postUrl) + ':' + sourceIdentity;
      if (seen.has(sourceKey)) continue;
      seen.add(sourceKey);

      let parent = root.parentElement;
      let parentCommentId = '';
      let depth = 0;
      while (parent && parent !== scope) {
        if (parent.getAttribute && parent.getAttribute('role') === 'article' && rootToSource.has(parent)) {
          depth += 1;
          if (!parentCommentId) parentCommentId = rootToSource.get(parent);
        }
        parent = parent.parentElement;
      }
      rootToSource.set(root, sourceKey);

      const buttons = Array.from(root.querySelectorAll('button,[role="button"]')).filter(element => belongsToRoot(element, root)).map(text).join(' ');
      const replyMatch = buttons.match(/(\d+)\s*(repl(?:y|ies)|câu trả lời|phản hồi)/i);
      output.push({
        id: sourceKey.slice(0, 200), sourceKey: sourceKey.slice(0, 250), postUrl,
        postTitle: String(document.title || '').slice(0, 300),
        authorName: author.name.slice(0, 200), authorProfileUrl: author.url,
        authorProfileId: author.id, text: content, parentCommentId,
        depth: Math.max(0, Math.min(20, depth)), commentedAt: timestamp.iso,
        commentedAtLabel: timestamp.label, collectedAt: new Date().toISOString(),
        permalink, replyCount: replyMatch ? Math.min(10000, Number(replyMatch[1])) : 0
      });
    }
    return output;
  }
  function samePostLink(candidate, target) {
    if (!safeFacebookUrl(candidate)) return false;
    try {
      const left = new URL(candidate), right = new URL(target);
      if (left.searchParams.has('comment_id') || left.searchParams.has('reply_comment_id')) return false;
      const leftStory = left.searchParams.get('story_fbid') || left.searchParams.get('fbid');
      const rightStory = right.searchParams.get('story_fbid') || right.searchParams.get('fbid');
      if (leftStory || rightStory) return !!leftStory && leftStory === rightStory &&
        (!left.searchParams.get('id') || !right.searchParams.get('id') || left.searchParams.get('id') === right.searchParams.get('id'));
      return left.pathname.replace(/\/+$/, '').toLowerCase() === right.pathname.replace(/\/+$/, '').toLowerCase();
    } catch (_) { return false; }
  }
  function findPostRoot(main, postUrl) {
    const articles = Array.from(main.querySelectorAll('[role="article"]')).filter(visible);
    const matches = articles.filter(root => Array.from(root.querySelectorAll('a[href]'))
      .filter(anchor => belongsToRoot(anchor, root))
      .some(anchor => samePostLink(new URL(anchor.getAttribute('href'), window.location.href).href, postUrl)));
    matches.sort((a, b) => b.querySelectorAll('[role="article"]').length - a.querySelectorAll('[role="article"]').length);
    return matches[0] || null;
  }
  function expandButtons(scope, limit, clicked) {
    let count = 0;
    const buttons = Array.from(scope.querySelectorAll('button,[role="button"]')).filter(visible);
    for (const button of buttons) {
      if (count >= limit || clicked.has(button)) continue;
      const label = (text(button) + ' ' + (button.getAttribute('aria-label') || '') + ' ' + (button.getAttribute('title') || '')).trim();
      if (!/(more comments|previous comments|more repl(?:y|ies)|all repl(?:y|ies)|xem thêm bình luận|xem bình luận trước|xem thêm câu trả lời|xem tất cả câu trả lời|tải thêm bình luận|hiển thị thêm bình luận|xem thêm phản hồi)/i.test(label)) continue;
      clicked.add(button);
      try { button.click(); count += 1; } catch (_) {}
    }
    return count;
  }
  async function collect(message) {
    if (!isPostUrl(window.location.href)) return { ok: false, error: 'Hãy mở bài viết Facebook ở trang riêng/permalink trước.' };
    const postUrl = canonicalPostUrl(window.location.href);
    const main = document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
    if (!main) return { ok: false, error: 'Không tìm thấy vùng nội dung bài viết.' };
    const scope = findPostRoot(main, postUrl);
    if (!scope) return { ok: false, error: 'Không xác định được vùng của đúng bài viết. Hãy mở permalink đầy đủ của bài viết rồi thử lại để tránh thu thập nhầm bài khác.' };
    const originalY = Number(window.scrollY || 0);
    const maxRounds = Math.min(80, Math.max(1, Number(message && message.maxRounds) || 60));
    const maxClicks = Math.min(250, Math.max(1, Number(message && message.maxClicks) || 180));
    const clicked = new WeakSet();
    let expanded = 0, idleRounds = 0, rounds = 0;
    for (; rounds < maxRounds; rounds += 1) {
      const before = scope.querySelectorAll('[role="article"]').length;
      const clickedNow = expandButtons(scope, maxClicks - expanded, clicked);
      expanded += clickedNow;
      try { window.scrollTo(0, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); } catch (_) {}
      await sleep(300);
      const after = scope.querySelectorAll('[role="article"]').length;
      if (after > before || clickedNow > 0) idleRounds = 0;
      else idleRounds += 1;
      if (idleRounds >= 4 || expanded >= maxClicks) break;
    }
    const comments = extractComments(scope, postUrl);
    try { window.scrollTo(0, originalY); } catch (_) {}
    if (!comments.length) return { ok: false, error: 'Chưa nhận diện được bình luận. Chọn “Tất cả bình luận”, mở rộng câu trả lời rồi thử lại. Facebook có thể đã thay đổi giao diện.' };
    return {
      ok: true, postUrl, comments, expanded, rounds: rounds + 1,
      note: 'Chỉ thu thập nội dung Facebook đang hiển thị cho tài khoản này. Bình luận ẩn, đã xóa hoặc ngoài quyền xem sẽ không được truy cập.'
    };
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'COMMENT_CRAWL_COLLECT') return false;
    collect(message).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error && error.message || error).slice(0, 1000) }));
    return true;
  });
})();