// Supabase project config for community voting.
// The anon key is safe to publish: it only permits what the database's
// row-level-security policies allow (casting/withdrawing votes, reading
// aggregate counts). Both values come from the Supabase dashboard under
// Settings -> API. Leave empty to hide all voting UI.
export const SUPABASE = {
  url: '',
  key: '',
};
