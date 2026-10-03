/** The controls Aurora has today, grouped the way a buyer asks about them. */
export const CONTROLS: ReadonlyArray<{
  group: string;
  items: ReadonlyArray<{ icon: string; title: string; body: string }>;
}> = [
  {
    group: 'AI you stay in charge of',
    items: [
      {
        icon: 'verified_user',
        title: 'Human approval on every AI action',
        body: 'Every action an agent proposes waits in one approval queue. Nothing goes out until a person approves it, edits it or dismisses it.',
      },
      {
        icon: 'manage_search',
        title: 'Reasons and sources shown',
        body: 'Each suggestion shows what the agent noticed and where it looked, so you can check its working before you decide.',
      },
    ],
  },
  {
    group: 'Your data, kept apart',
    items: [
      {
        icon: 'shield_lock',
        title: 'Workspace isolation',
        body: "Each workspace's data is kept apart in the database by row-level security, so one company never sees another's records.",
      },
      {
        icon: 'history',
        title: 'Audit log',
        body: 'Every change is written to an audit log, with who made it and when.',
      },
      {
        icon: 'https',
        title: 'Encrypted connections',
        body: 'Every page and API call travels over HTTPS.',
      },
    ],
  },
  {
    group: 'Who gets in',
    items: [
      {
        icon: 'phonelink_lock',
        title: 'Multi-factor sign-in',
        body: 'Multi-factor sign-in is available on every account.',
      },
      {
        icon: 'key',
        title: 'Single sign-on',
        body: "Sign in with Google or Microsoft, or with your organisation's own identity provider through enterprise single sign-on.",
      },
      {
        icon: 'group',
        title: 'Roles',
        body: 'Admins, managers, sales reps and users each see and do what their role allows.',
      },
    ],
  },
  {
    group: 'How we build it',
    items: [
      {
        icon: 'bug_report',
        title: 'Scanned on every change',
        body: 'Every change to Aurora is checked automatically for vulnerable dependencies and leaked secrets before it can ship.',
      },
    ],
  },
];
