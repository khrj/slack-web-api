export { WebClient, WebClientEvent } from "./src/WebClient.ts"

export type {
    PageAccumulator,
    PageReducer,
    PaginatePredicate,
    WebAPICallOptions,
    WebAPICallResult,
    WebClientOptions,
} from "./src/WebClient.ts"

export { LogLevel } from "https://deno.land/x/slack_logger@3.0.0/mod.ts"
export type { Logger } from "https://deno.land/x/slack_logger@3.0.0/mod.ts"

export { ErrorCode } from "./src/errors.ts"
export type {
    CodedError,
    WebAPICallError,
    WebAPIHTTPError,
    WebAPIPlatformError,
    WebAPIRateLimitedError,
    WebAPIRequestError,
} from "./src/errors.ts"

export { default as retryPolicies } from "./src/retry-policies.ts"
export type { RetryOptions } from "./src/retry-policies.ts"

export { addAppMetadata } from "./src/instrument.ts"

export * from "./src/methods.ts"
export type { default as Method } from "./src/methods.ts"
