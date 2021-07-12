<div align="center">
    <img src="assets/logo.svg" width="400" height="400" alt="slack_web_api illustration">
    <h1>Slack Web API</h1>
    <p>
        <b>Simple, convenient, and configurable HTTP client for making requests to Slack’s <a href="https://api.slack.com/web">Web API</a>. Deno port of <a href="https://www.npmjs.com/package/@slack/web-api">@slack/web-api</a></b>
    </p>
    <p>
        <img alt="build status" src="https://img.shields.io/github/workflow/status/khrj/slack-web-api/Deno?label=checks" >
        <img alt="language" src="https://img.shields.io/github/languages/top/khrj/slack-web-api" >
        <img alt="code size" src="https://img.shields.io/github/languages/code-size/khrj/slack-web-api">
        <img alt="issues" src="https://img.shields.io/github/issues/khrj/slack-web-api" >
        <img alt="license" src="https://img.shields.io/github/license/khrj/slack-web-api">
        <img alt="version" src="https://img.shields.io/github/v/release/khrj/slack-web-api">
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
import { WebClient } from "https://deno.land/x/slack_web_api@1.0.3/mod.ts"
const web = new WebClient("your-token-here")

await web.chat.postMessage({
    channel: "C01C74D080J",
    text: "Hi from slack for deno",
})
```

## API

- Methods are identical to the [node @slack/web-api](https://www.npmjs.com/package/@slack/web-api).
- Generated docs are available at https://doc.deno.land/https/deno.land/x/slack_web_api@1.0.3/mod.ts

## Supporters

[![Stargazers repo roster for @khrj/slack-web-api](https://reporoster.com/stars/khrj/slack-web-api)](https://github.com/khrj/slack-web-api/stargazers)

[![Forkers repo roster for @khrj/slack-web-api](https://reporoster.com/forks/khrj/slack-web-api)](https://github.com/khrj/slack-web-api/network/members)

## Related

- [Deno Slack SDK](https://github.com/khrj/deno-slack-sdk)
- [Deno modules](https://github.com/khrj/deno-modules)
