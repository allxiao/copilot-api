import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { Hono } from "hono"

import type { ProxyConfig } from "../src/lib/config"

const actualConfigModule = await import("../src/lib/config")
const actualPathsModule = await import("../src/lib/paths")
const actualProxyModule = await import("../src/lib/proxy")

let modelMappings: Record<string, string> = {
  "claude-opus-4-7": "gpt-5-mini",
}
let proxyConfig: ProxyConfig = {
  enabled: false,
  url: "",
}

const getModelMappings = mock(() => modelMappings)
const setModelMappings = mock((nextModelMappings: Record<string, string>) => {
  modelMappings = nextModelMappings
  return modelMappings
})
const getProxyConfig = mock(() => proxyConfig)
const setProxyConfig = mock((nextProxyConfig: ProxyConfig) => {
  proxyConfig = nextProxyConfig
  return proxyConfig
})
await mock.module("~/lib/config", () => ({
  ...actualConfigModule,
  getModelMappings,
  getProxyConfig,
  setModelMappings,
  setProxyConfig,
}))

const { configRoutes } = await import("../src/routes/admin/config/route")

const createApp = () => {
  const app = new Hono()
  app.route("/admin/config", configRoutes)
  return app
}

beforeEach(() => {
  modelMappings = {
    "claude-opus-4-7": "gpt-5-mini",
  }
  proxyConfig = {
    enabled: false,
    url: "",
  }

  getModelMappings.mockClear()
  setModelMappings.mockClear()
  getProxyConfig.mockClear()
  setProxyConfig.mockClear()
  actualProxyModule.resetProxyForTests()
})

afterEach(() => {
  actualProxyModule.resetProxyForTests()
})

describe("config model mappings route", () => {
  test("returns the current advanced config snapshot", async () => {
    const app = createApp()
    const response = await app.request("/admin/config/model-mappings")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      configPath: actualPathsModule.PATHS.CONFIG_PATH,
      modelMappings: {
        "claude-opus-4-7": "gpt-5-mini",
      },
      proxy: {
        enabled: false,
        url: "",
      },
    })
    expect(getModelMappings).toHaveBeenCalledTimes(1)
    expect(getProxyConfig).toHaveBeenCalledTimes(1)
  })

  test("updates model mappings through the config API", async () => {
    const app = createApp()
    const response = await app.request("/admin/config/model-mappings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelMappings: {
          "claude-opus-4-7": "dash/qwen-plus",
          "claude-sonnet-4": "gpt-5.4",
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(setModelMappings).toHaveBeenCalledWith({
      "claude-opus-4-7": "dash/qwen-plus",
      "claude-sonnet-4": "gpt-5.4",
    })
    expect(setProxyConfig).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({
      configPath: actualPathsModule.PATHS.CONFIG_PATH,
      modelMappings: {
        "claude-opus-4-7": "dash/qwen-plus",
        "claude-sonnet-4": "gpt-5.4",
      },
      proxy: {
        enabled: false,
        url: "",
      },
    })
  })

  test("updates proxy settings through the config API", async () => {
    const app = createApp()
    const response = await app.request("/admin/config/model-mappings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelMappings: {},
        proxy: {
          enabled: true,
          url: "socks5://127.0.0.1:1080",
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(setModelMappings).toHaveBeenCalledWith({})
    expect(setProxyConfig).toHaveBeenCalledWith({
      enabled: true,
      url: "socks5://127.0.0.1:1080",
    })
    expect(actualProxyModule.getCopilotProxyDispatcher()).toBeDefined()
    expect(await response.json()).toEqual({
      configPath: actualPathsModule.PATHS.CONFIG_PATH,
      modelMappings: {},
      proxy: {
        enabled: true,
        url: "socks5://127.0.0.1:1080",
      },
    })
  })

  test("rejects invalid request bodies", async () => {
    const app = createApp()
    const response = await app.request("/admin/config/model-mappings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelMappings: "claude-opus-4-7",
      }),
    })

    expect(response.status).toBe(400)
    const json = (await response.json()) as {
      error: {
        message: string
        type: string
      }
    }
    expect(json.error.type).toBe("invalid_request_error")
    expect(json.error.message.length).toBeGreaterThan(0)
    expect(setModelMappings).not.toHaveBeenCalled()
    expect(setProxyConfig).not.toHaveBeenCalled()
  })

  test("rejects invalid enabled proxy settings", async () => {
    const app = createApp()
    const response = await app.request("/admin/config/model-mappings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelMappings: {},
        proxy: {
          enabled: true,
          url: "ftp://127.0.0.1:21",
        },
      }),
    })

    expect(response.status).toBe(400)
    const json = (await response.json()) as {
      error: {
        message: string
        type: string
      }
    }
    expect(json.error.type).toBe("invalid_request_error")
    expect(json.error.message).toBe(
      "Proxy URL must use http, https, socks, or socks5.",
    )
    expect(setModelMappings).not.toHaveBeenCalled()
    expect(setProxyConfig).not.toHaveBeenCalled()
  })

  test("does not expose the old public config path", async () => {
    const app = createApp()
    const response = await app.request("/config/model-mappings")

    expect(response.status).toBe(404)
  })
})
