# Corrigir erro de RLS no upload

No Render, em **Environment**, configure `SUPABASE_SERVICE_ROLE_KEY` com a **service_role / secret key** do mesmo projeto Supabase de `SUPABASE_URL`. Nunca publique essa chave no GitHub, frontend ou Vercel. Se `SUPABASE_KEY` estiver apontando para `anon`/`publishable`, não serve para upload administrativo sem políticas específicas.

No Supabase Storage, confirme que existe o bucket `insumos-imagens` e que está público **apenas para leitura** das URLs. Bucket público NÃO concede permissão de escrita.

Depois de atualizar a variável no Render, salve e faça deploy novamente. Não crie política de INSERT aberta para `anon` para contornar RLS. A API atual ainda precisa de autenticação/autorização de verdade nas rotas administrativas: manter a service role só no servidor é necessário, mas não suficiente para produção.
