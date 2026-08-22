// ═══════════════════════════════════════════════════════════════
// 🔒 Netlify Serverless Function: Optimized Gemini Vision Engine
// High Performance, Multi-Key Rotation & Auto-Retry
// ═══════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-3.6-flash';

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

let currentKeyIndex = 0;

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { image } = JSON.parse(event.body || '{}');
    if (!image) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Image data missing' }) };
    }

    const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    const keys = keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (keys.length === 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'لم يتم ضبط متغير GEMINI_API_KEYS في بيئة Netlify' })
      };
    }

    let attempts = 0;
    let geminiResponse = null;

    while (attempts < keys.length) {
      const apiKey = keys[currentKeyIndex % keys.length];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: GEMINI_PROMPT },
                { inline_data: { mime_type: 'image/jpeg', data: image } }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 350,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  detected:      { type: 'BOOLEAN' },
                  word:          { type: 'STRING' },
                  phonics:       { type: 'STRING' },
                  speech_text:   { type: 'STRING' },
                  encouragement: { type: 'STRING' },
                  category:      { type: 'STRING' }
                },
                required: ['detected']
              }
            }
          })
        });

        if (res.ok) {
          geminiResponse = await res.json();
          break;
        }

        if (res.status === 429 || res.status === 403) {
          console.warn(`[Netlify Function] Key index ${currentKeyIndex} rate limited (${res.status}), rotating...`);
          currentKeyIndex = (currentKeyIndex + 1) % keys.length;
          attempts++;
        } else {
          const errText = await res.text();
          throw new Error(`Gemini API Error (${res.status}): ${errText}`);
        }
      } catch (err) {
        attempts++;
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        if (attempts >= keys.length) throw err;
      }
    }

    const text = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { statusCode: 200, headers, body: JSON.stringify({ detected: false }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      const match = text.match(/\{[\s\S]*?\}/);
      parsed = match ? JSON.parse(match[0]) : { detected: false };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error('[Netlify Function Error]:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' })
    };
  }
};
