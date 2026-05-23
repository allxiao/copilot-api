import consola from "consola"
import { getProxyForUrl } from "proxy-from-env"
import { Agent, ProxyAgent, setGlobalDispatcher, type Dispatcher } from "undici"

import type { ProxyConfig } from "./config"

const supportedProxyProtocols = new Set([
  "http:",
  "https:",
  "socks:",
  "socks5:",
])

let configuredCopilotProxyDispatcher: Dispatcher | undefined
let proxyEnvDispatcher: Dispatcher | undefined

export function getProxyEnvDispatcher(): Dispatcher | undefined {
  return proxyEnvDispatcher
}

export function getCopilotProxyDispatcher(): Dispatcher | undefined {
  return configuredCopilotProxyDispatcher ?? proxyEnvDispatcher
}

export function getConfiguredProxyUrl(
  proxyConfig: ProxyConfig | undefined,
): string | undefined {
  if (typeof proxyConfig === "string") {
    const proxyUrl = proxyConfig.trim()
    return proxyUrl.length > 0 ? proxyUrl : undefined
  }

  if (!proxyConfig || proxyConfig.enabled === false) {
    return undefined
  }

  const proxyUrl = proxyConfig.url?.trim()
  return proxyUrl && proxyUrl.length > 0 ? proxyUrl : undefined
}

export function initConfiguredProxy(
  proxyConfig: ProxyConfig | undefined,
): void {
  const proxyUrl = getConfiguredProxyUrl(proxyConfig)
  if (!proxyUrl) {
    configuredCopilotProxyDispatcher = undefined
    return
  }

  try {
    configuredCopilotProxyDispatcher = createProxyAgent(proxyUrl)
    consola.info(`Copilot proxy configured: ${formatProxyLabel(proxyUrl)}`)
  } catch (err) {
    configuredCopilotProxyDispatcher = undefined
    consola.warn("Copilot proxy setup skipped:", err)
  }
}

export function initProxyFromEnv(): void {
  try {
    const direct = new Agent()
    const proxies = new Map<string, ProxyAgent>()

    // We only need a minimal dispatcher that implements `dispatch` at runtime.
    // Typing the object as `Dispatcher` forces TypeScript to require many
    // additional methods. Instead, keep a plain object and cast when passing
    // to `setGlobalDispatcher`.
    const dispatcher = {
      dispatch(
        options: Dispatcher.DispatchOptions,
        handler: Dispatcher.DispatchHandler,
      ) {
        try {
          const origin =
            typeof options.origin === "string" ?
              new URL(options.origin)
            : (options.origin as URL)
          const get = getProxyForUrl as unknown as (
            u: string,
          ) => string | undefined
          const raw = get(origin.toString())
          const proxyUrl = raw && raw.length > 0 ? raw : undefined
          if (!proxyUrl) {
            consola.debug(`HTTP proxy bypass: ${origin.hostname}`)
            return (direct as unknown as Dispatcher).dispatch(options, handler)
          }
          let agent = proxies.get(proxyUrl)
          if (!agent) {
            agent = createProxyAgent(proxyUrl)
            proxies.set(proxyUrl, agent)
          }
          consola.debug(
            `HTTP proxy route: ${origin.hostname} via ${formatProxyLabel(proxyUrl)}`,
          )
          return (agent as unknown as Dispatcher).dispatch(options, handler)
        } catch {
          return (direct as unknown as Dispatcher).dispatch(options, handler)
        }
      },
      async close() {
        await Promise.all([
          direct.close(),
          ...[...proxies.values()].map((agent) => agent.close()),
        ])
      },
      destroy(err?: Error) {
        void direct.destroy(err ?? null)
        for (const agent of proxies.values()) {
          void agent.destroy(err ?? null)
        }
      },
    }

    proxyEnvDispatcher = dispatcher as unknown as Dispatcher

    if (typeof Bun !== "undefined") {
      consola.debug("WebSocket proxy configured from environment (per-URL)")
      return
    }

    setGlobalDispatcher(proxyEnvDispatcher)
    consola.debug("HTTP proxy configured from environment (per-URL)")
  } catch (err) {
    consola.debug("Proxy setup skipped:", err)
  }
}

export function resetProxyForTests(): void {
  configuredCopilotProxyDispatcher = undefined
  proxyEnvDispatcher = undefined
}

function createProxyAgent(proxyUrl: string): ProxyAgent {
  const url = new URL(proxyUrl)
  if (!supportedProxyProtocols.has(url.protocol)) {
    throw new Error(
      `Unsupported proxy protocol '${url.protocol}'. Use http, https, socks, or socks5.`,
    )
  }

  return new ProxyAgent(proxyUrl)
}

function formatProxyLabel(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return proxyUrl
  }
}
