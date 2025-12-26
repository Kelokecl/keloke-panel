import { useEffect, useState, useRef } from 'react';
import { Paperclip, X, Send, Loader, File, Image, Video } from 'lucide-react';

const MAX_FILE_BYTES = 16 * 1024 * 1024; // 16MB

export default function WhatsAppFileAttachment({ onSendFile, disabled }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);

  // Limpieza de ObjectURL (video) para evitar leaks
  useEffect(() => {
    return () => {
      if (preview && typeof preview === 'string' && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      alert('El archivo es demasiado grande. Máximo 16MB.');
      return;
    }

    // reset preview anterior
    if (preview && typeof preview === 'string' && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }

    setSelectedFile(file);

    // Preview si es imagen o video
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  function cancelSelection() {
    if (preview && typeof preview === 'string' && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function sendFile() {
    if (!selectedFile) return;

    setIsSending(true);
    try {
      await onSendFile(selectedFile, caption);
      cancelSelection();
    } catch (err) {
      console.error('Error al enviar archivo:', err);
      alert('Error al enviar el archivo: ' + (err?.message || err));
    } finally {
      setIsSending(false);
    }
  }

  function getFileIcon() {
    if (!selectedFile) return <File className="w-12 h-12" />;

    if (selectedFile.type.startsWith('image/')) return <Image className="w-12 h-12 text-blue-500" />;
    if (selectedFile.type.startsWith('video/')) return <Video className="w-12 h-12 text-purple-500" />;
    return <File className="w-12 h-12 text-gray-500" />;
  }

  if (selectedFile) {
    const isImage = selectedFile.type.startsWith('image/');
    const isVideo = selectedFile.type.startsWith('video/');
    const showCaption = isImage || isVideo || true; // documentos también pueden llevar caption (WhatsApp lo soporta)

    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-lg p-4 border">
        <div className="flex items-start gap-3">
          {/* Preview */}
          <div className="flex-shrink-0">
            {preview && isImage ? (
              <img
                src={preview}
                alt="Preview"
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : preview && isVideo ? (
              <video
                src={preview}
                className="w-24 h-24 object-cover rounded-lg"
                muted
              />
            ) : (
              <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                {getFileIcon()}
              </div>
            )}
          </div>

          {/* Info + caption */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(0)} KB</p>

            {showCaption && (
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Agregar leyenda (opcional)..."
                className="w-full mt-2 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
          </div>

          {/* Botones */}
          <div className="flex gap-2">
            <button
              onClick={cancelSelection}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
              disabled={isSending}
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={sendFile}
              disabled={isSending}
              className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300"
              title="Enviar"
            >
              {isSending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="p-3 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
        title="Adjuntar archivo"
      >
        <Paperclip className="w-5 h-5" />
      </button>
    </>
  );
}
