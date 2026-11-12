import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { provideApiConfiguration } from './api/generated/api-configuration';
import { Auth } from './core/auth';
import { authInterceptor } from './core/auth.interceptor';
import { loadConfig } from './core/config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // The dev server proxies /api to corkboard-api (proxy.conf.mjs); in the image nginx does.
    provideApiConfiguration('/api'),
    provideAppInitializer(() => {
      const auth = inject(Auth);
      return loadConfig().then((config) => auth.init(config.oidc));
    }),
  ],
};
