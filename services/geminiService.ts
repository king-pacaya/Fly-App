import { GoogleGenAI, Modality } from '@google/genai';

const getAiClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY no está configurada. Asegúrate de que la variable de entorno API_KEY esté disponible.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateAdContent = async (
  images: { base64: string; mimeType: string }[],
  userPrompt: string,
  style: string
): Promise<{ imageUrl: string; description: string }> => {
  const ai = getAiClient();
  
  const descriptionGeneratorPrompt = `
    Eres un director de arte y experto en marketing de clase mundial. Tu misión es rediseñar un anuncio a partir de las imágenes y el texto proporcionado.

    **Análisis de Contenido (Reglas estrictas):**
    1.  **PRIORIDAD 1 - TEXTO DEL USUARIO:** Analiza el "Contexto del usuario". Si contiene detalles del producto, información de contacto, precios u ofertas, esa es la fuente principal de texto que DEBES integrar en la nueva imagen.
    2.  **PRIORIDAD 2 - TEXTO EN IMAGEN:** Solo si el "Contexto del usuario" está vacío o es genérico (ej. "hazlo bonito"), entonces extrae CUALQUIER texto legible de las imágenes (nombres, ofertas, etc.).

    Contexto del usuario: "${userPrompt || 'Ninguno.'}"
    Estilo deseado: "${style}"

    **Tu Tarea (sigue este formato EXACTAMENTE):**
    ---TEXTO_A_INTEGRAR---
    [Aquí escribe el texto final que usarás en la imagen, basado en las reglas de prioridad de arriba. Si no hay texto de ninguna fuente, escribe "Ninguno."]
    ---DESCRIPCION---
    [Aquí escribe un texto de marketing corto en español para redes sociales (máximo 3 frases), usando el estilo deseado, emojis y hashtags. Debe ser coherente con el TEXTO_A_INTEGRAR.]
    ---PROMPT---
    [Aquí escribe un prompt detallado en INGLÉS para un generador de imágenes. El prompt debe:
    1. Rediseñar la imagen en el estilo deseado (si es 'Automático', elige el mejor estilo visual).
    2. Crear una escena profesional, de alta calidad y fotorealista o de diseño gráfico según corresponda.
    3. **CRÍTICO:** Integrar el texto de "TEXTO_A_INTEGRAR" de forma natural, estética y legible en el diseño de la nueva imagen. Si el texto es "Ninguno", no añadas texto.]
  `;
  
  const contentParts: any[] = images.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType }
  }));
  contentParts.push({ text: descriptionGeneratorPrompt });

  const descriptionResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: contentParts },
  });

  const responseText = descriptionResponse.text;
  
  const descriptionMatch = responseText.match(/---DESCRIPCION---([\s\S]*)---PROMPT---/);
  const promptMatch = responseText.match(/---PROMPT---([\s\S]*)/);

  const description = descriptionMatch ? descriptionMatch[1].trim() : 'No se pudo generar la descripción. Inténtalo de nuevo.';
  const imageGenerationPrompt = promptMatch ? promptMatch[1].trim() : `A professional advertisement image based on the user's provided images and context, in a ${style} style.`;

  if (!descriptionMatch || !promptMatch) {
      console.warn("La respuesta de Gemini no siguió el formato esperado:", responseText);
  }

  const imageResponse = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: imageGenerationPrompt,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/jpeg',
      aspectRatio: '1:1',
    },
  });

  if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
    const newImageBase64 = imageResponse.generatedImages[0].image.imageBytes;
    return {
      imageUrl: `data:image/jpeg;base64,${newImageBase64}`,
      description,
    };
  }

  throw new Error("No se pudo generar la imagen publicitaria.");
};

export const editAdImage = async (
  base64Image: string,
  mimeType: string,
  editPrompt: string
): Promise<string> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType,
                    },
                },
                {
                    text: `En español: ${editPrompt}`,
                },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
        }
    }
    
    throw new Error("No se pudo editar la imagen.");
};