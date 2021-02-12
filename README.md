# Slack Deno Web API
Deno port of https://www.npmjs.com/package/@slack/web-api

# Current Status
This repo has been partially tested, but is not guaranteed to work

## Usage

```ts
import { WebClient } from 'https://deno.land/x/slack_web_api@1.0.1/mod.ts'
const web = new WebClient('your-token-here')

await web.chat.postMessage({
    channel: "C01C74D080J",
    text: "Hi from slack for deno"
})
```

## API

- Methods are identical to the [node @slack/web-api](https://www.npmjs.com/package/@slack/web-api).
- Generated docs are available at https://doc.deno.land/https/deno.land/x/slack_web_api@1.0.1/mod.ts

## License
- Slack Deno Web API is licensed under the MIT License. 
- Code is adapted from https://github.com/slackapi/node-slack-sdk/tree/main/packages/web-api (also under the MIT License)
