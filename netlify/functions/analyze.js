// ═══════════════════════════════════════════════════════════════
// 🔒 Netlify Serverless Function: Groq Cloud Vision Engine
// Model: llama-3.2-11b-vision-preview
// Key Randomization & Auto Failover Rotation on 429 Rate Limit
// ═══════════════════════════════════════════════════════════════

const GROQ_MODEL = 'llama-3.2-11b-vision-preview';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_VISION_PROMPT = `You are an expert digital speech-language pathologist and real-time mobile computer vision engine specialized in pediatric speech therapy for Arabic-speaking children.

Task: Identify the primary central object visible in the image (e.g. بَابٌ, قَلَمٌ, هَاتِفٌ, كُوبٌ, سَيَّارَةٌ, كُرْسِيٌّ, طَاوِلَةٌ, نَافِذَةٌ, حِذَاءٌ, قَمِيصٌ, رَجُلٌ, امْرَأَةٌ, طِفْلٌ, كِتَابٌ, لُعْبَةٌ, تُفَّاحَةٌ, مَوْزٌ, صُورَةٌ, جِدَارٌ).

Execution Rules:
1. Identify the primary object as a simple singular noun in Modern Standard Arabic.
2. Full Diacritization (Mandatory Tashkeel): EVERY Arabic letter in "word", "phonics", "speech_text", and "encouragement" MUST have complete diacritics (Fatha, Damma, Kasra, Sukun, Shaddah, Tanween).
3. Syllable Breakdown (Phonics): Split the Arabic noun into clear phonetic syllables separated by hyphens with spaces (e.g., "بَا - بٌ", "قَـ - لَـ - مٌ").
4. Speech Sentence: Compose a natural speech sentence starting with the correct demonstrative pronoun ("هَذَا" or "هَذِهِ"), followed by the word, the phonetic breakdown, and encouragement.
5. Return JSON ONLY with NO additional text or markdown.

JSON Output Schema:
{
  "word": "بَابٌ",
  "phonics": "بَا - بٌ",
  "speech_text": "هَذَا بَابٌ. بَا - بٌ. أَحْسَنْتَ يَا بَطَل!",
  "encouragement": "أَحْسَنْتَ يَا بَطَل!"
}`;

// Serverless Backend Key Pool (Keys are loaded from Netlify Environment Variables: GROQ_API_KEYS)
const DEFAULT_GROQ_KEYS = [
  "",
  "",
  ""
];

exports.handler = async function (event, context) {
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

    const keysEnv = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
    let keys = keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keys.length === 0) {
      keys = DEFAULT_GROQ_KEYS;
    }

    // Pick a random starting index for load balancing across devices
    let startIndex = Math.floor(Math.random() * keys.length);
    let attempts = 0;
    let groqResponseData = null;

    while (attempts < keys.length) {
      const apiKey = keys[(startIndex + attempts) % keys.length];

      try {
        const res = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
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
                    image_url: { url: `data:image/jpeg;base64,${image}` }
                  }
                ]
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 300
          })
        });

        if (res.ok) {
          groqResponseData = await res.json();
          break;
        }

        // On 429 Rate Limit or 403/503, rotate to next key silently
        if (res.status === 429 || res.status === 403 || res.status === 503) {
          console.warn(`[Groq Serverless] Key index ${(startIndex + attempts) % keys.length} rate limited (${res.status}), trying next key...`);
          attempts++;
        } else {
          const errText = await res.text();
          console.error(`[Groq Serverless Error ${res.status}]:`, errText);
          attempts++;
        }
      } catch (err) {
        console.error(`[Groq Fetch Error]:`, err);
        attempts++;
      }
    }

    const contentText = groqResponseData?.choices?.[0]?.message?.content;
    if (!contentText) {
      return { statusCode: 200, headers, body: JSON.stringify({ word: '' }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(contentText.trim());
    } catch {
      const match = contentText.match(/\{[\s\S]*?\}/);
      parsed = match ? JSON.parse(match[0]) : { word: '' };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error('[Groq Netlify Function Error]:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' })
    };
  }
};
