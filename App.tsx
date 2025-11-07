import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fileToBase64 } from './utils/fileUtils';
import { generateAdContent, editAdImage } from './services/geminiService';
import Spinner from './components/Spinner';

type AppStep = 'upload' | 'processing' | 'result' | 'editing';
type Generation = {
    imageUrl: string;
    description: string;
}
type SavedProject = {
  id: string;
  generations: Generation[];
  timestamp: string;
  previewImage: string;
};

const ActionButton: React.FC<{icon: string, title: string, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void, className?: string, disabled?: boolean}> = 
({ icon, title, onClick, className, disabled }) => (
    <button
        onClick={onClick}
        title={title}
        disabled={disabled}
        className={`bg-white/80 text-bordo hover:bg-crema disabled:text-slate-400 disabled:cursor-not-allowed w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md border border-slate-200/50 ${className}`}
    >
        <i className={`fas ${icon} text-lg`}></i>
    </button>
);

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('upload');
  const [error, setError] = useState<string>('');
  
  // State
  const [inputFiles, setInputFiles] = useState<File[]>([]);
  const [inputImagePreviews, setInputImagePreviews] = useState<string[]>([]);
  const [initialPrompt, setInitialPrompt] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('Automático');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // History
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      const storedProjects = localStorage.getItem('savedProjects');
      if (storedProjects) {
        setSavedProjects(JSON.parse(storedProjects));
      }
    } catch (e) {
      console.error("No se pudo cargar el historial:", e);
    }
  }, []);

  const saveCurrentProject = useCallback((updatedGenerations: Generation[]) => {
    if (updatedGenerations.length === 0 || !currentProjectId) return;

    const updatedProjects = savedProjects.filter(p => p.id !== currentProjectId);
    const newProject: SavedProject = {
        id: currentProjectId,
        generations: updatedGenerations,
        timestamp: new Date().toLocaleString('es-ES'),
        previewImage: updatedGenerations[0].imageUrl
    };
    
    const finalProjects = [newProject, ...updatedProjects];
    setSavedProjects(finalProjects);
    try {
        localStorage.setItem('savedProjects', JSON.stringify(finalProjects));
    } catch(e) {
        console.error("No se pudo guardar el proyecto automáticamente:", e);
    }
  }, [currentProjectId, savedProjects]);

  const handleFileChange = (files: FileList | null) => {
    if (files) {
      const fileArray = Array.from(files);
      setInputFiles(prev => [...prev, ...fileArray]);
      const previewUrls = fileArray.map(file => URL.createObjectURL(file));
      setInputImagePreviews(prev => [...prev, ...previewUrls]);
    }
  };
  
  const handlePaste = useCallback((event: ClipboardEvent) => {
    if (step !== 'upload') return;
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
        setInputFiles(prev => [...prev, ...imageFiles]);
        const previewUrls = imageFiles.map(file => URL.createObjectURL(file));
        setInputImagePreviews(prev => [...prev, ...previewUrls]);
    }
  }, [step]);
  
  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);
  
  const callGenerateAPI = async () => {
    setError('');
    try {
        const base64Images = await Promise.all(inputFiles.map(fileToBase64));
        const result = await generateAdContent(base64Images, initialPrompt, selectedStyle);
        return result;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
        setError(`Error al generar contenido: ${errorMessage}`);
        setStep('upload'); 
        return null;
    }
  }

  const handleGenerate = async () => {
    if (inputFiles.length === 0) {
      setError('Por favor, sube al menos una imagen.');
      return;
    }
    setStep('processing');
    const newId = new Date().toISOString();
    setCurrentProjectId(newId);
    
    const result = await callGenerateAPI();
    if (result) {
        const newGenerations = [result];
        setGenerations(newGenerations);
        saveCurrentProject(newGenerations); // Trigger auto-save
        setStep('result');
    } else {
        setCurrentProjectId(null); // Reset on failure
    }
  };

  const handleGenerateAnother = async () => {
     setStep('processing');
     const result = await callGenerateAPI();
     if(result) {
        const updatedGenerations = [...generations, result];
        setGenerations(updatedGenerations);
        saveCurrentProject(updatedGenerations); // Trigger auto-save
        setStep('result');
     }
  }
  
  const handleEdit = async () => {
    if (!editPrompt || generations.length === 0) return;
    const lastGeneration = generations[generations.length - 1];
    
    setStep('editing');
    setError('');
    try {
      const response = await fetch(lastGeneration.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], "temp_image", {type: blob.type});
      const { base64, mimeType } = await fileToBase64(file);
      const newImageUrl = await editAdImage(base64, mimeType, editPrompt);
      
      const updatedGenerations = [...generations];
      updatedGenerations[updatedGenerations.length-1].imageUrl = newImageUrl;
      setGenerations(updatedGenerations);
      saveCurrentProject(updatedGenerations); // Trigger auto-save

      setEditPrompt('');
      setStep('result');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`Error al editar imagen: ${errorMessage}`);
      setStep('result');
    }
  }

  const handleReset = () => {
    setInputFiles([]);
    setInputImagePreviews([]);
    setInitialPrompt('');
    setSelectedStyle('Automático');
    setGenerations([]);
    setEditPrompt('');
    setError('');
    setCurrentProjectId(null);
    setStep('upload');
  };
  
  const downloadImage = (imageUrl: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `publicidad-ia-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  const copyTextToClipboard = (text: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      alert("¡Descripción copiada al portapapeles!");
    }
  };
  
  const handleDeleteProject = (projectId: string) => {
    const updatedProjects = savedProjects.filter(p => p.id !== projectId);
    setSavedProjects(updatedProjects);
    try {
        localStorage.setItem('savedProjects', JSON.stringify(updatedProjects));
    } catch(e) {
        console.error("No se pudo eliminar el proyecto:", e);
    }
  }

  const renderUploadStep = () => {
    const styles = ['Automático', 'Lujoso y Exclusivo', 'Fresco y Natural', 'Tecnológico y Moderno', 'Cálido y Acogedor', 'Divertido y Vibrante', 'Profesional y Corporativo'];
    
    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 animate-fade-in">
           <header className="text-center mb-4">
              <h1 className="text-4xl md:text-5xl font-extrabold text-bordo">
                Estudio Creativo IA
              </h1>
              <p className="mt-2 text-lg text-slate-500 max-w-2xl mx-auto">
                Transforma las fotos de tus productos en anuncios profesionales con un solo clic.
              </p>
            </header>
           <div 
            className="w-full p-10 border-2 border-dashed border-mostaza/50 rounded-xl text-center bg-white cursor-pointer hover:border-mostaza hover:bg-crema/20 transition-all"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files); }}
          >
            <input type="file" ref={fileInputRef} onChange={(e) => handleFileChange(e.target.files)} accept="image/*" multiple className="hidden" />
            <i className="fas fa-images text-5xl text-mostaza"></i>
            <p className="mt-4 text-xl font-semibold text-bordo">Arrastra tus imágenes aquí</p>
            <p className="text-slate-500 mt-1">o haz clic para seleccionar. También puedes pegarlas (Ctrl+V).</p>
          </div>
          
          {inputImagePreviews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {inputImagePreviews.map((src, index) => <img key={index} src={src} className="w-full h-24 object-cover rounded-md border" alt={`preview ${index}`}/>)}
            </div>
          )}

          <div>
             <label className="block text-sm font-medium text-bordo mb-2">1. Elige un estilo</label>
             <div className="flex flex-wrap gap-2">
                {styles.map(style => (
                    <button
                        key={style}
                        onClick={() => setSelectedStyle(style)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                            selectedStyle === style
                            ? 'bg-bordo text-white'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
                        }`}
                    >
                        {style}
                    </button>
                ))}
            </div>
          </div>
    
          <div>
            <label htmlFor="initialPrompt" className="block text-sm font-medium text-bordo mb-2">2. Pega la descripción existente o da contexto (opcional)</label>
            <textarea
              id="initialPrompt"
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="Ej: Pega aquí la descripción de tu post de Facebook. La IA priorizará este texto para la imagen."
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-mostaza bg-white"
              rows={4}
            />
          </div>
    
          <button onClick={handleGenerate} disabled={step === 'processing'} className="w-full bg-bordo hover:bg-opacity-90 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-bordo/50">
            {step === 'processing' ? <><Spinner className="text-white"/> Procesando...</> : 'Generar Contenido'}
          </button>
    
          {error && <p className="text-red-500 text-center">{error}</p>}
        </div>
      );
  }

  const renderResultStep = () => (
    <div className="w-full max-w-7xl mx-auto flex flex-col items-center pb-28">
        <div className="w-full max-w-2xl flex flex-col gap-8">
            {generations.map((gen, index) => (
                <div key={index} className="bg-white p-4 sm:p-5 rounded-2xl shadow-lg border border-slate-200/80 animate-fade-in">
                    <div className="w-full aspect-square bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden relative group">
                         {(step === 'processing' || (step === 'editing' && index === generations.length -1)) && <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10"><Spinner className="text-white h-8 w-8"/></div>}
                         <img src={gen.imageUrl} alt={`Imagen generada ${index + 1}`} className="w-full h-full object-contain" />
                         <ActionButton 
                            icon="fa-download" 
                            title="Descargar Imagen" 
                            onClick={() => downloadImage(gen.imageUrl)}
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                         />
                    </div>
                    <div className="mt-4 flex gap-4 items-center">
                         <ActionButton 
                           icon="fa-clipboard"
                           title="Copiar Descripción"
                           onClick={() => copyTextToClipboard(gen.description)}
                           className="w-9 h-9 flex-shrink-0"
                        />
                        <div className="flex-grow p-3 bg-crema/20 border border-crema rounded-lg">
                           <p className="whitespace-pre-wrap font-sans text-slate-700 text-sm">{gen.description}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/70 backdrop-blur-sm border-t border-slate-200/80 z-30">
            <div className="max-w-2xl mx-auto flex items-center gap-2">
                 <div className="flex items-center gap-2">
                    <ActionButton icon="fa-wand-magic-sparkles" title="Generar otra variación" onClick={handleGenerateAnother} disabled={step !== 'result'}/>
                    <ActionButton icon="fa-history" title="Ver Historial" onClick={() => setIsHistoryOpen(true)} />
                    <ActionButton icon="fa-plus" title="Crear Nuevo Anuncio" onClick={handleReset}/>
                 </div>
                 <input 
                    type="text"
                    id="editPrompt"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Edita la última imagen... ej: cambia el fondo a una playa"
                    className="flex-grow p-3 border border-slate-300 rounded-full focus:ring-2 focus:ring-mostaza shadow-sm mx-2"
                    onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                  />
                  <ActionButton 
                    icon="fa-paper-plane" 
                    title="Aplicar Edición" 
                    onClick={handleEdit} 
                    disabled={!editPrompt || step === 'editing'}
                  />
            </div>
        </div>
    </div>
  );
  
  const HistoryModal = () => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsHistoryOpen(false)}>
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b flex justify-between items-center">
            <h2 className="text-xl font-bold text-bordo">Historial de Proyectos</h2>
            <button onClick={() => setIsHistoryOpen(false)} className="text-slate-500 hover:text-bordo text-2xl font-bold">&times;</button>
        </header>
        <div className="overflow-y-auto p-6">
            {savedProjects.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Tu historial está vacío. ¡Empieza a crear!</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedProjects.map(project => (
                        <div key={project.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-slate-200 group relative">
                            <img src={project.previewImage} alt="Creación guardada" className="w-full h-40 object-cover"/>
                             <button 
                                title="Eliminar Proyecto"
                                onClick={() => handleDeleteProject(project.id)}
                                className="absolute top-2 right-2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                              >
                               <i className="fas fa-trash-alt text-xs"></i>
                             </button>
                            <div className="p-4">
                               <p className="text-xs text-slate-400 mb-2">{project.timestamp}</p>
                               <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-3">{project.generations[0].description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex-grow">
        <div className="container mx-auto p-4 sm:p-6 md:p-8">
          <main className="min-h-[60vh]">
            {(step === 'upload' || step === 'processing') && renderUploadStep()}
            {(step === 'result' || step === 'editing') && renderResultStep()}
          </main>
        </div>
      </div>
      {isHistoryOpen && <HistoryModal />}
    </>
  );
};

export default App;
