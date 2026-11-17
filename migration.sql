-- Execute no Supabase SQL Editor antes de publicar a atualização.
ALTER TABLE public.insumos_cadastrados
  ADD COLUMN IF NOT EXISTS imagem_url text,
  ADD COLUMN IF NOT EXISTS data_validade date,
  ADD COLUMN IF NOT EXISTS sem_data_validade boolean NOT NULL DEFAULT true;
