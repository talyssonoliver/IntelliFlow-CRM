// lighthouserc.pg190.js — PG-190 case-settings Lighthouse (Path C)
// Dedicated LHCI config for auditing the authenticated /cases/case-settings page.
// Mirrors lighthouserc.authenticated.js but targets the PG-190 URL.
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/cases/case-settings'],
      numberOfRuns: 1,
      puppeteerScript: './tools/lighthouse/lhci-auth.js',
      settings: {
        preset: 'desktop',
        onlyCategories: ['performance'],
        throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './artifacts/lighthouse/PG-190',
    },
  },
};
