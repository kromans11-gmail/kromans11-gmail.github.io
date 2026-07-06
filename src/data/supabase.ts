// Supabase project config for community voting.
// The publishable key is safe to publish: it only permits what the database's
// row-level-security policies allow (casting/withdrawing votes, reading
// aggregate counts). Both values come from the Supabase dashboard under
// Settings -> API Keys. Leave empty to hide all voting UI.
export const SUPABASE = {
  url: 'https://wdsvkegabcuzsukmamte.supabase.co',
  key: 'sb_publishable_t4YJl8OTgaj76fdj25-7NQ_iPXSRo2S',
};
