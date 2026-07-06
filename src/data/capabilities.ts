export const CAPABILITY_LABELS: Record<string, string> = {
  offline: 'Works offline',
  push: 'Push notifications',
  'no-account': 'No account required',
  lightweight: 'Lightweight',
  'media-keys': 'Media key support',
  'file-system': 'Local file access',
  geolocation: 'Uses location',
};

export function capabilityLabel(key: string): string {
  return CAPABILITY_LABELS[key] ?? key;
}
