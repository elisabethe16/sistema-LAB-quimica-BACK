# Backend Lab5S - implantação

Este repositório deve permanecer com `package.json`, `server.js` e `index.js` na raiz.

Render:
- Root Directory: deixe em branco (raiz do repositório).
- Build Command: `npm install`
- Start Command: `npm start`

O `index.js` é mantido como compatibilidade caso o serviço ainda esteja configurado como `node index.js`.
O `package.json` declara bcryptjs e as demais dependências utilizadas.

Variáveis de ambiente no Render:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (preferível) ou SUPABASE_KEY

No Supabase, execute migration.sql se as colunas ainda não existirem e crie o bucket público `insumos-imagens`.
