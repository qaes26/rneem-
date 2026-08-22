// ═══════════════════════════════════════════════════════════════
// 🧠  رنيم — Main Application Logic (v5 — Super-Fast Vision Engine)
// Real-time Camera → Fast Canvas → Gemini 1.5 Flash → Arabic TTS
// ═══════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GEMINI_PROMPT = `You are an expert digital speech-language pathologist and mobile computer vision engine specialized in pediatric speech therapy for Arabic-speaking children.

Task: Look at the image and IMMEDIATELY IDENTIFY ANY main object, item, animal, person, food, furniture, tool, garment, or scene element visible.

Strict Execution Rules:
1. Always Identify: Identify whatever primary object is visible in Modern Standard Arabic.
2. Single Child-Friendly Arabic Noun: Identify the object as a simple singular noun in Modern Standard Arabic (e.g. بَابٌ, قَلَمٌ, هَاتِفٌ, كُوبٌ, سَيَّارَةٌ, كُرْسِيٌّ, طَاوِلَةٌ, نَافِذَةٌ, حِذَاءٌ, قَمِيصٌ, رَجُلٌ, امْرَأَةٌ, طِفْلٌ, كِتَابٌ, لُعْبَةٌ, تُفَّاحَةٌ, مَوْزٌ, صُورَةٌ, جِدَارٌ).
3. Full Diacritization (Mandatory Tashkeel): EVERY SINGLE Arabic letter in "word", "phonics", "speech_text", and "encouragement" MUST have complete diacritics (Fatha, Damma, Kasra, Sukun, Shaddah, Tanween). This is CRITICAL for TTS pronunciation accuracy.
4. Syllable/Phonetic Breakdown (Phonics): Split the Arabic noun into clear phonetic syllables separated by hyphens with spaces (e.g., "بَا - بٌ", "قَـ - لَـ - مٌ").
5. Positive Encouragement: Provide a short, enthusiastic Arabic praise phrase (e.g., "أَحْسَنْتَ يَا بَطَل!", "رَائِعٌ يَا شَاطِر!", "مُمْتَازٌ يا ذَكِيّ!").
6. Spoken Sentence (TTS Ready): Compose a natural speech sentence starting with the correct demonstrative pronoun ("هَذَا" or "هَذِهِ"), followed by the word, the phonetic breakdown, and the encouragement phrase. Use proper punctuation (periods/commas) for natural vocal pauses in TTS.

JSON Schema:
{
  "word": "بَابٌ",
  "phonics": "بَا - بٌ",
  "speech_text": "هَذَا بَابٌ. بَا - بٌ. أَحْسَنْتَ يَا بَطَل!",
  "encouragement": "أَحْسَنْتَ يَا بَطَل!",
  "category": "أَثَاثٌ وَأَدَوَاتٌ"
}`;

// 🔑 Gemini API Keys Pool (Keys are securely loaded from Netlify Environment Variables: GEMINI_API_KEYS)
const API_KEYS = [
  "",
  "",
  "",
  "",
  "",
  "",
  "",
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

    // App State
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

    // Event Bindings
    this.saveKeyBtn.addEventListener('click', () => this.saveApiKey());
    this.apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveApiKey(); });
    this.startBtn.addEventListener('click', () => this.startCamera());
    this.cameraSwitchBtn.addEventListener('click', () => this.switchCamera());
    this.captureBtn.addEventListener('click', () => this.captureAndAnalyze(true));
    this.autoToggle.addEventListener('change', () => this.toggleAutoDetect());
    this.changeKeyBtn.addEventListener('click', () => this.showSetupScreen());

    // Load Microsoft Arabic Voices
    this.loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }

    this.createParticles();
    this.checkInitialState();
  }

  // ── Key Pool Rotation Logic ──
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
      console.log(`[Rneem] Rotated key index to: ${this.currentKeyIndex}`);
    }
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
      localStorage.setItem('rneem_api_key', key);
    }
    this.setupScreen.classList.add('hidden');
    this.permissionScreen.classList.remove('hidden');
  }

  showSetupScreen() {
    this.apiKeyInput.value = this.customApiKey || this.getApiKey();
    this.setupScreen.classList.remove('hidden');
  }

  // ── Load Microsoft Arabic Voices (Web Speech API Local) ──
  loadVoices() {
    const voices = speechSynthesis.getVoices();
    this.arabicVoice =
      voices.find(v => v.lang.startsWith('ar') && v.name.includes('Microsoft') && (v.name.includes('Naayf') || v.name.includes('Hoda') || v.name.includes('Salma') || v.name.includes('Shakir'))) ||
      voices.find(v => v.lang.startsWith('ar') && v.name.includes('Microsoft')) ||
      voices.find(v => v.lang.startsWith('ar') && (v.name.includes('Google') || v.name.includes('Apple'))) ||
      voices.find(v => v.lang.startsWith('ar')) ||
      null;

    if (this.arabicVoice) {
      console.log(`[Rneem] Selected Arabic Voice: ${this.arabicVoice.name}`);
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

  // ── High Performance Camera Setup ──
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

  // ── Optimized Ultra-Fast Vision Recognition Engine ──
  async captureAndAnalyze(isManualClick = false) {
    if (this.isAnalyzing || this.isSpeaking) return;

    this.isAnalyzing = true;
    this.captureBtn.classList.add('analyzing');
    this.updateStatus('جارٍ التعرّف...', 'analyzing');
    if (isManualClick) {
      this.loadingOverlay.classList.remove('hidden');
    }

    try {
      // Scale canvas down to 512px max for lightning fast upload (< 20KB)
      const maxDim = 512;
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
      const base64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];

      let result = null;

      // 1. Try Netlify Function Proxy First
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
        // Fallback to client call below
      }

      // 2. Direct Gemini Call Fallback
      if (!result || !result.word) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
          if (isManualClick) this.showError('يرجى التأكد من مفاتيح Gemini API');
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
                temperature: 0.2,
                maxOutputTokens: 300,
                responseMimeType: 'application/json'
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

        if (response && response.ok) {
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            try {
              result = JSON.parse(text.trim());
            } catch {
              const match = text.match(/\{[\s\S]*?\}/);
              if (match) result = JSON.parse(match[0]);
            }
          }
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
      console.error('[Rneem] Recognition Error:', err);
      if (isManualClick) {
        this.showError('حدث خطأ بالاتصال. حاول مرة أخرى.');
      }
    } finally {
      this.isAnalyzing = false;
      this.captureBtn.classList.remove('analyzing');
      this.loadingOverlay.classList.add('hidden');
    }
  }

  // ── Handle Gemini Result ──
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

  // ── Render Result Card ──
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

  // ── High Precision Sequential Speech Synthesis ──
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
        utterance.rate = 0.85;
      } else if (index === 1) {
        utterance.rate = 0.55;
        utterance.pitch = 1.0;
      } else {
        utterance.rate = 0.95;
        utterance.pitch = 1.15;
      }

      if (this.arabicVoice) {
        utterance.voice = this.arabicVoice;
      }

      utterance.onend = () => setTimeout(speakNext, 400);
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
        if (!this.isAnalyzing && !this.isSpeaking) {
          this.captureAndAnalyze(false);
        }
      }, 3000);
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
