// ═══════════════════════════════════════════════════════════════
// 🔒 Netlify Serverless Function: Groq Cloud Vision Engine
// Model: llama-3.2-11b-vision-preview
// Key Randomization & Auto Failover Rotation on 429 Rate Limit
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

// Serverless Backend Key Pool (Loaded from Netlify Environment Variables: GROQ_API_KEYS)
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

    let startIndex = Math.floor(Math.random() * keys.length);
    let attempts = 0;
    let groqResponseData = null;

    while (attempts < keys.length) {
      const apiKey = keys[(startIndex + attempts) % keys.length];
      if (!apiKey) {
        attempts++;
        continue;
      }

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

    if (parsed) {
      const rawWord = parsed.word || parsed.name || parsed.object || parsed.item || '';
      if (rawWord) {
        const word = rawWord.trim();
        const phonics = parsed.phonics || word;
        const encouragement = parsed.encouragement || 'أَحْسَنْتَ يَا بَطَل!';
        const demonstrative = (word.endsWith('ة') || word.endsWith('ـة') || word.endsWith('اء')) ? 'هَذِهِ' : 'هَذَا';
        const speech_text = parsed.speech_text || `${demonstrative} ${word}. ${phonics}. ${encouragement}`;

        parsed = { word, phonics, speech_text, encouragement, category: parsed.category || '' };
      }
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
