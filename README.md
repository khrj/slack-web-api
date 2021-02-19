<div align="center">
    <img src="assets/logo.svg" width="400" height="400" alt="slack_web_api illustration">
    <h1>Slack Deno Web API</h1>
    <p>
        <b>Simple, convenient, and configurable HTTP client for making requests to Slack’s <a href="https://api.slack.com/web">Web API</a>. Deno port of <a href="https://www.npmjs.com/package/@slack/web-api">@slack/web-api</a></b>
    </p>
    <p>
        <img alt="build status" src="https://img.shields.io/github/workflow/status/slack-deno/web-api/Deno?label=checks" >
        <img alt="language" src="https://img.shields.io/github/languages/top/slack-deno/web-api" >
        <img alt="code size" src="https://img.shields.io/github/languages/code-size/slack-deno/web-api">
        <img alt="issues" src="https://img.shields.io/github/issues/slack-deno/web-api" >
        <img alt="license" src="https://img.shields.io/github/license/slack-deno/web-api">
        <img alt="version" src="https://img.shields.io/github/v/release/slack-deno/web-api">
    </p>
    <p>
        <b><a href="https://deno.land/x/slack_web_api">View on deno.land</a></b>
    </p>
    <br>
    <br>
    <br>
</div>

## Usage

```ts
import { WebClient } from "https://deno.land/x/slack_web_api@1.0.2/mod.ts"
const web = new WebClient("your-token-here")

await web.chat.postMessage({
    channel: "C01C74D080J",
    text: "Hi from slack for deno",
})
```

## API

- Methods are identical to the [node @slack/web-api](https://www.npmjs.com/package/@slack/web-api).
- Generated docs are available at https://doc.deno.land/https/deno.land/x/slack_web_api@1.0.2/mod.ts

## Supporters

[![Stargazers repo roster for @slack-deno/web-api](https://reporoster.com/stars/slack-deno/web-api)](https://github.com/slack-deno/web-api/stargazers)

[![Forkers repo roster for @slack-deno/web-api](https://reporoster.com/forks/slack-deno/web-api)](https://github.com/slack-deno/web-api/network/members)

## Related

- [Deno modules](https://github.com/KhushrajRathod/DenoModules)
