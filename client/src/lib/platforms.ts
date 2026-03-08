/** Canonical platform metadata shared across frontend components. */
export const PLATFORM_COLORS: Record<string, string> = {
  meetup: '#f65858',
  eventbrite: '#f05537',
  headfirst: '#2563eb',
};

export const PLATFORM_ICONS: Record<string, string> = {
  meetup: 'M',
  eventbrite: 'E',
  headfirst: 'H',
};

export const PLATFORM_FIELDS: Record<
  string,
  { key: string; label: string; type?: string }[]
> = {
  meetup: [{ key: 'apiKey', label: 'API Key' }],
  eventbrite: [{ key: 'token', label: 'Private Token' }],
  headfirst: [
    { key: 'email', label: 'Email' },
    { key: 'password', label: 'Password', type: 'password' },
  ],
};
