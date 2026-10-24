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
      return /\/(posts|permalink|videos?|reel|photos?|watch|share\/(?:p|v|r)\/[^/]+)(\/|$)/i.test(url.pathname) ||
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
    if (matches.length) return matches[0];
    let target;
    try { target = new URL(postUrl); } catch (_) { return null; }
    const shareRoute = /\/share\/(?:p|v|r)\/[^/]+/i.test(target.pathname);
    if (shareRoute) {
      const candidates = articles.filter(root => {
        const label = ((root.getAttribute && root.getAttribute('aria-label')) || '') + ' ' + ((root.getAttribute && root.getAttribute('data-testid')) || '');
        return /feed post|post by|bài viết của|post-container|fbfeed_story/i.test(label) &&
          Array.from(root.querySelectorAll('a[href]')).some(anchor => belongsToRoot(anchor, root) &&
            /\/(posts|permalink|story\.php|videos?|reel|photos?)(\/|$)/i.test(new URL(anchor.getAttribute('href'), window.location.href).pathname));
      });
      if (candidates.length === 1) return candidates[0];
    }
    return null;
  }
  async function waitForPostRoot(main, postUrl, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const root = findPostRoot(main, postUrl);
      if (root) return root;
      await sleep(400);
    }
    return findPostRoot(main, postUrl);
  }
  function expandButtons(scope, limit, clicked) {
    let count = 0;
    const buttons = Array.from(scope.querySelectorAll('button,[role="button"]')).filter(visible);
    for (const button of buttons) {
      if (count >= limit || clicked.has(button)) continue;
      const label = (text(button) + ' ' + (button.getAttribute('aria-label') || '') + ' ' + (button.getAttribute('title') || '')).trim();
      if (!/(more comments|previous comments|view (?:all|more|previous) comments|see (?:all|more) comments|more repl(?:y|ies)|all repl(?:y|ies)|view (?:all )?repl(?:y|ies)|see (?:all )?repl(?:y|ies)|view \d+ repl(?:y|ies)|see \d+ more repl(?:y|ies)|xem thêm bình luận|xem bình luận trước|xem tất cả bình luận|xem thêm câu trả lời|xem tất cả câu trả lời|tải thêm bình luận|hiển thị thêm bình luận|xem thêm phản hồi)/i.test(label)) continue;
      clicked.add(button);
      try { button.click(); count += 1; } catch (_) {}
    }
    return count;
  }
  function reportProgress(message, done) {
    try {
      const pending = chrome.runtime.sendMessage({ type: 'COMMENT_CRAWL_PROGRESS', message, done: !!done });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch (_) {}
  }
  function postPermalinkForRoot(root) {
    const anchors = Array.from(root.querySelectorAll('a[href]')).filter(anchor => belongsToRoot(anchor, root));
    for (const anchor of anchors) {
      let url;
      try { url = new URL(anchor.getAttribute('href'), window.location.href); } catch (_) { continue; }
      if (!safeFacebookUrl(url.href)) continue;
      if (url.searchParams.has('comment_id') || url.searchParams.has('reply_comment_id')) continue;
      const looksLikePost = /\/(posts|permalink|videos?|reel|photos?|watch)(\/|$)/i.test(url.pathname) ||
        (/\/(story\.php|permalink\.php)$/i.test(url.pathname) && (url.searchParams.has('story_fbid') || url.searchParams.has('fbid')));
      if (looksLikePost) return canonicalPostUrl(url.href);
    }
    return '';
  }
  function discoverPostRoots(main) {
    const articles = Array.from(main.querySelectorAll('[role="article"]')).filter(visible);
    const byUrl = new Map();
    for (const root of articles) {
      const postUrl = postPermalinkForRoot(root);
      if (!postUrl) continue;
      const previous = byUrl.get(postUrl);
      const size = root.querySelectorAll('[role="article"]').length;
      if (!previous || size > previous.size) byUrl.set(postUrl, { root, size });
    }
    return Array.from(byUrl, ([postUrl, item]) => ({ postUrl, root: item.root }));
  }
  function findScrollContainer(scope) {
    let node = scope;
    while (node && node !== document.body && node !== document.documentElement) {
      try {
        const style = window.getComputedStyle(node);
        if (node.scrollHeight > node.clientHeight + 80 && /(auto|scroll|overlay)/i.test(style.overflowY || '')) return node;
      } catch (_) {}
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement || document.body;
  }
  function scrollMetrics(scope) {
    const container = findScrollContainer(scope);
    const documentScroller = !container || container === document.scrollingElement || container === document.documentElement || container === document.body;
    const current = documentScroller ? Math.max(Number(window.scrollY || 0), Number(container && container.scrollTop || 0)) : Number(container.scrollTop || 0);
    const total = documentScroller
      ? Math.max(Number(document.documentElement && document.documentElement.scrollHeight || 0), Number(document.body && document.body.scrollHeight || 0), Number(container && container.scrollHeight || 0))
      : Number(container.scrollHeight || 0);
    const viewport = documentScroller ? Number(window.innerHeight || container && container.clientHeight || 800) : Number(container.clientHeight || 800);
    return { container, documentScroller, current, max: Math.max(0, total - viewport), step: Math.max(350, viewport * 0.72) };
  }
  function scrollDown(scope) {
    const metrics = scrollMetrics(scope);
    if (metrics.current >= metrics.max - 3) return { moved: false, bottom: true };
    const next = Math.min(metrics.max, metrics.current + metrics.step);
    try {
      if (metrics.documentScroller) window.scrollTo(0, next);
      else metrics.container.scrollTop = next;
    } catch (_) {}
    return { moved: next > metrics.current + 2, bottom: next >= metrics.max - 3 };
  }
  function mergeCollected(collected, comment) {
    const previous = collected.get(comment.sourceKey);
    if (!previous) {
      collected.set(comment.sourceKey, comment);
      return;
    }
    collected.set(comment.sourceKey, {
      ...previous, ...comment,
      parentCommentId: comment.parentCommentId || previous.parentCommentId,
      depth: Math.max(Number(previous.depth) || 0, Number(comment.depth) || 0),
      permalink: comment.permalink || previous.permalink,
      commentedAt: comment.commentedAt || previous.commentedAt,
      commentedAtLabel: comment.commentedAtLabel || previous.commentedAtLabel,
      authorProfileUrl: comment.authorProfileUrl || previous.authorProfileUrl,
      authorProfileId: comment.authorProfileId || previous.authorProfileId
    });
  }
  async function collectSinglePost(main, postUrl, message) {
    reportProgress('Đang tìm khung bài viết...', false);
    const scope = await waitForPostRoot(main, postUrl, 8000);
    if (!scope) return { ok: false, error: 'Không tìm thấy khung bài viết sau 8 giây. Hãy chờ bài viết hiện đầy đủ, chọn “Tất cả bình luận” rồi thử lại.' };
    const originalY = Number(window.scrollY || 0);
    const maxRounds = Math.min(60, Math.max(8, Number(message && message.maxRounds) || 28));
    const maxClicks = Math.min(180, Math.max(1, Number(message && message.maxClicks) || 100));
    const clicked = new WeakSet(), collected = new Map();
    const remember = () => {
      const fresh = findPostRoot(main, postUrl);
      const root = fresh || scope;
      for (const comment of extractComments(root, postUrl)) mergeCollected(collected, comment);
      return root;
    };
    try { window.scrollTo(0, 0); } catch (_) {}
    await sleep(250);
    let root = remember(), expanded = 0, idleRounds = 0, rounds = 0;
    reportProgress('Đã tìm thấy bài viết; đang đọc bình luận...', false);
    for (; rounds < maxRounds; rounds += 1) {
      root = remember() || root;
      const before = root.querySelectorAll('[role="article"]').length;
      const clickedNow = expandButtons(root, Math.max(0, maxClicks - expanded), clicked);
      expanded += clickedNow;
      const scrolled = scrollDown(root);
      await sleep(450);
      root = remember() || root;
      const after = root.querySelectorAll('[role="article"]').length;
      if (after > before || clickedNow > 0 || scrolled.moved) idleRounds = 0;
      else idleRounds += 1;
      if (rounds % 3 === 0) reportProgress('Đang thu thập bài viết: lượt ' + (rounds + 1) + '/' + maxRounds + '; đã nhận ' + collected.size + ' bình luận.', false);
      if (rounds >= 5 && idleRounds >= 5) break;
      if (scrolled.bottom && rounds >= 5 && idleRounds >= 3) break;
    }
    remember();
    try { window.scrollTo(0, originalY); } catch (_) {}
    const comments = Array.from(collected.values());
    if (!comments.length) return { ok: false, error: 'Đã mở trang bài viết nhưng chưa nhận diện được bình luận. Mở rộng bình luận trên Facebook rồi thử lại.' };
    return { ok: true, postUrl, comments, postsScanned: 1, expanded, rounds: rounds + 1, note: 'Đã tích lũy bình luận qua nhiều lần cuộn.' };
  }
  async function collectActivePage(main, message) {
    const originalY = Number(window.scrollY || 0);
    const maxRounds = Math.min(40, Math.max(8, Number(message && message.maxRounds) || 28));
    const maxClicks = Math.min(160, Math.max(1, Number(message && message.maxClicks) || 100));
    const clicked = new WeakSet(), collected = new Map(), postUrls = new Set();
    function rememberAll() {
      const posts = discoverPostRoots(main);
      for (const post of posts) {
        postUrls.add(post.postUrl);
        for (const comment of extractComments(post.root, post.postUrl)) mergeCollected(collected, comment);
      }
      return posts;
    }
    reportProgress('Đang tìm các bài viết trên trang Facebook đang mở...', false);
    await sleep(250);
    let posts = rememberAll();
    if (!posts.length) {
      const deadline = Date.now() + 7000;
      while (!posts.length && Date.now() < deadline) {
        await sleep(350);
        posts = rememberAll();
      }
    }
    if (!posts.length) return { ok: false, error: 'Không tìm thấy bài viết nào trên trang hiện tại. Hãy mở bảng tin, trang cá nhân, trang nhóm hoặc một bài viết Facebook; chờ các bài hiện ra rồi thử lại.' };
    const scroller = findScrollContainer(main);
    try {
      if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) window.scrollTo(0, 0);
      else scroller.scrollTop = 0;
    } catch (_) {}
    await sleep(250);
    posts = rememberAll();
    let expanded = 0, idleRounds = 0, rounds = 0;
    reportProgress('Đã tìm thấy ' + posts.length + ' bài; đang thu thập bình luận đang hiển thị...', false);
    for (; rounds < maxRounds; rounds += 1) {
      const beforePosts = postUrls.size, beforeComments = collected.size;
      const clickedNow = expandButtons(main, Math.max(0, maxClicks - expanded), clicked);
      expanded += clickedNow;
      posts = rememberAll();
      const scrolled = scrollDown(main);
      await sleep(450);
      posts = rememberAll();
      if (postUrls.size > beforePosts || collected.size > beforeComments || clickedNow > 0 || scrolled.moved) idleRounds = 0;
      else idleRounds += 1;
      if (rounds % 2 === 0) reportProgress('Đang cuộn trang Facebook: lượt ' + (rounds + 1) + '/' + maxRounds + '; ' + postUrls.size + ' bài, ' + collected.size + ' bình luận.', false);
      if (rounds >= 5 && idleRounds >= 4) break;
      if (scrolled.bottom && rounds >= 4 && idleRounds >= 2) break;
    }
    rememberAll();
    try {
      const finalScroller = findScrollContainer(main);
      if (finalScroller === document.scrollingElement || finalScroller === document.documentElement || finalScroller === document.body) window.scrollTo(0, originalY);
      else finalScroller.scrollTop = originalY;
    } catch (_) {}
    const comments = Array.from(collected.values());
    if (!comments.length) return { ok: false, error: 'Tìm thấy ' + postUrls.size + ' bài nhưng chưa nhận diện được bình luận. Hãy mở rộng bình luận/trả lời trên Facebook rồi thử lại.' };
    return {
      ok: true, postUrl: window.location.href, comments, postsScanned: postUrls.size,
      expanded, rounds: rounds + 1,
      note: 'Chỉ gồm bài viết và bình luận mà Facebook đã tải trên trang hiện tại trong giới hạn cuộn.'
    };
  }
  async function collect(message) {
    if (!safeFacebookUrl(window.location.href)) return { ok: false, error: 'Tab hiện tại không phải trang Facebook được hỗ trợ.' };
    const main = document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
    if (!main) return { ok: false, error: 'Không tìm thấy vùng nội dung trang Facebook.' };
    const currentUrl = window.location.href;
    if (isPostUrl(currentUrl)) {
      const postUrl = canonicalPostUrl(currentUrl);
      const result = await collectSinglePost(main, postUrl, message);
      reportProgress(result.ok ? 'Đã thu thập xong ' + result.comments.length + ' bình luận.' : result.error, true);
      return result;
    }
    const result = await collectActivePage(main, message);
    reportProgress(result.ok ? 'Đã thu thập xong ' + result.comments.length + ' bình luận từ ' + result.postsScanned + ' bài.' : result.error, true);
    return result;
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'COMMENT_CRAWL_COLLECT') return false;
    collect(message).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error && error.message || error).slice(0, 1000) }));
    return true;
  });
})();