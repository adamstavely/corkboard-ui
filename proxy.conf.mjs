// Dev server proxy: /api → corkboard-api. Set API_URL when the API isn't on localhost:3700.
export default {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:3700',
    secure: false,
    pathRewrite: { '^/api': '' },
  },
};
