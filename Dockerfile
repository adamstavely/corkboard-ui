# syntax=docker/dockerfile:1.10
# Corkboard frontend: build with Node, serve the static app with nginx.
#   docker build -t corkboard-ui .
# Trench Coat comes from vendor/, so the build needs no registry token.

FROM node:24-alpine AS build
WORKDIR /app
# npm 11.4 crashes resolving Angular trees; match package.json's packageManager.
RUN npm install -g npm@11.21.2
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Where /api is proxied to.
ENV API_UPSTREAM=http://corkboard-api:3000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/corkboard/browser /usr/share/nginx/html
EXPOSE 8080
