// ═══════════════════════════════════════════════════════════════
// 🧠  رنيم — Main Application Logic (Groq Vision Engine: llama-3.2-11b-vision-preview)
// Real-time Camera → Compressed Canvas → Groq Cloud API → Arabic TTS (rate=0.75)
// ═══════════════════════════════════════════════════════════════

const GROQ_MODEL = 'llama-3.2-11b-vision-preview';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_VISION_PROMPT = `Look at the main object in the image and identify what it is. You MUST respond with a JSON object in Modern Standard Arabic.

Rules:
1. Identify ANY visible item, object, face, person, clothing, furniture, bottle, cup, phone, door, car, book, wall, window, key, tool, toy, food, animal, etc.
2. Provide the word in Modern Standard Arabic with full diacritics (tashkeel).
3. "word": The singular Arabic noun with diacritics (e.g., "كُوبٌ", "قَلَمٌ", "هَاتِفٌ", "بَابٌ", "وَجْهٌ", "كُرْسِيٌّ", "قَمِيصٌ", "كِتَابٌ", "زُجَاجَةٌ").
4. "phonics": Phonetic syllables separated by hyphens (e.g., "كُو - بٌ", "قَـ - لَـ - مٌ").
5. "speech_text": Full sentence starting with "هَذَا" or "هَذِهِ" (e.g., "هَذَا كُوبٌ. كُو - بٌ. أَحْسَنْتَ يَا بَطَل!").
6. "encouragement": Enthusiastic praise (e.g., "أَحْسَنْتَ يَا بَطَل!").

JSON Output Schema:
{
  "word": "كُوبٌ",
  "phonics": "كُو - بٌ",
  "speech_text": "هَذَا كُوبٌ. كُو - بٌ. أَحْسَنْتَ يَا بَطَل!",
  "encouragement": "أَحْسَنْتَ يَا بَطَل!"
}`;

// 🔑 Groq API Keys Pool (Loaded from config.js locally or Netlify Environment Variables: GROQ_API_KEYS)
const GROQ_API_KEYS = [
  "",
  "",
  ""
];

class RneemApp {
  constructor() {
    // DOM Elements
    this.video = document.getElementById('camera-feed');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.permissionScreen = document.getElementById('permission-screen');
    this.setupScreen = document.getElementById('setup-screen');
    this.startBtn = document.getElementById('start-btn');
    this.saveKeyBtn = document.getElementById('save-key-btn');
    this.apiKeyInput = document.getElementById('api-key-input');
    this.resultCard = document.getElementById('result-card');
    this.statusBadge = document.getElementById('status-badge');
    this.statusText = document.getElementById('status-text');
    this.cameraSwitchBtn = document.getElementById('camera-switch-btn');
    this.captureBtn = document.getElementById('capture-btn');
    this.autoToggle = document.getElementById('auto-toggle');
    this.changeKeyBtn = document.getElementById('change-key-btn');
    this.errorToast = document.getElementById('error-toast');
    this.detectedHighlight = document.getElementById('detected-highlight');
    this.targetBox = document.getElementById('target-box');

    // App State
    this.customApiKey = localStorage.getItem('rneem_groq_key') || '';
    this.stream = null;
    this.facingMode = 'environment';
    this.isSpeaking = false;
    this.isAnalyzing = false;
    this.arabicVoice = null;
    this.currentSpeechData = null;
    this.autoDetectInterval = null;
    this.lastWord = '';
    this.lastDetectionTime = 0;
    this.cooldownMs = 4000;
    this.isDebounced = false;

    // Event Bindings
    this.saveKeyBtn.addEventListener('click', () => this.saveApiKey());
    this.apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveApiKey(); });
    this.startBtn.addEventListener('click', () => this.startCamera());
    this.cameraSwitchBtn.addEventListener('click', () => this.switchCamera());
    this.captureBtn.addEventListener('click', () => this.handleManualCapture());
    this.autoToggle.addEventListener('change', () => this.toggleAutoDetect());
    this.changeKeyBtn.addEventListener('click', () => this.showSetupScreen());

    // Load Microsoft / Browser Arabic Voices
    this.loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }

    this.createParticles();
    this.checkInitialState();
  }

  // ── Key Pool Resolution & Random Selection ──
  getGroqKeyPool() {
    const localKeys = (typeof LOCAL_GROQ_KEYS !== 'undefined' && Array.isArray(LOCAL_GROQ_KEYS)) ? LOCAL_GROQ_KEYS : [];
    const merged = [...GROQ_API_KEYS, ...localKeys];
    if (this.customApiKey) merged.unshift(this.customApiKey);
    return merged.filter(k => k && k.trim().length > 0);
  }

  // ── Anti-Spam / Debounce Protection (2 Seconds Delay) ──
  handleManualCapture() {
    if (this.isDebounced || this.isAnalyzing || this.isSpeaking) return;

    this.isDebounced = true;
    this.captureBtn.disabled = true;
    this.captureBtn.style.opacity = '0.5';
    this.captureBtn.style.pointerEvents = 'none';

    setTimeout(() => {
      this.isDebounced = false;
      this.captureBtn.disabled = false;
      this.captureBtn.style.opacity = '1';
      this.captureBtn.style.pointerEvents = 'auto';
    }, 2000);

    this.captureAndAnalyze(true);
  }

  // ── App Startup ──
  checkInitialState() {
    this.setupScreen.classList.add('hidden');
    this.permissionScreen.classList.remove('hidden');
  }

  saveApiKey() {
    const key = this.apiKeyInput.value.trim();
    if (key) {
      this.customApiKey = key;
      localStorage.setItem('rneem_groq_key', key);
    }
    this.setupScreen.classList.add('hidden');
    this.permissionScreen.classList.remove('hidden');
  }

  showSetupScreen() {
    this.apiKeyInput.value = this.customApiKey || '';
    this.setupScreen.classList.remove('hidden');
  }

  // ── Load Arabic Voices ──
  loadVoices() {
    const voices = speechSynthesis.getVoices();
    this.arabicVoice =
      voices.find(v => v.lang.startsWith('ar') && v.name.includes('Microsoft') && (v.name.includes('Naayf') || v.name.includes('Hoda') || v.name.includes('Salma') || v.name.includes('Shakir'))) ||
      voices.find(v => v.lang.startsWith('ar') && v.name.includes('Microsoft')) ||
      voices.find(v => v.lang.startsWith('ar') && (v.name.includes('Google') || v.name.includes('Apple'))) ||
      voices.find(v => v.lang.startsWith('ar')) ||
      null;

    if (this.arabicVoice) {
      console.log(`[Rneem Groq] Selected Arabic Voice: ${this.arabicVoice.name}`);
    }
  }

  // ── Background Floating Animation Particles ──
  createParticles() {
    const container = document.getElementById('bg-particles');
    if (!container) return;
    const colors = ['rgba(139,92,246,0.4)', 'rgba(244,63,94,0.3)', 'rgba(245,158,11,0.3)', 'rgba(16,185,129,0.3)'];
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.classList.add('particle');
      const size = Math.random() * 6 + 3;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = `${Math.random() * 12 + 8}s`;
      p.style.animationDelay = `${Math.random() * 8}s`;
      container.appendChild(p);
    }
  }

  // ── Camera Setup ──
  async startCamera() {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      this.video.srcObject = this.stream;
      if (this.facingMode === 'user') {
        this.video.classList.add('mirrored');
      } else {
        this.video.classList.remove('mirrored');
      }

      await new Promise(resolve => {
        this.video.onloadedmetadata = () => { this.video.play(); resolve(); };
      });

      this.permissionScreen.classList.add('hidden');
      this.updateStatus('جاهز — الكشف التلقائي مفعّل 🎥', 'active');

      if (!this.autoToggle.checked) {
        this.autoToggle.checked = true;
      }
      this.toggleAutoDetect();
    } catch (err) {
      console.error('[Rneem] Camera Error:', err);
      this.showError('لم نتمكن من فتح الكاميرا. تأكد من الأذونات.');
    }
  }

  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    try {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      this.video.srcObject = this.stream;
      if (this.facingMode === 'user') {
        this.video.classList.add('mirrored');
      } else {
        this.video.classList.remove('mirrored');
      }
    } catch {
      this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    }
  }

  // ── Groq Cloud Vision Engine (llama-3.2-11b-vision-preview) ──
  async captureAndAnalyze(isManualClick = false) {
    if (this.isAnalyzing || this.isSpeaking) return;

    if (!this.video || this.video.readyState < 2 || !this.video.videoWidth) {
      if (isManualClick) this.showError('الكاميرا غير جاهزة بعد. انتظر ثانية...');
      return;
    }

    this.isAnalyzing = true;
    this.captureBtn.classList.add('analyzing');
    this.updateStatus('جارٍ التعرّف...', 'analyzing');
    if (isManualClick) {
      this.loadingOverlay.classList.remove('hidden');
    }

    try {
      // Scale canvas down to max 640px for clean clarity
      const maxDim = 640;
      let width = this.video.videoWidth || 640;
      let height = this.video.videoHeight || 480;
      if (width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.video, 0, 0, width, height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

      let result = null;

      // 1. Try Netlify Serverless Proxy First
      try {
        const netlifyRes = await fetch('/.netlify/functions/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        });

        if (netlifyRes.ok) {
          result = await netlifyRes.json();
        }
      } catch (e) {
        console.warn('[Groq App] Netlify Proxy bypassed:', e);
      }

      // 2. Direct Groq API Client Fallback (Random key selection & 429 auto-rotation)
      if (!result || !result.word) {
        const keyPool = this.getGroqKeyPool();
        if (keyPool.length === 0) {
          if (isManualClick) this.showError('يرجى التأكد من مفاتيح Groq API');
          return;
        }

        let startIndex = Math.floor(Math.random() * keyPool.length);
        let attempts = 0;
        let response = null;

        while (attempts < keyPool.length) {
          const currentKey = keyPool[(startIndex + attempts) % keyPool.length];

          try {
            response = await fetch(GROQ_ENDPOINT, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${currentKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: SYSTEM_VISION_PROMPT },
                      {
                        type: 'image_url',
                        image_url: { url: `data:image/jpeg;base64,${base64}` }
                      }
                    ]
                  }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2,
                max_tokens: 300
              })
            });

            if (response.ok) break;

            if (response.status === 429 || response.status === 403 || response.status === 503) {
              console.warn(`[Groq Client] Key index ${(startIndex + attempts) % keyPool.length} rate limited (${response.status}), trying next key...`);
              attempts++;
            } else {
              attempts++;
            }
          } catch (fetchErr) {
            attempts++;
          }
        }

        if (response && response.ok) {
          const data = await response.json();
          const contentText = data?.choices?.[0]?.message?.content;
          if (contentText) {
            try {
              result = JSON.parse(contentText.trim());
            } catch {
              const match = contentText.match(/\{[\s\S]*?\}/);
              if (match) result = JSON.parse(match[0]);
            }
          }
        }
      }

      // Robust Response Post-Processor
      if (result) {
        const rawWord = result.word || result.name || result.object || result.item || '';
        if (rawWord) {
          const word = rawWord.trim();
          const phonics = result.phonics || word;
          const encouragement = result.encouragement || 'أَحْسَنْتَ يَا بَطَل!';
          const demonstrative = (word.endsWith('ة') || word.endsWith('ـة') || word.endsWith('اء')) ? 'هَذِهِ' : 'هَذَا';
          const speech_text = result.speech_text || `${demonstrative} ${word}. ${phonics}. ${encouragement}`;

          result = { word, phonics, speech_text, encouragement, category: result.category || '' };
        }
      }

      if (!result || !result.word) {
        if (isManualClick) {
          this.showError('لم نتمكن من التمييز الدقيق. وجّه الكاميرا وثبّتها.');
        }
        this.updateStatus('وجه الكاميرا بثبات...', 'active');
        return;
      }

      this.handleResult(result);

    } catch (err) {
      console.error('[Groq Engine Error]:', err);
      if (isManualClick) {
        this.showError('حدث خطأ بالاتصال. حاول مرة أخرى.');
      }
    } finally {
      this.isAnalyzing = false;
      this.captureBtn.classList.remove('analyzing');
      this.loadingOverlay.classList.add('hidden');
    }
  }

  // ── Handle Result ──
  handleResult(result) {
    const { word, phonics, speech_text, encouragement, category } = result;

    if (!word) return;

    const now = Date.now();
    if (word === this.lastWord && (now - this.lastDetectionTime) < this.cooldownMs) {
      this.updateStatus('جاهز — الكشف التلقائي مفعّل 🎥', 'active');
      return;
    }

    this.lastWord = word;
    this.lastDetectionTime = now;

    this.updateStatus('تَمَّ التَّعَرُّفُ!', 'detected');

    if (this.targetBox) {
      this.targetBox.classList.remove('detected');
      void this.targetBox.offsetWidth;
      this.targetBox.classList.add('detected');
      setTimeout(() => this.targetBox.classList.remove('detected'), 2200);
    }

    this.detectedHighlight.classList.remove('flash');
    void this.detectedHighlight.offsetWidth;
    this.detectedHighlight.classList.add('flash');

    const rawSpeech = speech_text || `${word}. ${phonics || word}. ${encouragement || 'أَحْسَنْتَ يَا بَطَل!'}`;

    const ttsParts = rawSpeech
      .split(/\.\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    this.currentSpeechData = {
      word,
      phonics: phonics || word,
      encouragement: encouragement || 'أَحْسَنْتَ يَا بَطَل!',
      category: category || '',
      speechText: rawSpeech,
      ttsParts
    };

    this.showResult(this.currentSpeechData);
    this.speakSequential(this.currentSpeechData.ttsParts);

    setTimeout(() => this.updateStatus('جاهز — الكشف التلقائي مفعّل 🎥', 'active'), 2500);
  }

  // ── Render Result Card with Replay Button ──
  showResult(data) {
    this.resultCard.innerHTML = `
      <div class="word-display">
        <div class="word-display__main">${data.word}</div>
        <div class="word-display__phonics">${data.phonics}</div>
        <div class="word-display__divider"></div>
        <div class="word-display__encouragement">${data.encouragement}</div>
        ${data.category ? `<div class="word-display__category">${data.category}</div>` : ''}
        <div class="actions">
          <button class="btn btn--primary" id="repeat-btn" onclick="app.repeatCurrent()">
            <span class="btn__icon">🔊</span>
            إِعَادَةُ النُّطْقِ
          </button>
        </div>
      </div>
    `;
    this.resultCard.classList.add('visible');
  }

  // ── High Precision Sequential Speech Synthesis (Slow Rate = 0.75 for Pediatric Therapy) ──
  speakSequential(parts) {
    speechSynthesis.cancel();
    this.isSpeaking = true;

    const btn = document.getElementById('repeat-btn');
    if (btn) btn.classList.add('speaking');

    let index = 0;

    const speakNext = () => {
      if (index >= parts.length) {
        this.isSpeaking = false;
        if (btn) btn.classList.remove('speaking');
        return;
      }

      const text = parts[index];
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';

      utterance.rate = 0.75;
      utterance.pitch = index === 1 ? 1.0 : 1.1;

      if (this.arabicVoice) {
        utterance.voice = this.arabicVoice;
      }

      utterance.onend = () => setTimeout(speakNext, 450);
      utterance.onerror = () => setTimeout(speakNext, 150);

      index++;
      speechSynthesis.speak(utterance);
    };

    speakNext();
  }

  repeatCurrent() {
    if (this.currentSpeechData) {
      this.speakSequential(this.currentSpeechData.ttsParts);
    }
  }

  // ── Real-Time Auto-detect Loop ──
  toggleAutoDetect() {
    if (this.autoToggle.checked) {
      if (this.autoDetectInterval) clearInterval(this.autoDetectInterval);
      this.autoDetectInterval = setInterval(() => {
        if (!this.isAnalyzing && !this.isSpeaking && !this.isDebounced) {
          this.captureAndAnalyze(false);
        }
      }, 3500);
    } else {
      clearInterval(this.autoDetectInterval);
      this.autoDetectInterval = null;
    }
  }

  // ── UI Status & Notifications ──
  updateStatus(text, state) {
    this.statusText.textContent = text;
    this.statusBadge.className = 'status-badge';
    if (state) this.statusBadge.classList.add(state);
  }

  showError(msg) {
    this.errorToast.textContent = msg;
    this.errorToast.classList.add('visible');
    setTimeout(() => this.errorToast.classList.remove('visible'), 5000);
  }
}

// ── App Initialization ──
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new RneemApp();
});
