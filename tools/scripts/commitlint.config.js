/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type enum
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only changes
        'style',    // Changes that don't affect code meaning (formatting, etc)
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf',     // Performance improvement
        'test',     // Adding missing tests or correcting existing tests
        'build',    // Changes to build system or external dependencies
        'ci',       // Changes to CI configuration files and scripts
        'chore',    // Other changes that don't modify src or test files
        'revert',   // Reverts a previous commit
      ],
    ],
    // Subject case - sentence case, start case, pascal case
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    // Subject max length
    'subject-max-length': [2, 'always', 100],
    // Subject min length
    'subject-min-length': [2, 'always', 10],
    // Subject empty
    'subject-empty': [2, 'never'],
    // Subject full stop
    'subject-full-stop': [2, 'never', '.'],
    // Type case
    'type-case': [2, 'always', 'lower-case'],
    // Type empty
    'type-empty': [2, 'never'],
    // Scope case
    'scope-case': [2, 'always', 'lower-case'],
    // Scope enum - optional but recommended scopes
    'scope-enum': [
      1,
      'always',
      [
        'api',
        'web',
        'ai-worker',
        'domain',
        'db',
        'infra',
        'docs',
        'tests',
        'ci',
        'deps',
        'auth',
        'crm',
        'intelligence',
        'platform',
      ],
    ],
    // Body max line length
    'body-max-line-length': [2, 'always', 100],
    // Footer max line length
    'footer-max-line-length': [2, 'always', 100],
  },
  prompt: {
    messages: {
      type: "Select the type of change you're committing:",
      scope: 'Select the scope of this change (optional):',
      subject: 'Write a short description (imperative mood):',
      body: 'Provide a longer description (optional):',
      breaking: 'List any breaking changes (optional):',
      footer: 'List any issue references (optional, e.g., "fixes #123"):',
      confirmCommit: 'Are you sure you want to proceed with the commit above?',
    },
    questions: {
      type: {
        description: "Select the type of change you're committing",
        enum: {
          feat: {
            description: 'A new feature',
            title: 'Features',
            emoji: '✨',
          },
          fix: {
            description: 'A bug fix',
            title: 'Bug Fixes',
            emoji: '🐛',
          },
          docs: {
            description: 'Documentation only changes',
            title: 'Documentation',
            emoji: '📚',
          },
          style: {
            description:
              'Changes that do not affect the meaning of the code (white-space, formatting, etc)',
            title: 'Styles',
            emoji: '💎',
          },
          refactor: {
            description: 'A code change that neither fixes a bug nor adds a feature',
            title: 'Code Refactoring',
            emoji: '📦',
          },
          perf: {
            description: 'A code change that improves performance',
            title: 'Performance Improvements',
            emoji: '🚀',
          },
          test: {
            description: 'Adding missing tests or correcting existing tests',
            title: 'Tests',
            emoji: '🚨',
          },
          build: {
            description:
              'Changes that affect the build system or external dependencies',
            title: 'Builds',
            emoji: '🛠',
          },
          ci: {
            description:
              'Changes to our CI configuration files and scripts',
            title: 'Continuous Integrations',
            emoji: '⚙️',
          },
          chore: {
            description: "Other changes that don't modify src or test files",
            title: 'Chores',
            emoji: '♻️',
          },
          revert: {
            description: 'Reverts a previous commit',
            title: 'Reverts',
            emoji: '🗑',
          },
        },
      },
    },
  },
};
