// Public by design: the anon key grants only what RLS allows. Local values from `supabase status`.
export const SUPABASE_URL = "https://krmcldslrcsbenwpbyqo.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybWNsZHNscmNzYmVud3BieXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMjYzODQsImV4cCI6MjEwNzkwMjM4NH0.23HjTpCw7x3M1IhsPVnn3NrE-VB9TCD34aEfDYBuDIU";
// Bump together with CACHE in sw.js on every deploy.
export const APP_VERSION = '5';
// Web Push public key (public by design). Empty until the key pair is made for the hosted project (see context/gotchas.md).
export const VAPID_PUBLIC_KEY = 'BFXTiiSklguwR0Izo6avYmiVrZxs1_GKJtqigpen6DJtXVB6NE7c94uWjITvZHw5aKb1MdvW8YxiQVtCZUtQ6H8';
