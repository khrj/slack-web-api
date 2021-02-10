export type {
    WebClient,
    WebClientOptions,
    WebAPICallOptions,
    WebAPICallResult,
    PageAccumulator,
    PageReducer,
    PaginatePredicate,
    WebClientEvent,
} from './src/WebClient.ts'

export type { Logger, LogLevel } from 'https://deno.land/x/slack_logger@3.0.0/mod.ts'

export type {
    CodedError,
    ErrorCode,
    WebAPICallError,
    WebAPIPlatformError,
    WebAPIRequestError,
    WebAPIHTTPError,
    WebAPIRateLimitedError,
} from './src/errors.ts'

export type { default as retryPolicies, RetryOptions } from './src/retry-policies.ts'

export { addAppMetadata } from './src/instrument.ts'

export * from './src/methods.ts'
export type { default as Method } from './src/methods.ts'
