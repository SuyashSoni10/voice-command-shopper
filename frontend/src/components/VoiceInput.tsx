import React, { useState, useEffect } from 'react';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface VoiceInputProps {
  onCommand: (command: string, language: string) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onCommand }) => {
  const [language, setLanguage] = useState('en-US');
  const [textFallback, setTextFallback] = useState('');
  
  const { 
    isListening, 
    transcript, 
    finalTranscript, 
    error, 
    isSupported, 
    startListening, 
    stopListening 
  } = useVoiceInput(language);

  // Track whether we've already dispatched for the current transcript
  const hasFiredRef = React.useRef(false);

  // Reset the guard when listening starts
  useEffect(() => {
    if (isListening) {
      hasFiredRef.current = false;
    }
  }, [isListening]);

  // When listening stops and we have a final transcript, fire the command ONCE
  useEffect(() => {
    if (!isListening && finalTranscript && !hasFiredRef.current) {
      hasFiredRef.current = true;
      onCommand(finalTranscript.trim(), language);
    }
  }, [isListening, finalTranscript, language, onCommand]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textFallback.trim()) {
      onCommand(textFallback.trim(), language);
      setTextFallback('');
    }
  };

  return (
    <div className="voice-input-container" style={{ padding: '20px', textAlign: 'center' }}>
      <div style={{ marginBottom: '10px' }}>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en-US">English (US)</option>
          <option value="es-ES">Spanish</option>
          <option value="hi-IN">Hindi</option>
        </select>
      </div>

      {!isSupported || error === 'not-allowed' ? (
        <form onSubmit={handleTextSubmit}>
          <input 
            type="text" 
            value={textFallback}
            onChange={(e) => setTextFallback(e.target.value)}
            placeholder="Type your command..."
            style={{ padding: '10px', width: '80%', fontSize: '16px' }}
          />
          <button type="submit" style={{ padding: '10px' }}>Send</button>
          {error && <p style={{ color: 'red', marginTop: '5px' }}>{error === 'not-allowed' ? 'Mic access denied. Using text fallback.' : error}</p>}
        </form>
      ) : (
        <div>
          <button 
            onClick={isListening ? stopListening : startListening}
            style={{
              padding: '20px',
              borderRadius: '50%',
              backgroundColor: isListening ? '#ff4444' : '#4CAF50',
              color: 'white',
              border: 'none',
              width: '80px',
              height: '80px',
              fontSize: '24px',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
            aria-label={isListening ? "Stop listening" : "Start listening"}
          >
            🎤
          </button>
          
          <div style={{ marginTop: '20px', minHeight: '30px' }}>
            {isListening ? (
              <p style={{ fontStyle: 'italic', color: '#666' }}>{transcript || 'Listening...'}</p>
            ) : error ? (
              <p style={{ color: 'red' }}>Error: {error}</p>
            ) : (
              <p style={{ color: '#888' }}>Tap the mic and speak</p>
            )}
          </div>
        </div>
      )}
      
      {/* Accessibility live region for announcing actions */}
      <div aria-live="polite" className="sr-only" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
        {isListening ? 'Microphone is on and listening' : 'Microphone is off'}
      </div>
    </div>
  );
};
