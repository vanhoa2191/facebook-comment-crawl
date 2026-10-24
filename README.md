# Facebook Comment Crawl

Chrome Extension (Manifest V3) for collecting comments/replies rendered on a selected Facebook post, matching authors against a roster, retaining a local comment history, and preparing reports through Meta AI Web.

## Features
- Best-effort collection scoped to the selected post permalink. It expands visible comment/reply controls and preserves parent/reply links where Facebook exposes enough DOM information.
- Displays collected comments with search, incremental paging, and a **show all** option.
- Imports roster data from CSV or XLSX (first worksheet; Vietnamese/English headers such as \`Tên Facebook\`, \`Mã đối chiếu\`, \`profileUrl\`, \`profileId\`, \`rosterId\` are recognized).
- Matches profile URL first, then profile ID, then a unique display name. A known different profile URL prevents name-only merging; ambiguous same-name entries remain flagged.
- Stores comments, profiles and reports in Chrome local storage. Exports JSON, CSV and XLSX. Individual profiles and reports can be deleted; the settings view includes delete-all.
- Uses Meta AI through its visible website UI only; no Meta AI API. Before sending, a review dialog displays every exact prompt and requires the user to check the approval box and click send.
- Weekly alarm reminds the user to open the dashboard and run a report. It does not send comment data automatically.
- Reports compare two periods, cite source comment IDs/links, mark missing timestamps, and prohibit sensitive-attribute inference.

## Install for testing
1. Open \`chrome://extensions\` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this repository folder.
4. Open a Facebook post permalink in a tab and sign in normally.
5. Open the extension dashboard and grant Facebook access when prompted.
6. Choose **All comments** on Facebook and expand replies. Return to the dashboard and select **Collect comments and replies**.
7. Import your roster under **Danh sách đối chiếu**. Review ambiguous matches rather than assuming a same-name match is correct.
8. Under **Dashboard & báo cáo**, select **Tổng hợp ngay** or run an individual profile report. Inspect every prompt in the review dialog before approving the transfer to Meta AI Web.

## Development
Requires Node.js 20+:
\`\`\`sh
npm test
npm run validate
\`\`\`

## Limits and privacy
- Hidden, deleted, inaccessible, or not-yet-rendered comments cannot be collected. Facebook DOM changes may affect extraction; verify the result against the actual post.
- XLSX import reads the first worksheet; legacy XLS should be saved as XLSX or CSV UTF-8.
- Trend analysis excludes comments without an original timestamp instead of substituting collection time.
- Weekly summaries use up to six recent examples per period for each profile in each request. Very large rosters require multiple Meta AI requests; every request is shown for review before sending.
- Meta AI Web automation can break when its interface changes. This repository has automated unit tests but still needs a logged-in, real-browser smoke test.
- The extension does not automatically post, message, react or comment on Facebook. It does not infer sensitive attributes such as health, religion, political affiliation, ethnicity, sexual orientation or private life.
