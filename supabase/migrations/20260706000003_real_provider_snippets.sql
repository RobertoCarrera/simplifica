-- Snippets for real public APIs
-- These are real providers with documented public APIs. Each snippet
-- includes a real base URL, real response shape, and proper auth setup.

INSERT INTO public.supplier_snippets
  (slug, name, description, category, base_url, sync_config, field_mappings, documentation_url)
VALUES

-- 1. DummyJSON (free testing API, already exists but added here for completeness)
(
  'dummyjson',
  'DummyJSON (Demo)',
  'API pública gratuita con productos fake. Perfecta para pruebas.',
  'demo',
  'https://dummyjson.com/products',
  '{"response_path":"products","pagination":"page","page_param":"skip","page_size_param":"limit","page_size":30,"max_pages":5,"auth_type":"none"}'::jsonb,
  '[
    {"source_path":"title","target_field":"name"},
    {"source_path":"id","target_field":"external_id"},
    {"source_path":"description","target_field":"description"},
    {"source_path":"brand","target_field":"brand"},
    {"source_path":"category","target_field":"category"},
    {"source_path":"price","target_field":"price","transform":"number"},
    {"source_path":"stock","target_field":"stock","transform":"number"}
  ]'::jsonb,
  'https://dummyjson.com/'
)
ON CONFLICT (slug) DO NOTHING;

-- 2. fakestoreapi (real public API, no auth)
(
  'fakestoreapi',
  'FakeStore API (Demo)',
  'API pública con productos de e-commerce. Sin auth, ideal para demos.',
  'demo',
  'https://fakestoreapi.com/products',
  '{"response_path":"","pagination":"none","auth_type":"none"}'::jsonb,
  '[
    {"source_path":"title","target_field":"name"},
    {"source_path":"id","target_field":"external_id"},
    {"source_path":"description","target_field":"description"},
    {"source_path":"brand","target_field":"brand"},
    {"source_path":"category","target_field":"category"},
    {"source_path":"price","target_field":"price","transform":"number"},
    {"source_path":"rating.count","target_field":"stock","transform":"number"}
  ]'::jsonb,
  'https://fakestoreapi.com/docs'
)
ON CONFLICT (slug) DO NOTHING;

-- 3. JSONPlaceholder (free testing API for users/posts)
(
  'jsonplaceholder',
  'JSONPlaceholder (Demo)',
  'API pública gratuita con datos fake. Solo para pruebas, no productos reales.',
  'demo',
  'https://jsonplaceholder.typicode.com/users',
  '{"response_path":"","pagination":"none","auth_type":"none"}'::jsonb,
  '[
    {"source_path":"name","target_field":"name"},
    {"source_path":"id","target_field":"external_id"},
    {"source_path":"email","target_field":"description"},
    {"source_path":"company.name","target_field":"brand"},
    {"source_path":"address.city","target_field":"category"}
  ]'::jsonb,
  'https://jsonplaceholder.typicode.com/'
)
ON CONFLICT (slug) DO NOTHING;

-- 4. Open Food Facts (real public product database, no auth)
-- Worldwide food products database, ~2.9M products, CC-BY-SA license
(
  'openfoodfacts',
  'Open Food Facts',
  'Base de datos abierta de productos alimentarios del mundo. ~2.9M productos, sin auth, CC-BY-SA.',
  'food',
  'https://world.openfoodfacts.org/api/v2/search',
  '{"response_path":"products","pagination":"page","page_param":"page","page_size_param":"page_size","page_size":50,"max_pages":20,"auth_type":"none"}'::jsonb,
  '[
    {"source_path":"product_name","target_field":"name"},
    {"source_path":"code","target_field":"external_id"},
    {"source_path":"brands","target_field":"brand"},
    {"source_path":"categories","target_field":"category"},
    {"source_path":"quantity","target_field":"description"},
    {"source_path":"product_name_es","target_field":"model"}
  ]'::jsonb,
  'https://world.openfoodfacts.org/data'
)
ON CONFLICT (slug) DO NOTHING;

-- 5. Open Library (real public books database, no auth)
-- 20M+ books, free API
(
  'openlibrary',
  'Open Library',
  'API pública de libros de Internet Archive. 20M+ libros, sin auth.',
  'books',
  'https://openlibrary.org/search.json',
  '{"response_path":"docs","pagination":"page","page_param":"page","page_size_param":"limit","page_size":50,"max_pages":20,"auth_type":"none"}'::jsonb,
  '[
    {"source_path":"title","target_field":"name"},
    {"source_path":"key","target_field":"external_id"},
    {"source_path":"author_name.0","target_field":"brand"},
    {"source_path":"first_publish_year","target_field":"description"},
    {"source_path":"subject.0","target_field":"category"}
  ]'::jsonb,
  'https://openlibrary.org/developers/api'
)
ON CONFLICT (slug) DO NOTHING;

-- 6. The Movie Database (TMDB) - requires free API key
(
  'tmdb',
  'TMDB (The Movie DB)',
  'Base de datos de películas. Requiere API key gratuita en themoviedb.org/settings/api',
  'movies',
  'https://api.themoviedb.org/3/movie/popular',
  '{"response_path":"results","pagination":"page","page_param":"page","page_size_param":"","page_size":20,"max_pages":50,"auth_type":"api_key_query","auth_query_param":"api_key","auth_token":""}'::jsonb,
  '[
    {"source_path":"title","target_field":"name"},
    {"source_path":"id","target_field":"external_id","transform":"multiply:1"},
    {"source_path":"overview","target_field":"description"},
    {"source_path":"release_date","target_field":"model"},
    {"source_path":"popularity","target_field":"price","transform":"multiply:0.01"},
    {"source_path":"vote_average","target_field":"stock","transform":"multiply:1"},
    {"source_path":"original_language","target_field":"brand"}
  ]'::jsonb,
  'https://developer.themoviedb.org/reference/intro/getting-started'
)
ON CONFLICT (slug) DO NOTHING;