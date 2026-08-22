import React, { useEffect, useMemo, useRef, useState } from 'react';

const QUICK_PROMPTS = [
  'How do I plan a route?',
  'Show me pin tips',
  'What can this app do?',
  'Open demo mode',
  'Help me with 3D view'
];

function makeMessage(role, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text
  };
}

function buildReply(message, context) {
  const text = String(message || '').trim().toLowerCase();
  const appName = context?.appName || 'the app';
  const currentMood = context?.currentMood || 'Reflective';
  const routeModeLabel = context?.routeModeLabel || 'Walking';
  const weatherLabel = context?.weatherLabel || 'Unknown';
  const timeOfDay = context?.timeOfDay || 'Daytime';
  const routeSummary = context?.routeSummary || 'No active route yet.';
  const selectedPinName = context?.selectedPinName || '';
  const authLabel = context?.authLabel || 'Not signed in';
  const activeMood = context?.activeFilters?.mood || 'All';
  const activeBudget = context?.activeFilters?.budget || 'All';

  if (!text) {
    return `I’m ready. Ask me about routes, pins, 3D view, demo mode, auth, or profile settings.`;
  }

  if (/(what can you do|help|how do i use|guide|commands)/.test(text)) {
    return `I can guide you through ${appName}, explain the map controls, and jump you to the right tab. Try asking about routes, place pins, 3D mode, demo data, login, or profile editing.`;
  }

  if (/(route|directions|plan a trip|travel|navigate)/.test(text)) {
    return `Use the Dashboard tab for route setup. Your current route mode is ${routeModeLabel}, and the progress summary says: ${routeSummary} If you want a fresh start, I can reset the filters too.`;
  }

  if (/(pin|spot|place|save a vibe|save pin|map actions)/.test(text)) {
    return `Right-click the map to open Map Actions, then add a place pin or pin a start and destination. If you already selected a spot, I’m seeing ${selectedPinName || 'a place on the map'} in context.`;
  }

  if (/(3d|terrain|building|fly|perspective)/.test(text)) {
    return `Open the 3D Navigator card to toggle perspective, terrain, buildings, or the fly-through mode. It works best after a route is set, but you can turn it on anytime.`;
  }

  if (/(demo|sample|seed)/.test(text)) {
    return `Go to the Demo tab to seed sample data, reset the demo, or run the guided flow. It is the fastest way to see ${appName} in action.`;
  }

  if (/(login|auth|account|profile|register)/.test(text)) {
    return `Auth is under the Auth tab. ${authLabel === 'Not signed in' ? 'You can log in or register there.' : `You are currently ${authLabel}.`} After that, use Profile to update your details.`;
  }

  if (/(weather|time|mood|vibe|filters)/.test(text)) {
    return `Your context is ${currentMood} mood, ${weatherLabel} weather, and ${timeOfDay}. Active filters are mood ${activeMood} and budget ${activeBudget}.`;
  }

  return `I can help with routes, pins, 3D view, demo mode, auth, and profile. Current context: ${currentMood} mood, ${weatherLabel} weather, ${timeOfDay}, and ${routeModeLabel} routing.`;
}

export default function GuideBot({ context, onNavigateSection, onResetFilters }) {
  const [messages, setMessages] = useState(() => [
    makeMessage('assistant', 'Welcome. I can guide you through routes, pins, 3D view, demo mode, auth, and profile settings.')
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    const node = threadRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, isThinking]);

  const statusLabel = useMemo(() => {
    if (context?.mapReady === false) return 'Map loading';
    if (context?.authLabel && context.authLabel !== 'Not signed in') return 'Personalized help';
    return 'Quick local guide';
  }, [context]);

  const sendMessage = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || isThinking) return;

    setMessages((prev) => [...prev, makeMessage('user', trimmed)]);
    setInputValue('');
    setIsThinking(true);

    window.setTimeout(() => {
      const reply = buildReply(trimmed, context);

      if (/(boards|board|collection|saved list)/.test(trimmed.toLowerCase()) && typeof onNavigateSection === 'function') {
        onNavigateSection('boards');
      }

      if (/(demo|seed)/.test(trimmed.toLowerCase()) && typeof onNavigateSection === 'function') {
        onNavigateSection('demo');
      }

      if (/(route|directions|plan a trip|travel|navigate)/.test(trimmed.toLowerCase()) && typeof onNavigateSection === 'function') {
        onNavigateSection('dashboard');
      }

      if (/(login|auth|account|profile|register)/.test(trimmed.toLowerCase()) && typeof onNavigateSection === 'function') {
        onNavigateSection('auth');
      }

      if (/(pin|spot|place|save a vibe|save pin|map actions)/.test(trimmed.toLowerCase()) && typeof onNavigateSection === 'function') {
        onNavigateSection('dashboard');
      }

      setMessages((prev) => [...prev, makeMessage('assistant', reply)]);
      setIsThinking(false);
    }, 180);
  };

  const handlePrompt = (prompt) => {
    sendMessage(prompt);
  };

  return (
    <div className="guide-bot">
      <div className="guide-bot-header">
        <div>
          <div className="guide-bot-title">Guided chat</div>
          <div className="guide-bot-subtitle">Ask for help or jump straight to the right screen.</div>
        </div>
        <div className="guide-bot-status">{statusLabel}</div>
      </div>

      <div className="guide-bot-pills" aria-label="Suggested prompts">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} type="button" className="guide-bot-pill" onClick={() => handlePrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="guide-bot-thread" ref={threadRef} aria-live="polite" aria-label="Chat transcript">
        {messages.map((message) => (
          <div key={message.id} className={`guide-bot-message guide-bot-message-${message.role}`}>
            {message.text}
          </div>
        ))}
        {isThinking && <div className="guide-bot-message guide-bot-message-assistant guide-bot-thinking">Typing a reply...</div>}
      </div>

      <div className="guide-bot-input-row">
        <input
          className="guide-bot-input field-input"
          placeholder="Ask me anything about the map or app..."
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              sendMessage(inputValue);
            }
          }}
        />
        <button type="button" className="guide-bot-send btn-primary" onClick={() => sendMessage(inputValue)}>
          Send
        </button>
      </div>

      <div className="guide-bot-actions">
        <button type="button" className="guide-bot-action-btn" onClick={() => onNavigateSection?.('dashboard')}>
          Dashboard
        </button>
        <button type="button" className="guide-bot-action-btn" onClick={() => onNavigateSection?.('boards')}>
          Boards
        </button>
        <button type="button" className="guide-bot-action-btn" onClick={() => onNavigateSection?.('demo')}>
          Demo
        </button>
        <button type="button" className="guide-bot-action-btn" onClick={() => onNavigateSection?.('auth')}>
          Auth
        </button>
        <button type="button" className="guide-bot-action-btn" onClick={() => onNavigateSection?.('profile')}>
          Profile
        </button>
        <button type="button" className="guide-bot-action-btn guide-bot-action-btn-secondary" onClick={() => onResetFilters?.()}>
          Reset filters
        </button>
      </div>
    </div>
  );
}