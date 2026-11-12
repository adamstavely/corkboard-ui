#!/usr/bin/env bash
# Bring a Trench Coat release into vendor/, so installs and builds never need GitHub Packages.
#   npm run tc:vendor -- 0.17.8
# Fetching it is the one step that needs a token with read:packages (gh auth token works); commit the result.
set -euo pipefail
version="${1:?usage: npm run tc:vendor -- <version>}"
cd "$(dirname "$0")/.."

export NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$(gh auth token)}"
tgz="vendor/adamstavely-trenchcoat-${version}.tgz"
# The token goes on the command line: there's no .npmrc here to map NODE_AUTH_TOKEN to the registry.
npm pack "@adamstavely/trenchcoat@${version}" --pack-destination vendor --registry https://npm.pkg.github.com \
  "--//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" >/dev/null

# One release in the repo at a time.
find vendor -name 'adamstavely-trenchcoat-*.tgz' ! -path "$tgz" -delete
npm install --save-exact "@adamstavely/trenchcoat@file:${tgz}"
echo "Vendored ${tgz}"
