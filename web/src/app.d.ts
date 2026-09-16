// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      browser: import('$lib/server/sessions').Browser | null;
    }
    interface PageData {
      origin: string;
      ogImage?: string;
      ogDescription?: string;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
