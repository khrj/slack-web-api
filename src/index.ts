export type {
    WebClient,
    WebClientOptions,
    WebAPICallOptions,
    WebAPICallResult,
    PageAccumulator,
    PageReducer,
    PaginatePredicate,
    WebClientEvent,
} from './WebClient.ts'

export type { Logger, LogLevel } from 'https://deno.land/x/slack_logger@3.0.0/mod.ts'

export type {
    CodedError,
    ErrorCode,
    WebAPICallError,
    WebAPIPlatformError,
    WebAPIRequestError,
    WebAPIHTTPError,
    WebAPIRateLimitedError,
} from './errors.ts'

export type { default as retryPolicies, RetryOptions } from './retry-policies.ts'

export { addAppMetadata } from './instrument.ts'

export * from './methods.ts'
export type { default as Method } from './methods.ts'
