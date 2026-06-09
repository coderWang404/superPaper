import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AiProviderAdminApp } from './components/ai-provider-admin-app'

export function initAiProviderAdmin(root: HTMLElement): void {
  createRoot(root).render(
    createElement(AiProviderAdminApp, {
      csrfToken: root.dataset.csrfToken || '',
    })
  )
}
