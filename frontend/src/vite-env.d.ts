/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DESKTOP_DOWNLOAD_URL?: string
  readonly VITE_WEB_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
