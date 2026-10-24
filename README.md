# Facebook Comment Crawl

Chrome Extension (Manifest V3) with a Chrome Side Panel for collecting comments/replies from the active Facebook post or currently loaded feed/group/profile page, matching authors against a roster, retaining a local comment history, and preparing reports through Meta AI Web.

## Features
- Best-effort collection scoped to the selected post permalink, including Facebook `/share/p/` and `/share/v/` links. It waits for the post container to hydrate, scrolls in increments, expands visible comment/reply controls and accumulates comments across DOM updates to reduce loss when Facebook virtualizes older comments.
- Displays collected comments with search, post/date filters, match-status filters, incremental paging, and a **show all** option. The dashboard includes a 14-day activity chart. Each tracked profile has a chronological comment-history view with observed reply counts. Local history is capped at 10,000 comments and 10,000 tracked profiles for browser responsiveness.
- Imports roster data from comma-, semicolon-, or tab-delimited CSV and XLSX (first worksheet; Vietnamese/English headers such as \`Tên Facebook\`, \`Mã đối chiếu\`, \`URL hồ sơ\`, \`profileUrl\`, \`profileId\`, and \`rosterId\` are recognized).
- Matches profile URL first, then profile ID, then a unique display name. A known different profile URL prevents name-only merging; ambiguous same-name entries remain flagged. Users can manually assign a comment to a profile, apply that choice to comments sharing the same URL/ID, reconcile comments again after importing a roster, and edit profile names, IDs, roster codes and notes. The report comparison period is saved across tabs and sessions.
- Stores comments, profiles and reports in Chrome local storage. Exports JSON, CSV and XLSX; long report text is split across valid Excel cells. JSON backups can be restored after a confirmation step, and old local data is migrated instead of silently discarded. Individual profiles and reports can be deleted; the settings view includes delete-all.
- Uses Meta AI through its visible website UI only; no Meta AI API. Before sending, a review dialog displays every exact prompt. The user must open each prompt, check the approval box and click send. Editing any prompt resets approval.
- If automatic Meta AI sending or response reading fails, a manual fallback lets the user select/copy the already-reviewed prompt and paste the response. The extension does not blindly retry a send.
- A weekly alarm reminds the user to open the dashboard and run a report. It does not send comment data automatically.
- Weekly reports process up to 30 profiles per run in resumable batches; if one Meta AI request fails, the next run resumes after the last completed batch instead of resending all earlier successful batches. Each Meta AI prompt covers up to three profiles and samples up to six recent comments per period. Keep running the report until the dashboard confirms the full roster cycle is complete.
- Reports compare two periods, cite source comment IDs/links, mark missing timestamps, and instruct Meta AI to treat comment text as untrusted data.

## Install for testing
1. Open \`chrome://extensions\` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this repository folder.
4. Open the extension dashboard, paste the exact Facebook post permalink, and click **Mở bài viết**. Sign in to Facebook normally if needed; the extension remembers that tab for collection.
5. On Facebook, choose **All comments** and expand replies. Return to the dashboard and grant Facebook access when prompted.
6. Select **Thu thập bình luận và trả lời** in the dashboard.
7. Import your roster under **Danh sách đối chiếu**. Review ambiguous matches rather than assuming a same-name match is correct.
8. Under **Dashboard & báo cáo**, select **Tổng hợp ngay** or run an individual profile report. Inspect every prompt in the review dialog before approving the transfer to Meta AI Web.

## Development
Requires Node.js 20+:
\`\`\`sh
npm test
npm run validate
\`\`\`

## Limits and privacy
- Collection targets the active Facebook tab, not arbitrary non-Facebook websites. On feed/group/profile pages, it collects only post containers and comments that Facebook renders during the bounded scroll pass; it does not crawl the entire account history.
- Hidden, deleted, inaccessible, or not-yet-rendered comments cannot be collected. Facebook DOM changes may affect extraction; verify the result against the actual post.
- XLSX import reads the first worksheet; legacy XLS should be saved as XLSX or CSV UTF-8.
- Trend analysis excludes comments without an original timestamp instead of substituting collection time.
- Meta AI Web automation can break when its interface changes. Automated tests cover the local data model, CSV/XLSX import/export, nested-comment extraction in a mocked DOM, and Meta AI UI bridge behavior. A logged-in, real-browser smoke test is still required before relying on collection accuracy.
- The extension does not automatically post, message, react or comment on Facebook. It does not infer sensitive attributes such as health, religion, political affiliation, ethnicity, sexual orientation or private life.
