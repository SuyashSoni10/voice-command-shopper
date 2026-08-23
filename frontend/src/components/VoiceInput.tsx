import React, { useState, useEffect } from 'react';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface VoiceInputProps {
  onCommand: (command: string, language: string) => void;
  isProcessing?: boolean;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onCommand, isProcessing = false }) => {
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
    <div className="voice-input">
      <select 
        className="voice-input__lang-select"
        value={language} 
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="en-US">English</option>
        <option value="es-ES">Español</option>
        <option value="hi-IN">हिन्दी</option>
      </select>

      {!isSupported || error === 'not-allowed' ? (
        <form className="voice-input__text-form" onSubmit={handleTextSubmit}>
          <input 
            className="voice-input__text-input"
            type="text" 
            value={textFallback}
            onChange={(e) => setTextFallback(e.target.value)}
            placeholder="Type a command..."
          />
          <button className="voice-input__text-submit" type="submit">Send</button>
          {error && (
            <p className="voice-input__error">
              {error === 'not-allowed' ? 'Mic access denied.' : error}
            </p>
          )}
        </form>
      ) : (
        <>
          <div className="voice-input__mic-wrapper">
            {isListening && <div className="voice-input__mic-ring" />}
            {isProcessing && <div className="voice-input__spinner" />}
            <button 
              className={`voice-input__mic ${isListening ? 'voice-input__mic--listening' : isProcessing ? 'voice-input__mic--processing' : 'voice-input__mic--idle'}`}
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing}
              aria-label={isProcessing ? "Processing" : isListening ? "Stop listening" : "Start listening"}
            >
              {isProcessing ? '⏳' : '🎤'}
            </button>
          </div>
          
          <div>
            {isListening ? (
              <p className="voice-input__live-text">{transcript || 'Listening...'}</p>
            ) : error ? (
              <p className="voice-input__error">{error}</p>
            ) : (
              <p className="voice-input__hint">Tap to speak</p>
            )}
          </div>
        </>
      )}
      
      {/* Accessibility live region */}
      <div aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {isListening ? 'Microphone is on' : 'Microphone is off'}
      </div>
    </div>
  );
};
