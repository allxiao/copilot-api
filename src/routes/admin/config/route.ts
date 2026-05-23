import { Hono } from "hono"
import { z } from "zod"

import {
  getModelMappings,
  getProxyConfig,
  setModelMappings,
  setProxyConfig,
  type ProxyConfig,
} from "~/lib/config"
import { forwardError } from "~/lib/error"
import { PATHS } from "~/lib/paths"
import { initConfiguredProxy } from "~/lib/proxy"

export const configRoutes = new Hono()

const supportedProxyProtocols = new Set([
  "http:",
  "https:",
  "socks:",
  "socks5:",
])

const proxyRequestSchema = z
  .object({
    enabled: z.boolean(),
    url: z.string(),
  })
  .superRefine((proxy, ctx) => {
    const proxyUrl = proxy.url.trim()
    if (!proxy.enabled) {
      return
    }

    if (!proxyUrl) {
      ctx.addIssue({
        code: "custom",
        message: "Proxy URL is required when proxy is enabled.",
        path: ["url"],
      })
      return
    }

    try {
      const url = new URL(proxyUrl)
      if (!supportedProxyProtocols.has(url.protocol)) {
        ctx.addIssue({
          code: "custom",
          message: "Proxy URL must use http, https, socks, or socks5.",
          path: ["url"],
        })
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Proxy URL must be a valid URL.",
        path: ["url"],
      })
    }
  })

const modelMappingsRequestSchema = z.object({
  modelMappings: z.record(z.string(), z.string()),
  proxy: proxyRequestSchema.optional(),
})

type ProxySettings = z.infer<typeof proxyRequestSchema>

function normalizeProxyConfig(proxy: ProxyConfig | undefined): ProxySettings {
  if (typeof proxy === "string") {
    const proxyUrl = proxy.trim()
    return {
      enabled: proxyUrl.length > 0,
      url: proxyUrl,
    }
  }

  return {
    enabled: proxy?.enabled === true,
    url: proxy?.url?.trim() ?? "",
  }
}

configRoutes.get("/model-mappings", (c) => {
  return c.json({
    configPath: PATHS.CONFIG_PATH,
    modelMappings: getModelMappings(),
    proxy: normalizeProxyConfig(getProxyConfig()),
  })
})

configRoutes.post("/model-mappings", async (c) => {
  try {
    const parseResult = modelMappingsRequestSchema.safeParse(await c.req.json())
    if (!parseResult.success) {
      return c.json(
        {
          error: {
            message:
              parseResult.error.issues[0]?.message ?? "Invalid request body.",
            type: "invalid_request_error",
          },
        },
        400,
      )
    }

    const updatedModelMappings = setModelMappings(
      parseResult.data.modelMappings,
    )
    let updatedProxy = normalizeProxyConfig(getProxyConfig())

    if (parseResult.data.proxy) {
      const nextProxy = normalizeProxyConfig(parseResult.data.proxy)
      updatedProxy = normalizeProxyConfig(setProxyConfig(nextProxy))
      initConfiguredProxy(updatedProxy)
    }

    return c.json({
      configPath: PATHS.CONFIG_PATH,
      modelMappings: updatedModelMappings,
      proxy: updatedProxy,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})
