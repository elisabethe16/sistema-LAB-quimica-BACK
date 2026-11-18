-- Execute no Supabase SQL Editor; não apaga dados existentes.
ALTER TABLE public.insumos_cadastrados ADD COLUMN IF NOT EXISTS imagem_url text;
ALTER TABLE public.insumos_cadastrados ADD COLUMN IF NOT EXISTS data_validade date;
ALTER TABLE public.insumos_cadastrados ADD COLUMN IF NOT EXISTS sem_data_validade boolean NOT NULL DEFAULT true;
ALTER TABLE public.insumos_cadastrados ADD COLUMN IF NOT EXISTS quantidade_minima_alerta integer NOT NULL DEFAULT 0;
UPDATE public.insumos_cadastrados SET quantidade_minima_alerta = 0 WHERE quantidade_minima_alerta IS NULL;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('insumos-imagens','insumos-imagens',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=true;
-- A chave service_role deve permanecer somente no Render.
