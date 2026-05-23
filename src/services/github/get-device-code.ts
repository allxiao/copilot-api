import { getOauthAppConfig, getOauthUrls } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { copilotFetch } from "~/lib/copilot-fetch"

export async function getDeviceCode(): Promise<DeviceCodeResponse> {
  const { clientId, headers, scope } = getOauthAppConfig()
  const { deviceCodeUrl } = getOauthUrls()

  const response = await copilotFetch(deviceCodeUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_id: clientId,
      scope,
    }),
  })

  if (!response.ok) throw new HTTPError("Failed to get device code", response)

  return (await response.json()) as DeviceCodeResponse
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}
