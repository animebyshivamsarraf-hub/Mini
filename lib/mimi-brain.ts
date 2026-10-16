/**
 * Mini 1 (Mimi) ka rule-based brain — TypeScript port.
 * Python version: ~/workspace/mimi-mcp/mimi_brain.py
 *
 * Hamesha jawab deta hai, kabhi fail nahi.
 * Devanagari input → Devanagari jawab, Roman input → Hinglish jawab.
 */

type BrainResult = {
  answer: string;
  emotion: string;
  brain: string;
  is_fallback: boolean;
};

function detectScript(text: string): "devanagari" | "roman" {
  return /[\u0900-\u097F]/.test(text) ? "devanagari" : "roman";
}

function parseEmotion(out: string): { text: string; emotion: string } {
  const m = out.match(/\[([a-z]+)\]\s*$/);
  if (m) return { text: out.slice(0, m.index).trim(), emotion: m[1] };
  return { text: out.trim(), emotion: "neutral" };
}

export function mimiBrainAnswer(text: string, short = false): BrainResult {
  const t = text.toLowerCase().trim();
  const dev = detectScript(text) === "devanagari";
  const now = new Date();
  let out = "";
  let isFallback = false;

  if (/^(namaste|namaskar|hello|hi+|hey|yo|sat sri|adaab|ram ram|नमस्ते|नमस्कार|हेलो|हाय)/.test(t)) {
    out = short
      ? dev ? "नमस्ते नमस्ते! 😊 बताओ, क्या पूछना है? [happy]" : "Namaste namaste! 😊 Batao, kya poochna hai? [happy]"
      : dev ? "नमस्ते दोस्त! 😊 मैं Mimi हूँ — तुम्हारी cute robot दोस्त! [happy]" : "Namaste dost! 😊 Main Mimi hun — tumhari cute robot dost! [happy]";
  } else if (/tumhara naam|tera naam|your name|who are you|tum kaun|aap kaun|तुम्हारा नाम|तेरा नाम|तुम कौन|आप कौन/.test(t)) {
    out = dev ? "मैं Mimi हूँ — तुम्हारी cute robot दोस्त! 🤖 [happy]" : "Main Mimi hun — tumhari cute robot dost! 🤖 [happy]";
  } else if (/mini 2|version 2|tumhara bhai|mini two/.test(t)) {
    out = dev
      ? "Mini 2 मेरा छोटा भाई है — MCP platform! हम दोनों अब एक साथ काम करते हैं 🤖🤝 [happy]"
      : "Mini 2 mera chhota bhai hai — MCP platform! Hum dono ab ek saath kaam karte hain 🤖🤝 [happy]";
  } else if (/time|samay|kitne baje|baj rahe|baje hain|समय|कितने बजे|बज रहे/.test(t)) {
    const tm = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    out = dev ? `अभी ${tm} बज रहे हैं ⏰ [happy]` : `Abhi ${tm} baj rahe hain ⏰ [happy]`;
  } else if (/date|tareekh|तारीख|आज/.test(t)) {
    const dt = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    out = dev ? `आज ${dt} है 📅 [happy]` : `Aaj ${dt} hai 📅 [happy]`;
  } else if (/joke|mazaak|mazak|hasa|funny|चुटकुला|मजाक|मज़ाक|हंसाओ|हँसाओ/.test(t)) {
    out = dev
      ? 'एक सुनो: कंप्यूटर ने कीबोर्ड से क्या कहा? "तुम मेरे type की हो!" 😄 [laugh]'
      : 'Ek suno: Computer ne keyboard se kya kaha? "Tum mere type ki ho!" 😄 [laugh]';
  } else if (/shukriya|thanks|dhanyavad|thank you|धन्यवाद|शुक्रिया/.test(t)) {
    out = dev ? "कोई बात नहीं दोस्त! हमेशा खुश रहो 💖 [love]" : "Koi baat nahi dost! Hamesha khush raho 💖 [love]";
  } else if (/^(bye|alvida|phir milenge|good night|goodnight|अलविदा|फिर मिलेंगे)/.test(t)) {
    out = dev ? "बाय बाय! फिर मिलेंगे! 👋 [happy]" : "Bye bye! Phir milenge! 👋 [happy]";
  } else if (/tum kaise ho|kaise ho|how are you|तुम कैसे हो|कैसे हो/.test(t)) {
    out = dev
      ? "मैं एकदम बढ़िया हूँ! तुम सुनाओ, क्या चल रहा है? 😊 [happy]"
      : "Main ekdum badhiya hun! Tum sunao, kya chal raha hai? 😊 [happy]";
  } else if (/tum kya kar sakti|kya kar sakte|what can you do|तुम क्या कर/.test(t)) {
    out = dev
      ? "मैं बात कर सकती हूँ, jokes सुना सकती हूँ, time बता सकती हूँ! और Mini 2 के साथ मिलकर tasks भी manage करती हूँ 🤖 [happy]"
      : "Main baat kar sakti hun, jokes suna sakti hun, time bata sakti hun! Aur Mini 2 ke saath milkar tasks bhi manage karti hun 🤖 [happy]";
  } else {
    isFallback = true;
    out = dev
      ? "Hmm, ye samajh nahi aaya! Kuch aur poocho — jaise 'time kya hai' ya 'joke sunao' 😊 [thinking]"
      : "Hmm, ye samajh nahi aaya! Kuch aur poocho — jaise 'time kya hai' ya 'joke sunao' 😊 [thinking]";
  }

  const { text: answer, emotion } = parseEmotion(out);
  return { answer, emotion, brain: "mimi-rule-based", is_fallback: isFallback };
}

/**
 * mimi_ask — Mini 1 ka main tool, ab Mini 2 me.
 * Question → rule-based brain → JSON response.
 */
export function mimiAsk(question: string, sessionId = ""): string {
  if (!question || !question.trim()) {
    return JSON.stringify({ error: "Sawal khaali hai — kuch poocho to sahi!" });
  }
  const q = question.trim().slice(0, 2000);
  const sid = sessionId.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 64);
  const result = mimiBrainAnswer(q);

  return JSON.stringify(
    {
      answer: result.answer,
      emotion: result.emotion,
      brain: result.brain,
      is_fallback: result.is_fallback,
      question: q,
      session_id: sid || null,
      used_llm: false,
      note: "Rule-based brain. Groq AI not configured on Mini 2 yet.",
      timestamp: new Date().toISOString(),
    },
    null,
    2
  );
}
