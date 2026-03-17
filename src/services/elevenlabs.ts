async transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    const formData = new FormData();
    // Especificar el formato correctamente
    formData.append('audio', audioBuffer, { 
      filename: 'audio.ogg',
      contentType: 'audio/ogg'  // Especificar el tipo MIME
    });
    formData.append('model_id', 'scribe_v1'); // Modelo de transcripción

    const response = await axios.post(
      `${BASE_URL}/speech-to-text`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'xi-api-key': this.apiKey
        },
        maxBodyLength: Infinity, // Permitir archivos grandes
        maxContentLength: Infinity
      }
    );

    if (response.data && response.data.text) {
      return response.data.text;
    } else {
      throw new Error('No se pudo transcribir el audio');
    }
  } catch (error) {
    console.error('❌ Error en ElevenLabs STT:', error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    throw error;
  }
}
