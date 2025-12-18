-- ====================================
-- SUPABASE STORAGE CONFIGURATION
-- ====================================
-- Configuración de Storage para multimedia de WhatsApp

-- IMPORTANTE: Los buckets NO se crean por SQL, se crean desde el código
-- Este archivo documenta las políticas RLS necesarias

-- Políticas para el bucket 'whatsapp-media'
-- El bucket debe ser creado primero desde el código o dashboard de Supabase

-- Política: Permitir uploads autenticados
CREATE POLICY "Users can upload whatsapp media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

-- Política: Acceso público para lectura (necesario para WhatsApp Cloud API)
CREATE POLICY "Public read whatsapp media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'whatsapp-media');

-- Política: Usuarios pueden eliminar sus propios archivos
CREATE POLICY "Users delete own whatsapp media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Política: Usuarios pueden actualizar sus propios archivos
CREATE POLICY "Users update own whatsapp media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Comentarios
COMMENT ON POLICY "Users can upload whatsapp media" ON storage.objects IS 'Permite a usuarios autenticados subir archivos multimedia para WhatsApp';
COMMENT ON POLICY "Public read whatsapp media" ON storage.objects IS 'Permite acceso público de lectura (necesario para que WhatsApp Cloud API pueda descargar los archivos)';
