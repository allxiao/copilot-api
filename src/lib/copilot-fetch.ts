import { fetch as undiciFetch, type Dispatcher } from "undici"
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
} from "undici/types/fetch"

import { getCopilotProxyDispatcher } from "./proxy"

type CopilotFetchInput = Parameters<typeof fetch>[0]
type CopilotFetchInit = Parameters<typeof fetch>[1]
type UndiciFetchInitWithDispatcher = UndiciRequestInit & {
  dispatcher: Dispatcher
}

export async function copilotFetch(
  input: CopilotFetchInput,
  init?: CopilotFetchInit,
): Promise<Response> {
  const dispatcher = getCopilotProxyDispatcher()
  if (!dispatcher) {
    return await fetch(input, init)
  }

  return (await undiciFetch(
    input as UndiciRequestInfo,
    {
      ...(init as UndiciRequestInit | undefined),
      dispatcher,
    } as UndiciFetchInitWithDispatcher,
  )) as unknown as Response
}
