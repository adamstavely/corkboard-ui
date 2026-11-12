#!/bin/sh
# Writes the app's runtime settings (see src/app/core/config.ts) from the container's environment, so one image
# runs against any identity provider.
set -eu
cat > /usr/share/nginx/html/config.json <<JSON
{ "oidc": { "authority": "${OIDC_AUTHORITY}", "clientId": "${OIDC_CLIENT_ID}" } }
JSON
