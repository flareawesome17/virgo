import { api } from '../client';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Upstream proxies exposed by the backend.
 *
 * These now require a signed-in user — the previous Express server left them
 * open, which let anyone who found the URL spend the project's AI and email
 * credits. The Google OAuth pair stays anonymous because it runs before a
 * token exists.
 */
export const servicesApi = {
  chat(messages: ChatMessage[], model?: string): Promise<unknown> {
    return api.post<unknown>('/chat', { body: { messages, model } });
  },

  sendEmail(to: string, subject: string, html: string): Promise<unknown> {
    return api.post<unknown>('/send-email', { body: { to, subject, html } });
  },

  googleAuthorizeUrl(redirectUri?: string): Promise<{ url?: string }> {
    return api.post<{ url?: string }>('/auth/google/authorize-url', {
      body: { redirectUri },
      anonymous: true,
    });
  },

  googleVerify(code: string, redirectUri: string): Promise<unknown> {
    return api.post<unknown>('/auth/google/verify', {
      body: { code, redirectUri },
      anonymous: true,
    });
  },
};
