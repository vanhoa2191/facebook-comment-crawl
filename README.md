# Facebook Comment Crawl

Chrome Extension (Manifest V3) to collect visible comments/replies from the Facebook post you open, match authors against a roster, retain a local comment history, and prepare reports through Meta AI Web.

## Features
- Collects only content rendered on a post that the signed-in user can view. Facebook's interface changes, so collection is best-effort and needs a live-browser check.
- Imports a roster from CSV or XLSX (first worksheet; columns such as \`name\`, \`profileUrl\`, \`profileId\`, and \`rosterId\` are recognized).
- Matches profile URL/ID first, then a unique display name. Ambiguous matches remain flagged instead of being silently merged.
- Stores comments, profiles and reports in \`chrome.storage.local\`; exports comments as CSV, all data as JSON, and reports/roster/comments in XLSX.
- Uses Meta AI through its visible website UI only. There is no Meta AI API integration.
- A weekly alarm reminds you to open the dashboard and run a report. It does not send comment data to Meta AI automatically.
- No automatic Facebook publishing, messaging, reacting or commenting. The user must confirm before comment content is sent to Meta AI Web.

## Install for testing
1. Open \`chrome://extensions\` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this repository folder.
4. Open a Facebook post permalink in a tab and sign in normally.
5. Open the extension dashboard, choose **Thu thập**, and grant Facebook access when prompted.
6. Choose **Tất cả bình luận** on Facebook and expand replies before collecting. Return to the dashboard and select **Thu thập bình luận và trả lời**.
7. Import a roster under **Danh sách đối chiếu**. Review ambiguous matches before relying on per-person reports.
8. Under **Dashboard & báo cáo**, select **Tổng hợp ngay**. Review the confirmation before the extension sends a prompt to Meta AI Web.

## Development
Requires Node.js 20+:
\`\`\`sh
npm test
npm run validate
\`\`\`

## Limits
- Hidden, deleted, inaccessible, or not-yet-rendered comments cannot be collected.
- XLSX import reads the first worksheet; legacy XLS should be saved as XLSX or CSV UTF-8 first.
- Weekly reports summarize up to 30 profiles per run in batches. Individual profile reports can be generated from the roster list.
- Meta AI Web DOM automation can break when the website changes. Validate the extracted comments and the AI response in a logged-in browser before relying on them.
- The extension does not infer sensitive attributes such as health, religion, political affiliation, ethnicity, sexual orientation or private life.
