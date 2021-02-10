import { basename } from "https://deno.land/std@0.86.0/path/mod.ts"

import PQueue from 'https://deno.land/x/p_queue@1.0.0/mod.ts'
import pRetried, { AbortError } from 'https://deno.land/x/p_retried@1.0.3/mod.ts'
import axiod from "https://deno.land/x/axiod@0.20.0-0/mod.ts"

import { Methods, CursorPaginationEnabled, cursorPaginationEnabledMethods } from './methods.ts'
import { getUserAgent } from './instrument.ts'
import { requestErrorWithOriginal, httpErrorFromResponse, platformErrorFromResult, rateLimitedErrorWithDelay } from './errors.ts'
import { Logger, LogLevel } from 'https://deno.land/x/slack_logger@3.0.0/mod.ts'
import { getLogger } from './logger.ts'
import retryPolicies, { RetryOptions } from './retry-policies.ts'
import { delay } from './helpers.ts'
import { IAxiodResponse, IHeaderData, Data, IData } from "https://deno.land/x/axiod@0.20.0-0/interfaces.ts"

/**
 * A client for Slack's Web API
 *
 * This client provides an alias for each {@link https://api.slack.com/methods|Web API method}. Each method is
 * a convenience wrapper for calling the {@link WebClient#apiCall} method using the method name as the first parameter.
 */
export class WebClient extends Methods {
    /**
     * The base URL for reaching Slack's Web API. Consider changing this value for testing purposes.
     */
    public readonly slackApiUrl: string

    /**
     * Authentication and authorization token for accessing Slack Web API (usually begins with `xoxp` or `xoxb`)
     */
    public readonly token?: string

    /**
     * Configuration for retry operations. See {@link https://github.com/tim-kos/node-retry|node-retry} for more details.
     */
    private retryConfig: RetryOptions

    /**
     * Queue of requests in which a maximum of {@link WebClientOptions.maxRequestConcurrency} can concurrently be
     * in-flight.
     */
    private requestQueue: PQueue

    private axiodConfig: {
        baseURL: string
        headers: {
            'User-Agent': string
        }
        transformRequest: ((options: Data, headers?: IHeaderData | undefined) => Data)[]
        validateStatus: () => boolean
    }

    /**
     * Preference for immediately rejecting API calls which result in a rate-limited response
     */
    private rejectRateLimitedCalls: boolean

    /**
     * The name used to prefix all logging generated from this object
     */
    private static loggerName = 'WebClient'

    /**
     * This object's logger instance
     */
    private logger: Logger

    /**
     * This object's teamId value
     */
    private teamId?: string

    /**
     * @param token - An API token to authenticate/authorize with Slack (usually start with `xoxp`, `xoxb`)
     */
    constructor(token?: string, {
        slackApiUrl = 'https://slack.com/api/',
        logger = undefined,
        logLevel = LogLevel.INFO,
        maxRequestConcurrency = 3,
        retryConfig = retryPolicies.tenRetriesInAboutThirtyMinutes,
        rejectRateLimitedCalls = false,
        headers = {},
        teamId = undefined,
    }: WebClientOptions = {}) {
        super()

        this.token = token
        this.slackApiUrl = slackApiUrl

        this.retryConfig = retryConfig
        this.requestQueue = new PQueue({ concurrency: maxRequestConcurrency })
        // NOTE: may want to filter the keys to only those acceptable for TLS options
        this.rejectRateLimitedCalls = rejectRateLimitedCalls
        this.teamId = teamId

        // Logging
        if (typeof logger !== 'undefined') {
            this.logger = logger
            if (typeof logLevel !== 'undefined') {
                this.logger.debug('The logLevel given to WebClient was ignored as you also gave logger')
            }
        } else {
            this.logger = getLogger(WebClient.loggerName, logLevel, logger)
        }

        this.axiodConfig = {
            baseURL: this.slackApiUrl,
            headers: {
                'User-Agent': getUserAgent(),
                ...headers
            },
            transformRequest: [this.serializeApiCallOptions.bind(this)],
            validateStatus: () => true, // all HTTP status codes should result in a resolved promise (as opposed to only 2xx)
        }

        this.logger.debug('initialized')
    }

    /**
     * Generic method for calling a Web API method
     *
     * @param method - the Web API method to call {@link https://api.slack.com/methods}
     * @param options - options
     */
    public async apiCall(method: string, options?: WebAPICallOptions): Promise<WebAPICallResult> {
        this.logger.debug(`apiCall('${method}') start`)

        warnDeprecations(method, this.logger)

        if (typeof options === 'string' || typeof options === 'number' || typeof options === 'boolean') {
            throw new TypeError(`Expected an options argument but instead received a ${typeof options}`)
        }

        const response = await this.makeRequest(method, {
            token: this.token,
            teamId: this.teamId,
            ...options,
        })

        const result = this.buildResult(response)

        // log warnings in response metadata
        if (result.response_metadata !== undefined && result.response_metadata.warnings !== undefined) {
            result.response_metadata.warnings.forEach(this.logger.warn.bind(this.logger))
        }

        // log warnings and errors in response metadata messages
        // related to https://api.slack.com/changelog/2016-09-28-response-metadata-is-on-the-way
        if (result.response_metadata !== undefined && result.response_metadata.messages !== undefined) {
            result.response_metadata.messages.forEach((msg) => {
                const errReg = /\[ERROR\](.*)/
                const warnReg = /\[WARN\](.*)/
                if (errReg.test(msg)) {
                    const errMatch = msg.match(errReg)
                    if (errMatch != null) {
                        this.logger.error(errMatch[1].trim())
                    }
                } else if (warnReg.test(msg)) {
                    const warnMatch = msg.match(warnReg)
                    if (warnMatch != null) {
                        this.logger.warn(warnMatch[1].trim())
                    }
                }
            })
        }

        if (!result.ok) {
            throw platformErrorFromResult(result as (WebAPICallResult & { error: string }))
        }

        return result
    }

    /**
     * Iterate over the result pages of a cursor-paginated Web API method. This method can return two types of values,
     * depending on which arguments are used. When up to two parameters are used, the return value is an async iterator
     * which can be used as the iterable in a for-await-of loop. When three or four parameters are used, the return
     * value is a promise that resolves at the end of iteration. The third parameter, `shouldStop`, is a function that is
     * called with each `page` and can end iteration by returning `true`. The fourth parameter, `reduce`, is a function
     * that is called with three arguments: `accumulator`, `page`, and `index`. The `accumulator` is a value of any type
     * you choose, but it will contain `undefined` when `reduce` is called for the first time. The `page` argument and
     * `index` arguments are exactly what they say they are. The `reduce` function's return value will be passed in as
     * `accumulator` the next time its called, and the returned promise will resolve to the last value of `accumulator`.
     *
     * The for-await-of syntax is part of ES2018. It is available natively in Node starting with v10.0.0. You may be able
     * to use it in earlier JavaScript runtimes by transpiling your source with a tool like Babel. However, the
     * transpiled code will likely sacrifice performance.
     *
     * @param method - the cursor-paginated Web API method to call {@link https://api.slack.com/docs/pagination}
     * @param options - options
     * @param shouldStop - a predicate that is called with each page, and should return true when pagination can end.
     * @param reduce - a callback that can be used to accumulate a value that the return promise is resolved to
     */
    public paginate(method: string, options?: WebAPICallOptions): AsyncIterable<WebAPICallResult>
    public paginate(
        method: string,
        options: WebAPICallOptions,
        shouldStop: PaginatePredicate,
    ): Promise<void>
    public paginate<R extends PageReducer, A extends PageAccumulator<R>>(
        method: string,
        options: WebAPICallOptions,
        shouldStop: PaginatePredicate,
        reduce?: PageReducer<A>,
    ): Promise<A>
    public paginate<R extends PageReducer, A extends PageAccumulator<R>>(
        method: string,
        options?: WebAPICallOptions,
        shouldStop?: PaginatePredicate,
        reduce?: PageReducer<A>,
    ): (Promise<A> | AsyncIterable<WebAPICallResult>) {

        if (!cursorPaginationEnabledMethods.has(method)) {
            this.logger.warn(`paginate() called with method ${method}, which is not known to be cursor pagination enabled.`)
        }

        const pageSize = (() => {
            if (options !== undefined && typeof options.limit === 'number') {
                const limit = options.limit
                delete options.limit
                return limit
            }
            return defaultPageSize
        })()

        async function* generatePages(this: WebClient): AsyncIterableIterator<WebAPICallResult> {
            // when result is undefined, that signals that the first of potentially many calls has not yet been made
            let result: WebAPICallResult | undefined = undefined
            // paginationOptions stores pagination options not already stored in the options argument
            let paginationOptions: CursorPaginationEnabled | undefined = {
                limit: pageSize,
            }
            if (options !== undefined && options.cursor !== undefined) {
                paginationOptions.cursor = options.cursor as string
            }

            // NOTE: test for the situation where you're resuming a pagination using and existing cursor

            while (result === undefined || paginationOptions !== undefined) {
                result = await this.apiCall(method, { ...(options !== undefined ? options : {}), ...paginationOptions })
                yield result
                paginationOptions = paginationOptionsForNextPage(result, pageSize)
            }
        }

        if (shouldStop === undefined) {
            return generatePages.call(this)
        }

        const pageReducer: PageReducer<A> = (reduce !== undefined) ? reduce : noopPageReducer
        let index = 0

        return (async () => {
            // Unroll the first iteration of the iterator
            // This is done primarily because in order to satisfy the type system, we need a variable that is typed as A
            // (shown as accumulator before), but before the first iteration all we have is a variable typed A | undefined.
            // Unrolling the first iteration allows us to deal with undefined as a special case.

            const pageIterator: AsyncIterableIterator<WebAPICallResult> = generatePages.call(this)
            const firstIteratorResult = await pageIterator.next(undefined)
            // Assumption: there will always be at least one result in a paginated API request
            // if (firstIteratorResult.done) { return }
            const firstPage = firstIteratorResult.value
            let accumulator: A = pageReducer(undefined, firstPage, index)
            index += 1
            if (shouldStop(firstPage)) {
                return accumulator
            }

            // Continue iteration
            for await (const page of pageIterator) {
                accumulator = pageReducer(accumulator, page, index)
                if (shouldStop(page)) {
                    return accumulator
                }
                index += 1
            }
            return accumulator
        })()
    }

    /**
     * Low-level function to make a single API request. handles queuing, retries, and http-level errors
     */
    private makeRequest(
        url: string,
        body: IData,
        headers: IHeaderData = {}
    ): Promise<IAxiodResponse> {
        const task = () => this.requestQueue.add(async () => {
            this.logger.debug('will perform http request')
            try {
                const response = await axiod.request({
                    ...this.axiodConfig,
                    method: 'POST',
                    data: body,
                    url,
                    headers: {
                        ...headers,
                        ...this.axiodConfig.headers
                    },
                })

                this.logger.debug('http response received')

                if (response.status === 429) {
                    const retrySec = parseRetryHeaders(response)
                    if (retrySec !== undefined) {
                        this.dispatchEvent(new CustomEvent(WebClientEvent.RATE_LIMITED, { detail: retrySec }))
                        if (this.rejectRateLimitedCalls) {
                            throw new AbortError(rateLimitedErrorWithDelay(retrySec))
                        }
                        this.logger.info(`API Call failed due to rate limiting. Will retry in ${retrySec} seconds.`)
                        // pause the request queue and then delay the rejection by the amount of time in the retry header
                        this.requestQueue.pause()
                        // NOTE: if there was a way to introspect the current RetryOperation and know what the next timeout
                        // would be, then we could subtract that time from the following delay, knowing that it the next
                        // attempt still wouldn't occur until after the rate-limit header has specified. an even better
                        // solution would be to subtract the time from only the timeout of this next attempt of the
                        // RetryOperation. this would result in the staying paused for the entire duration specified in the
                        // header, yet this operation not having to pay the timeout cost in addition to that.
                        await delay(retrySec * 1000)
                        // resume the request queue and throw a non-abort error to signal a retry
                        this.requestQueue.start()
                        throw Error('A rate limit was exceeded.')
                    } else {
                        // TODO: turn this into some CodedError
                        throw new AbortError(new Error('Retry header did not contain a valid timeout.'))
                    }
                }

                // Slack's Web API doesn't use meaningful status codes besides 429 and 200
                if (response.status !== 200) {
                    throw httpErrorFromResponse(response)
                }

                return response
            } catch (error) {
                this.logger.warn('http request failed', error.message)
                if (error.request) {
                    throw requestErrorWithOriginal(error)
                }
                throw error
            }
        })

        return pRetried(task, this.retryConfig)
    }

    /**
     * Transforms options (a simple key-value object) into an acceptable value for a body. This can be either
     * a string, used when posting with a content-type of url-encoded. Or, it can be a readable stream, used
     * when the options contain a binary (a stream or a buffer) and the upload should be done with content-type
     * multipart/form-data.
     *
     * @param options - arguments for the Web API method
     * @param headers - a mutable object representing the HTTP headers for the outgoing request
     */
    private serializeApiCallOptions(options: Data, headers?: IHeaderData): Data {
        // The following operation both flattens complex objects into a JSON-encoded strings and searches the values for
        // binary content
        let containsBinaryData = false
        const flattened =
            Object.entries(options as IData) // axiod.post is only called internally
                .flatMap(([key, value]): [[string, string | Blob]] | [] => {
                    if (value === undefined || value === null) {
                        return []
                    }

                    let serializedValue: string | Blob = value

                    if (value instanceof Blob) {
                        containsBinaryData = true
                    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                        serializedValue = value.toString()
                    } else {
                        // if value is anything other than string, number, boolean, binary data, a Stream, or a Buffer, then encode it
                        // as a JSON string.
                        serializedValue = JSON.stringify(value)
                    }

                    return [[key, serializedValue]]
                })

        // A body with binary content should be serialized as multipart/form-data
        if (containsBinaryData) {
            this.logger.debug('request arguments contain binary data')
            const form =
                flattened.reduce(
                    (form, [key, value]) => {
                        if (value instanceof File) {
                            form.append(key, value, basename(value.name))
                        } else {
                            form.append(key, value)
                        }
                        return form
                    },
                    new FormData(),
                )
            // Copying FormData-generated headers into headers param
            // not reassigning to headers param since it is passed by reference and behaves as an inout param
            for (const [header, value] of form.entries()) {
                headers![header] = value
            }

            return form
        }

        // Otherwise, a simple key-value object is returned
        headers!['Content-Type'] = 'application/x-www-form-urlencoded'

        return new URLSearchParams(
            flattened as [string, string][] // Type ensured by containsBinaryData
        ).toString()
    }

    /**
     * Processes an HTTP response into a WebAPICallResult by performing JSON parsing on the body and merging relevent
     * HTTP headers into the object.
     * @param response - an http response
     */
    private buildResult(response: IAxiodResponse): WebAPICallResult {
        const data = response.data

        if (data.response_metadata === undefined) {
            data.response_metadata = {}
        }

        // add scopes metadata from headers
        const xOauthScopes = response.headers.get('x-oauth-scopes')
        const xAcceptedOauthScopes = response.headers.get('x-accepted-oauth-scopes')

        if (xOauthScopes) {
            data.response_metadata.scopes = xOauthScopes.trim().split(/\s*,\s*/)
        }
        if (xAcceptedOauthScopes) {
            data.response_metadata.acceptedScopes =
                xAcceptedOauthScopes.trim().split(/\s*,\s*/)
        }

        // add retry metadata from headers
        const retrySec = parseRetryHeaders(response)
        if (retrySec !== undefined) {
            data.response_metadata.retryAfter = retrySec
        }

        return data
    }
}

export default WebClient

/*
 * Exported types
 */

export interface WebClientOptions {
    slackApiUrl?: string
    logger?: Logger
    logLevel?: LogLevel
    maxRequestConcurrency?: number
    retryConfig?: RetryOptions
    rejectRateLimitedCalls?: boolean
    headers?: Record<string, unknown>
    teamId?: string
}


export enum WebClientEvent {
    RATE_LIMITED = 'rate_limited',
}

export interface WebAPICallOptions {
    [argument: string]: unknown
}

export interface WebAPICallResult {
    ok: boolean
    error?: string
    response_metadata?: {
        warnings?: string[]
        next_cursor?: string // is this too specific to be encoded into this type?

        // added from the headers of the http response
        scopes?: string[]
        acceptedScopes?: string[]
        retryAfter?: number
        // `chat.postMessage` returns an array of error messages (e.g., "messages": ["[ERROR] invalid_keys"])
        messages?: string[]
    }
    [key: string]: unknown
}

// NOTE: should there be an async predicate?
export interface PaginatePredicate {
    (page: WebAPICallResult): boolean | undefined | void
}

export interface PageReducer<A = any> {
    (accumulator: A | undefined, page: WebAPICallResult, index: number): A
}

export type PageAccumulator<R extends PageReducer> =
    R extends (accumulator: (infer A) | undefined, page: WebAPICallResult, index: number) => infer A ? A : never

/*
 * Helpers
 */

const defaultFilename = 'Untitled'
const defaultPageSize = 200
const noopPageReducer: PageReducer = () => undefined

/**
 * Determines an appropriate set of cursor pagination options for the next request to a paginated API method.
 * @param previousResult - the result of the last request, where the next cursor might be found.
 * @param pageSize - the maximum number of additional items to fetch in the next request.
 */
function paginationOptionsForNextPage(
    previousResult: WebAPICallResult | undefined, pageSize: number,
): CursorPaginationEnabled | undefined {
    if (
        previousResult !== undefined &&
        previousResult.response_metadata !== undefined &&
        previousResult.response_metadata.next_cursor !== undefined &&
        previousResult.response_metadata.next_cursor !== ''
    ) {
        return {
            limit: pageSize,
            cursor: previousResult.response_metadata.next_cursor as string,
        }
    }
    return
}

/**
 * Extract the amount of time (in seconds) the platform has recommended this client wait before sending another request
 * from a rate-limited HTTP response (statusCode = 429).
 */
function parseRetryHeaders(response: IAxiodResponse): number | undefined {
    if (response.headers.get('retry-after') !== undefined) {
        const retryAfter = parseInt((response.headers.get('retry-after') as string), 10)

        if (!Number.isNaN(retryAfter)) {
            return retryAfter
        }
    }
    return undefined
}

/**
 * Log a warning when using a deprecated method
 * @param method api method being called
 * @param logger instance of web clients logger
 */
function warnDeprecations(method: string, logger: Logger): void {
    const deprecatedConversationsMethods = ['channels.', 'groups.', 'im.', 'mpim.']

    const deprecatedMethods = ['admin.conversations.whitelist.']

    const isDeprecatedConversations = deprecatedConversationsMethods.some((depMethod) => {
        const re = new RegExp(`^${depMethod}`)
        return re.test(method)
    })

    const isDeprecated = deprecatedMethods.some((depMethod) => {
        const re = new RegExp(`^${depMethod}`)
        return re.test(method)
    })

    if (isDeprecatedConversations) {
        logger.warn(`${method} is deprecated. Please use the Conversations API instead. For more info, go to https://api.slack.com/changelog/2020-01-deprecating-antecedents-to-the-conversations-api`)
    } else if (isDeprecated) {
        logger.warn(`${method} is deprecated. Please check on https://api.slack.com/methods for an alternative.`)
    }
}
