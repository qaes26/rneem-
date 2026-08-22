// ═══════════════════════════════════════════════════════════════
// 🧠  رنيم — Main Application Logic (v3 — Gemini Vision API)
// Camera → Capture Frame → Gemini API → Arabic TTS
// ═══════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GEMINI_PROMPT = `You are an expert digital speech-language pathologist and real-time mobile computer vision engine specialized in pediatric speech therapy for Arabic-speaking children.

Context: The smartphone camera continuously monitors the environment in real time. Automatically analyze the video frames to instantly identify the primary central object as soon as the child or user points the camera at it (e.g., بَابٌ, قَلَمٌ, هَاتِفٌ, كُوبٌ, سَيَّارَةٌ, كُرْسِيٌّ).

Strict Execution Rules for Real-Time Auto-Capture:
1. Instant Real-Time Recognition: Identify the main prominent object immediately when the camera targets it. Do NOT wait for a manual button click trigger.
2. Motion & Frame Quality Verification: 
   - If the camera is moving too fast, blurry, or no clear object is in focus, return: {"detected": false}
   - If a clear, identifiable object is detected, set "detected": true and proceed with full analysis.
3. Single Child-Friendly Object: Focus strictly on one clear, singular noun in Modern Standard Arabic suitable for speech therapy. Ignore complex background items.
4. Full Diacritization (Mandatory Tashkeel): EVERY SINGLE Arabic letter in "word", "phonics", "speech_text", and "encouragement" MUST have complete diacritics (Fatha, Damma, Kasra, Sukun, Shaddah, Tanween). This is CRITICAL for accurate Text-to-Speech (TTS) engines (like OpenAI TTS or Edge TTS).
5. Syllable/Phonetic Breakdown (Phonics): Split the Arabic noun into clear phonetic syllables separated by hyphens with spaces (e.g., "بَا - بٌ", "قَـ - لَـ - مٌ").
6. Warm Pediatric Reinforcement: Provide a short, enthusiastic Arabic praise phrase to reward the child (e.g., "أَحْسَنْتَ يَا بَطَل!", "رَائِعٌ يَا شَاطِر!").
7. Spoken Sentence (TTS Ready): Compose a natural speech sentence starting with the correct demonstrative pronoun ("هَذَا" or "هَذِهِ"), followed by the word, the phonetic breakdown, and the encouragement phrase. Use proper punctuation (periods/commas) for natural vocal pauses in TTS.

JSON Schema (When Object is Clear):
{
  "detected": true,
  "word": "بَابٌ",
  "phonics": "بَا - بٌ",
  "speech_text": "هَذَا بَابٌ. بَا - بٌ. أَحْسَنْتَ يَا بَطَل!",
  "encouragement": "أَحْسَنْتَ يَا بَطَل!",
  "category": "أَثَاثٌ وَأَدَوَاتٌ"
}

JSON Schema (When Blurred or Moving):
{
  "detected": false
}`;

// 🔑 10 Gemini API Keys Array (Rotates automatically on quota/rate-limit)
const API_KEYS = [
  "AIzaSyCyQv-Nx6zTXHV3drhTdFn6IoeYq_ghuao",
  "AIzaSyBdBpOMAekV_z9vwICWczZ44BeTxWbrnDQ",
  "AIzaSyCoqly3NiY-jMOwDIdiM_F6UvIm4oyUs10",
  "AIzaSyDnU5PICh-8oaocsl9rDJCQqSwqBC6M4lg",
  "AIzaSyC1NbVk2uxZoYNdYnSsX4h6nuF_-35VLoY",
  "AIzaSyB6QxhpbIjNBnUmdEvACxlGeHK2gGqCGGY",
  "AIzaSyDyPqtd9g-9MSD-PjRI9ZaFNfKJpxlSeBo",
  "AIzaSyDHLjJWXoG3-MJ-kmCgd1mBu2L-dm69iiE",
  "AIzaSyDglzTpSgjuLQmx43ljLB6SFs8fZL7J5B8",
  "AIzaSyB6qE9ElY6DXr3RHP1P1VZIlaLjXluBXTk"
];

class RneemApp {
  constructor() {
    // DOM
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

    // State
    this.currentKeyIndex = 0;
    this.customApiKey = localStorage.getItem('rneem_api_key') || '';
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

    // Bind events
    this.saveKeyBtn.addEventListener('click', () => this.saveApiKey());
    this.apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveApiKey(); });
    this.startBtn.addEventListener('click', () => this.startCamera());
    this.cameraSwitchBtn.addEventListener('click', () => this.switchCamera());
    this.captureBtn.addEventListener('click', () => this.captureAndAnalyze(true));
    this.autoToggle.addEventListener('change', () => this.toggleAutoDetect());
    this.changeKeyBtn.addEventListener('click', () => this.showSetupScreen());

    // Load Microsoft Arabic Voice
    this.loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }

    this.createParticles();
    this.checkInitialState();
  }

  // ── Get Active API Key with fallback & rotation ──
  getApiKey() {
    if (this.customApiKey) return this.customApiKey;
    const validKeys = API_KEYS.filter(k => k && k.trim().length > 0);
    if (validKeys.length > 0) {
      return validKeys[this.currentKeyIndex % validKeys.length];
    }
    return '';
  }

  rotateKey() {
    const validKeys = API_KEYS.filter(k => k && k.trim().length > 0);
    if (validKeys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % validKeys.length;
      console.log(`Rotated API Key to index ${this.currentKeyIndex}`);
    }
  }

  // ── Initial State: Start directly on permission screen ──
  checkInitialState() {
    // Directly show welcome / start screen without setup prompt modal
    this.setupScreen.classList.add('hidden');
    this.permissionScreen.classList.remove('hidden');
  }

  // ── Save Custom API Key (Optional) ──
  saveApiKey() {
    const key = this.apiKeyInput.value.trim();
    if (key) {
      this.customApiKey = key;
      localStorage.setItem('rneem_api_key', key);
    }
    this.setupScreen.classList.add('hidden');
    this.permissionScreen.classList.remove('hidden');
  }

  showSetupScreen() {
    this.apiKeyInput.value = this.customApiKey || this.getApiKey();
    this.setupScreen.classList.remove('hidden');
  }

  // ── Load Microsoft Arabic Voice (Web Speech API — No Key Required) ──
  loadVoices() {
    const voices = speechSynthesis.getVoices();

    // Priority 1: Microsoft Natural Arabic Voices (Naayf, Hoda, Salma, Shakir, Zariyah, Hamed, Tarik)
    // Priority 2: Any Microsoft Arabic Voice
    // Priority 3: Google / Apple Arabic Voice
    // Priority 4: Any browser Arabic Voice
    this.arabicVoice =
      voices.find(v => v.lang.startsWith('ar') && v.name.includes('Microsoft') && (v.name.includes('Naayf') || v.name.includes('Hoda') || v.name.includes('Salma') || v.name.includes('Shakir'))) ||
      voices.find(v => v.lang.startsWith('ar') && v.name.includes('Microsoft')) ||
      voices.find(v => v.lang.startsWith('ar') && (v.name.includes('Google') || v.name.includes('Apple'))) ||
      voices.find(v => v.lang.startsWith('ar')) ||
      null;

    if (this.arabicVoice) {
      console.log('Arabic TTS Voice Selected:', this.arabicVoice.name, '| Lang:', this.arabicVoice.lang);
    }
  }

  // ── Particles ──
  createParticles() {
    const container = document.getElementById('bg-particles');
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

  // ── Camera ──
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
      console.error('Camera error:', err);
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
    } catch {
      this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    }
  }

  // ── Capture Frame → Netlify Function (Secure) or Direct API fallback ──
  async captureAndAnalyze(isManualClick = false) {
    if (this.isAnalyzing || this.isSpeaking) return;

    this.isAnalyzing = true;
    this.captureBtn.classList.add('analyzing');
    this.updateStatus('جارٍ التعرّف...', 'analyzing');
    if (isManualClick) {
      this.loadingOverlay.classList.remove('hidden');
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.video.videoWidth || 640;
      canvas.height = this.video.videoHeight || 480;
      canvas.getContext('2d').drawImage(this.video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];

      let result = null;

      // 1. Try Netlify Serverless Function first (Secure, keys in environment variables)
      try {
        const netlifyRes = await fetch('/.netlify/functions/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        });

        if (netlifyRes.ok) {
          result = await netlifyRes.json();
        } else if (netlifyRes.status !== 404) {
          const errBody = await netlifyRes.json().catch(() => ({}));
          throw new Error(errBody.error || `خطأ الخادم (${netlifyRes.status})`);
        }
      } catch (netlifyErr) {
        // If 404 (not running on Netlify), fallback to direct API call below
        if (netlifyErr.message && !netlifyErr.message.includes('404')) {
          throw netlifyErr;
        }
      }

      // 2. Direct API Call Fallback (If not on Netlify or local testing with client keys)
      if (!result) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
          if (isManualClick) this.showError('يرجى ضبط متغير GEMINI_API_KEYS في Netlify أو إضافة مفاتيح في app.js');
          return;
        }

        let attempts = 0;
        let response = null;
        const validKeys = API_KEYS.filter(k => k && k.trim().length > 0);
        const maxAttempts = validKeys.length > 0 ? validKeys.length : 1;

        while (attempts < maxAttempts) {
          const currentKey = this.getApiKey();
          response = await fetch(`${GEMINI_ENDPOINT}?key=${currentKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: GEMINI_PROMPT },
                  { inline_data: { mime_type: 'image/jpeg', data: base64 } }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 350,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    detected: { type: 'BOOLEAN' },
                    word: { type: 'STRING' },
                    phonics: { type: 'STRING' },
                    speech_text: { type: 'STRING' },
                    encouragement: { type: 'STRING' },
                    category: { type: 'STRING' }
                  },
                  required: ['detected']
                }
              }
            })
          });

          if (response.ok) break;

          if (response.status === 429 || response.status === 403) {
            this.rotateKey();
            attempts++;
          } else {
            break;
          }
        }

        if (!response || !response.ok) {
          const errData = await response?.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `خطأ في الاتصال (${response?.status || 'Network'})`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return;

        try {
          result = JSON.parse(text.trim());
        } catch {
          const match = text.match(/\{[\s\S]*?\}/);
          if (!match) return;
          result = JSON.parse(match[0]);
        }
      }

      if (!result || result.detected === false) {
        if (isManualClick) {
          this.showError('لم نتمكن من تمييز شيء واضح. وجّه الكاميرا وثبّتها.');
        }
        this.updateStatus('وجه الكاميرا وثبتها...', 'active');
        return;
      }

      this.handleResult(result);

    } catch (err) {
      console.error('Analysis error:', err);
      if (isManualClick) {
        this.showError(err.message || 'حدث خطأ. حاول مرة أخرى.');
      }
    } finally {
      this.isAnalyzing = false;
      this.captureBtn.classList.remove('analyzing');
      this.loadingOverlay.classList.add('hidden');
    }

    // ── Handle Gemini Result ──
    handleResult(result) {
      const { word, phonics, speech_text, encouragement, category } = result;

      if (!word || !speech_text) return;

      const now = Date.now();
      // Cooldown check for same word in real-time auto-capture
      if (word === this.lastWord && (now - this.lastDetectionTime) < this.cooldownMs) {
        this.updateStatus('جاهز — الكشف التلقائي مفعّل 🎥', 'active');
        return;
      }

      this.lastWord = word;
      this.lastDetectionTime = now;

      this.updateStatus('تَمَّ التَّعَرُّفُ!', 'detected');

      // Flash effect
      this.detectedHighlight.classList.remove('flash');
      void this.detectedHighlight.offsetWidth;
      this.detectedHighlight.classList.add('flash');

      // Split speech_text by periods for sequential TTS
      const ttsParts = speech_text
        .split(/\.\s*/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      this.currentSpeechData = {
        word,
        phonics: phonics || word,
        encouragement: encouragement || 'أَحْسَنْتَ يَا بَطَل!',
        category: category || '',
        speechText: speech_text,
        ttsParts
      };

      this.showResult(this.currentSpeechData);
      this.speakSequential(this.currentSpeechData.ttsParts);

      setTimeout(() => this.updateStatus('جاهز — الكشف التلقائي مفعّل 🎥', 'active'), 2500);
    }

    // ── Show Result Card ──
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
            أَعِدْ النُّطْقَ
          </button>
        </div>
      </div>
    `;
      this.resultCard.classList.add('visible');
    }

    // ── Sequential TTS ──
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

        if (index === 0) {
          utterance.rate = 0.85;     // Word — normal
        } else if (index === 1) {
          utterance.rate = 0.55;     // Phonics — very slow
          utterance.pitch = 1.0;
        } else {
          utterance.rate = 0.95;     // Encouragement — upbeat
          utterance.pitch = 1.15;
        }

        if (this.arabicVoice) utterance.voice = this.arabicVoice;

        utterance.onend = () => setTimeout(speakNext, 500);
        utterance.onerror = () => setTimeout(speakNext, 200);

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

    // ── Auto-detect Toggle ──
    toggleAutoDetect() {
      if (this.autoToggle.checked) {
        if (this.autoDetectInterval) clearInterval(this.autoDetectInterval);
        this.autoDetectInterval = setInterval(() => {
          if (!this.isAnalyzing && !this.isSpeaking) {
            this.captureAndAnalyze(false);
          }
        }, 3000); // every 3 seconds for real-time monitoring
      } else {
        clearInterval(this.autoDetectInterval);
        this.autoDetectInterval = null;
      }
    }

    // ── Status ──
    updateStatus(text, state) {
      this.statusText.textContent = text;
      this.statusBadge.className = 'status-badge';
      if (state) this.statusBadge.classList.add(state);
    }

    // ── Error ──
    showError(msg) {
      this.errorToast.textContent = msg;
      this.errorToast.classList.add('visible');
      setTimeout(() => this.errorToast.classList.remove('visible'), 5000);
    }
  }

// ── Init ──
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new RneemApp();
});
