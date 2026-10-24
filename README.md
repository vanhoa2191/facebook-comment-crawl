# Facebook Comment Crawl

Chrome Extension (Manifest V3) for collecting visible comments and nested replies from the Facebook post currently open, matching authors against an Excel/CSV roster, and producing local dashboards and reviewable Meta AI Web reports.

## Core rules
- Works only on the Facebook post currently open and the comments/replies that Facebook makes visible to the signed-in user.
- No Meta AI API. Meta AI is used through the visible website UI only.
- No automatic publishing, messaging, reacting, or other outbound actions. Sending a prompt to Meta AI requires a user action; the extension never posts generated text to Facebook.
- Data is stored locally in Chrome, with export and delete controls.
- Profile matching prioritizes profile URL / ID, then unique name matching. Ambiguous names are not auto-merged.
- Reports must cite source comments and must not infer sensitive personal attributes.

## Development
Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the project directory.

Run tests with Node.js 20+:
```sh
npm test
npm run validate
``

Meta AI Web automation depends on the live website DOM and may need maintenance when Meta changes its interface. The extension should be tested against a real logged-in browser before relying on collected data.
