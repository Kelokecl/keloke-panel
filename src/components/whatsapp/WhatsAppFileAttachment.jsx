import { useState, useRef } from 'react';
import { Paperclip, X, Send, Loader, File, Image, Video } from 'lucide-react';

export default function WhatsAppFileAttachment({ onSendFile, disabled }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamaño (máx 16MB)
    if (file.size > 16 * 1024 * 1024) {
      alert('El archivo es demasiado grande. Máximo 16MB.');
      return;
    }

    setSelectedFile(file);

    // Crear preview si es imagen o video
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    }
  }

  function cancelSelection() {
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function sendFile() {
    if (!selectedFile) return;

    setIsSending(true);
    try {
      await onSendFile(selectedFile, caption);
      cancelSelection();
    } catch (err) {
      console.error('Error al enviar archivo:', err);
      alert('Error al enviar el archivo');
    } finally {
      setIsSending(false);
    }
  }

  function getFileIcon() {
    if (!selectedFile) return <File className="w-12 h-12" />;
    
    if (selectedFile.type.startsWith('image/')) {
      return <Image className="w-12 h-12 text-blue-500" />;
    } else if (selectedFile.type.startsWith('video/')) {
      return <Video className="w-12 h-12 text-purple-500" />;
    } else {
      return <File className="w-12 h-12 text-gray-500" />;
    }
  }

  // Vista: Archivo seleccionado
  if (selectedFile) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-lg p-4 border">
        <div className="flex items-start gap-3">
          {/* Preview */}
          <div className="flex-shrink-0">
            {preview && selectedFile.type.startsWith('image/') ? (
              <img 
                src={preview} 
                alt="Preview" 
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : preview && selectedFile.type.startsWith('video/') ? (
              <video 
                src={preview} 
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : (
              <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                {getFileIcon()}
              </div>
            )}
          </div>

          {/* Información y acciones */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500">
              {(selectedFile.size / 1024).toFixed(0)} KB
            </p>

            {/* Campo de caption (para imágenes/videos) */}
            {(selectedFile.type.startsWith('image/') || selectedFile.type.startsWith('video/')) && (
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Agregar leyenda..."
                className="w-full mt-2 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
          </div>

          {/* Botones */}
          <div className="flex gap-2">
            <button
              onClick={cancelSelection}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={sendFile}
              disabled={isSending}
              className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300"
            >
              {isSending ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Vista: Botón de clip
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
      >
        <Paperclip className="w-5 h-5" />
      </button>
    </>
  );
}
