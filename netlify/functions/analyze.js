// ═══════════════════════════════════════════════════════════════
// 🔒 Netlify Serverless Function: Ultra-Fast Gemini 1.5 Flash Engine
// ═══════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-1.5-flash';

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

// Default fallback 10 keys if env variable is not set
const DEFAULT_KEYS = [
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
    let keys = keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keys.length === 0) {
      keys = DEFAULT_KEYS;
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
              temperature: 0.2,
              maxOutputTokens: 300,
              responseMimeType: 'application/json'
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
      return { statusCode: 200, headers, body: JSON.stringify({ word: '' }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      const match = text.match(/\{[\s\S]*?\}/);
      parsed = match ? JSON.parse(match[0]) : { word: '' };
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
