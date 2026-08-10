/**
 * Rebuild German CEFR vocabulary for study quality.
 *
 * Model:
 *  - tier: "core"  → ready-made practice sets + primary study lists
 *  - tier: "extra" → extract-from-text only (broader coverage, still levelled)
 *
 * Levels: 1=A1 … 6=C2
 *
 * Run: node rebuild-vocabulary.js
 * Writes: vocabulary.js
 */
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Curated CORE lists (high-frequency learner German)
// Format: [word, article|'', meaning, level]
// ---------------------------------------------------------------------------
const CORE = [
  // ===== A1 (~420) — survival German =====
  ['ich', '', 'I', 1], ['du', '', 'you (informal)', 1], ['er', '', 'he', 1], ['sie', '', 'she; they; you (formal)', 1],
  ['es', '', 'it', 1], ['wir', '', 'we', 1], ['ihr', '', 'you (plural informal)', 1],
  ['mein', '', 'my', 1], ['dein', '', 'your', 1], ['sein', '', 'his; to be', 1], ['ihr', '', 'her; their', 1],
  ['unser', '', 'our', 1], ['euer', '', 'your (pl.)', 1],
  ['dieser', '', 'this', 1], ['jener', '', 'that', 1], ['alle', '', 'all', 1], ['viel', '', 'much; many', 1],
  ['wenig', '', 'little; few', 1], ['mehr', '', 'more', 1], ['kein', '', 'no; not a', 1],
  ['ja', '', 'yes', 1], ['nein', '', 'no', 1], ['bitte', '', 'please', 1], ['danke', '', 'thank you', 1],
  ['hallo', '', 'hello', 1], ['tschüss', '', 'bye', 1], ['guten Tag', '', 'good day', 1],
  ['guten Morgen', '', 'good morning', 1], ['gute Nacht', '', 'good night', 1],
  ['und', '', 'and', 1], ['oder', '', 'or', 1], ['aber', '', 'but', 1], ['weil', '', 'because', 1],
  ['wenn', '', 'if; when', 1], ['dass', '', 'that (conjunction)', 1], ['ob', '', 'whether', 1],
  ['mit', '', 'with', 1], ['ohne', '', 'without', 1], ['für', '', 'for', 1], ['von', '', 'from; of', 1],
  ['zu', '', 'to; too', 1], ['in', '', 'in', 1], ['auf', '', 'on', 1], ['an', '', 'at; on', 1],
  ['aus', '', 'from; out of', 1], ['bei', '', 'at; with', 1], ['nach', '', 'after; to', 1],
  ['vor', '', 'before; in front of', 1], ['über', '', 'over; about', 1], ['unter', '', 'under', 1],
  ['zwischen', '', 'between', 1], ['durch', '', 'through', 1], ['gegen', '', 'against', 1],
  ['um', '', 'around; at (time)', 1], ['bis', '', 'until', 1], ['seit', '', 'since', 1],
  ['hier', '', 'here', 1], ['dort', '', 'there', 1], ['wo', '', 'where', 1], ['wann', '', 'when', 1],
  ['wie', '', 'how', 1], ['was', '', 'what', 1], ['wer', '', 'who', 1], ['warum', '', 'why', 1],
  ['nicht', '', 'not', 1], ['auch', '', 'also', 1], ['noch', '', 'still; yet', 1], ['schon', '', 'already', 1],
  ['nur', '', 'only', 1], ['sehr', '', 'very', 1], ['gut', '', 'good', 1], ['schlecht', '', 'bad', 1],
  ['groß', '', 'big', 1], ['klein', '', 'small', 1], ['neu', '', 'new', 1], ['alt', '', 'old', 1],
  ['jung', '', 'young', 1], ['schön', '', 'beautiful; nice', 1], ['hässlich', '', 'ugly', 1],
  ['teuer', '', 'expensive', 1], ['billig', '', 'cheap', 1], ['schnell', '', 'fast', 1], ['langsam', '', 'slow', 1],
  ['leicht', '', 'easy; light', 1], ['schwer', '', 'hard; heavy', 1], ['richtig', '', 'correct', 1],
  ['falsch', '', 'wrong', 1], ['heiss', '', 'hot', 1], ['heiß', '', 'hot', 1], ['kalt', '', 'cold', 1],
  ['warm', '', 'warm', 1], ['müde', '', 'tired', 1], ['krank', '', 'ill', 1], ['gesund', '', 'healthy', 1],
  ['offen', '', 'open', 1], ['zu', '', 'closed; to', 1], ['frei', '', 'free', 1], ['voll', '', 'full', 1],
  ['leer', '', 'empty', 1], ['wichtig', '', 'important', 1], ['möglich', '', 'possible', 1],
  ['eins', '', 'one', 1], ['zwei', '', 'two', 1], ['drei', '', 'three', 1], ['vier', '', 'four', 1],
  ['fünf', '', 'five', 1], ['sechs', '', 'six', 1], ['sieben', '', 'seven', 1], ['acht', '', 'eight', 1],
  ['neun', '', 'nine', 1], ['zehn', '', 'ten', 1], ['elf', '', 'eleven', 1], ['zwölf', '', 'twelve', 1],
  ['hundert', '', 'hundred', 1], ['tausend', '', 'thousand', 1],
  ['Montag', '', 'Monday', 1], ['Dienstag', '', 'Tuesday', 1], ['Mittwoch', '', 'Wednesday', 1],
  ['Donnerstag', '', 'Thursday', 1], ['Freitag', '', 'Friday', 1], ['Samstag', '', 'Saturday', 1],
  ['Sonntag', '', 'Sunday', 1], ['Woche', 'die', 'week', 1], ['Monat', 'der', 'month', 1],
  ['Jahr', 'das', 'year', 1], ['Tag', 'der', 'day', 1], ['heute', '', 'today', 1], ['morgen', '', 'tomorrow', 1],
  ['gestern', '', 'yesterday', 1], ['jetzt', '', 'now', 1], ['später', '', 'later', 1], ['früh', '', 'early', 1],
  ['Uhr', 'die', 'clock; o\'clock', 1], ['Stunde', 'die', 'hour', 1], ['Minute', 'die', 'minute', 1],
  ['Mann', 'der', 'man', 1], ['Frau', 'die', 'woman; Mrs', 1], ['Kind', 'das', 'child', 1],
  ['Vater', 'der', 'father', 1], ['Mutter', 'die', 'mother', 1], ['Eltern', '', 'parents', 1],
  ['Bruder', 'der', 'brother', 1], ['Schwester', 'die', 'sister', 1], ['Freund', 'der', 'friend (m)', 1],
  ['Freundin', 'die', 'friend (f); girlfriend', 1], ['Familie', 'die', 'family', 1],
  ['Name', 'der', 'name', 1], ['Person', 'die', 'person', 1], ['Leute', '', 'people', 1],
  ['Lehrer', 'der', 'teacher (m)', 1], ['Lehrerin', 'die', 'teacher (f)', 1],
  ['Schüler', 'der', 'pupil (m)', 1], ['Schülerin', 'die', 'pupil (f)', 1],
  ['Student', 'der', 'student (m)', 1], ['Studentin', 'die', 'student (f)', 1],
  ['Arzt', 'der', 'doctor (m)', 1], ['Ärztin', 'die', 'doctor (f)', 1],
  ['Haus', 'das', 'house', 1], ['Wohnung', 'die', 'apartment', 1], ['Zimmer', 'das', 'room', 1],
  ['Küche', 'die', 'kitchen', 1], ['Bad', 'das', 'bathroom', 1], ['Tür', 'die', 'door', 1],
  ['Fenster', 'das', 'window', 1], ['Tisch', 'der', 'table', 1], ['Stuhl', 'der', 'chair', 1],
  ['Bett', 'das', 'bed', 1], ['Schrank', 'der', 'cupboard', 1], ['Lampe', 'die', 'lamp', 1],
  ['Stadt', 'die', 'city', 1], ['Dorf', 'das', 'village', 1], ['Land', 'das', 'country; land', 1],
  ['Straße', 'die', 'street', 1], ['Weg', 'der', 'path; way', 1], ['Platz', 'der', 'square; place', 1],
  ['Bahnhof', 'der', 'train station', 1], ['Flughafen', 'der', 'airport', 1],
  ['Bus', 'der', 'bus', 1], ['Zug', 'der', 'train', 1], ['Auto', 'das', 'car', 1],
  ['Fahrrad', 'das', 'bicycle', 1], ['Ticket', 'das', 'ticket', 1],
  ['Schule', 'die', 'school', 1], ['Universität', 'die', 'university', 1],
  ['Büro', 'das', 'office', 1], ['Arbeit', 'die', 'work', 1], ['Job', 'der', 'job', 1],
  ['Laden', 'der', 'shop', 1], ['Supermarkt', 'der', 'supermarket', 1],
  ['Restaurant', 'das', 'restaurant', 1], ['Café', 'das', 'café', 1], ['Hotel', 'das', 'hotel', 1],
  ['Krankenhaus', 'das', 'hospital', 1], ['Bank', 'die', 'bank; bench', 1],
  ['Post', 'die', 'post office; mail', 1], ['Park', 'der', 'park', 1],
  ['Brot', 'das', 'bread', 1], ['Butter', 'die', 'butter', 1], ['Käse', 'der', 'cheese', 1],
  ['Milch', 'die', 'milk', 1], ['Wasser', 'das', 'water', 1], ['Saft', 'der', 'juice', 1],
  ['Kaffee', 'der', 'coffee', 1], ['Tee', 'der', 'tea', 1], ['Bier', 'das', 'beer', 1],
  ['Wein', 'der', 'wine', 1], ['Fleisch', 'das', 'meat', 1], ['Fisch', 'der', 'fish', 1],
  ['Ei', 'das', 'egg', 1], ['Obst', 'das', 'fruit', 1], ['Gemüse', 'das', 'vegetables', 1],
  ['Apfel', 'der', 'apple', 1], ['Banane', 'die', 'banana', 1], ['Orange', 'die', 'orange', 1],
  ['Kartoffel', 'die', 'potato', 1], ['Reis', 'der', 'rice', 1], ['Salat', 'der', 'salad', 1],
  ['Suppe', 'die', 'soup', 1], ['Kuchen', 'der', 'cake', 1], ['Zucker', 'der', 'sugar', 1],
  ['Salz', 'das', 'salt', 1], ['Essen', 'das', 'food; meal', 1], ['Frühstück', 'das', 'breakfast', 1],
  ['Mittagessen', 'das', 'lunch', 1], ['Abendessen', 'das', 'dinner', 1],
  ['Hund', 'der', 'dog', 1], ['Katze', 'die', 'cat', 1], ['Tier', 'das', 'animal', 1],
  ['Farbe', 'die', 'color', 1], ['rot', '', 'red', 1], ['blau', '', 'blue', 1], ['grün', '', 'green', 1],
  ['gelb', '', 'yellow', 1], ['schwarz', '', 'black', 1], ['weiß', '', 'white', 1], ['braun', '', 'brown', 1],
  ['Buch', 'das', 'book', 1], ['Zeitung', 'die', 'newspaper', 1], ['Brief', 'der', 'letter', 1],
  ['Handy', 'das', 'mobile phone', 1], ['Telefon', 'das', 'telephone', 1],
  ['Computer', 'der', 'computer', 1], ['Internet', 'das', 'internet', 1],
  ['Fernseher', 'der', 'TV set', 1], ['Film', 'der', 'film', 1], ['Musik', 'die', 'music', 1],
  ['Sport', 'der', 'sport', 1], ['Spiel', 'das', 'game', 1],
  ['Geld', 'das', 'money', 1], ['Euro', 'der', 'euro', 1], ['Preis', 'der', 'price', 1],
  ['Karte', 'die', 'card; map; menu', 1], ['Schlüssel', 'der', 'key', 1],
  ['Tasche', 'die', 'bag', 1], ['Kleidung', 'die', 'clothing', 1],
  ['Hose', 'die', 'trousers', 1], ['Jacke', 'die', 'jacket', 1], ['Schuh', 'der', 'shoe', 1],
  ['Hemd', 'das', 'shirt', 1], ['Kleid', 'das', 'dress', 1],
  ['Wetter', 'das', 'weather', 1], ['Sonne', 'die', 'sun', 1], ['Regen', 'der', 'rain', 1],
  ['Schnee', 'der', 'snow', 1], ['Wind', 'der', 'wind', 1], ['Himmel', 'der', 'sky; heaven', 1],
  ['Zeit', 'die', 'time', 1], ['Problem', 'das', 'problem', 1], ['Frage', 'die', 'question', 1],
  ['Antwort', 'die', 'answer', 1], ['Idee', 'die', 'idea', 1], ['Sprache', 'die', 'language', 1],
  ['Deutsch', 'das', 'German (language)', 1], ['Englisch', 'das', 'English', 1],
  ['Wort', 'das', 'word', 1], ['Satz', 'der', 'sentence', 1], ['Text', 'der', 'text', 1],
  ['Nummer', 'die', 'number', 1], ['Adresse', 'die', 'address', 1],
  ['Deutschland', '', 'Germany', 1], ['Berlin', '', 'Berlin', 1],
  // core A1 verbs
  ['sein', '', 'to be', 1], ['haben', '', 'to have', 1], ['werden', '', 'to become; will', 1],
  ['können', '', 'can; to be able', 1], ['müssen', '', 'must; to have to', 1],
  ['wollen', '', 'to want', 1], ['sollen', '', 'should; ought to', 1],
  ['dürfen', '', 'may; to be allowed', 1], ['mögen', '', 'to like', 1],
  ['machen', '', 'to make; do', 1], ['tun', '', 'to do', 1], ['gehen', '', 'to go', 1],
  ['kommen', '', 'to come', 1], ['fahren', '', 'to drive; go (vehicle)', 1],
  ['laufen', '', 'to run; walk', 1], ['sehen', '', 'to see', 1], ['hören', '', 'to hear', 1],
  ['sprechen', '', 'to speak', 1], ['sagen', '', 'to say', 1], ['fragen', '', 'to ask', 1],
  ['antworten', '', 'to answer', 1], ['heißen', '', 'to be called', 1],
  ['wohnen', '', 'to live (reside)', 1], ['leben', '', 'to live', 1],
  ['arbeiten', '', 'to work', 1], ['lernen', '', 'to learn', 1], ['studieren', '', 'to study', 1],
  ['lesen', '', 'to read', 1], ['schreiben', '', 'to write', 1], ['verstehen', '', 'to understand', 1],
  ['wissen', '', 'to know (facts)', 1], ['kennen', '', 'to know (people/places)', 1],
  ['finden', '', 'to find', 1], ['suchen', '', 'to search', 1], ['geben', '', 'to give', 1],
  ['nehmen', '', 'to take', 1], ['bringen', '', 'to bring', 1], ['kaufen', '', 'to buy', 1],
  ['verkaufen', '', 'to sell', 1], ['bezahlen', '', 'to pay', 1], ['kosten', '', 'to cost', 1],
  ['essen', '', 'to eat', 1], ['trinken', '', 'to drink', 1], ['kochen', '', 'to cook', 1],
  ['schlafen', '', 'to sleep', 1], ['aufstehen', '', 'to get up', 1],
  ['öffnen', '', 'to open', 1], ['schließen', '', 'to close', 1],
  ['beginnen', '', 'to begin', 1], ['enden', '', 'to end', 1], ['warten', '', 'to wait', 1],
  ['helfen', '', 'to help', 1], ['spielen', '', 'to play', 1], ['schwimmen', '', 'to swim', 1],
  ['reisen', '', 'to travel', 1], ['besuchen', '', 'to visit', 1],
  ['lieben', '', 'to love', 1], ['brauchen', '', 'to need', 1],
  ['glauben', '', 'to believe', 1], ['denken', '', 'to think', 1],
  ['fühlen', '', 'to feel', 1], ['scheinen', '', 'to seem; shine', 1],
  ['regnen', '', 'to rain', 1], ['schneien', '', 'to snow', 1],
  ['anrufen', '', 'to call (phone)', 1], ['ankommen', '', 'to arrive', 1],
  ['abfahren', '', 'to depart', 1], ['einsteigen', '', 'to get on', 1],
  ['aussteigen', '', 'to get off', 1], ['umsteigen', '', 'to change (transport)', 1],
  ['mitbringen', '', 'to bring along', 1], ['mitkommen', '', 'to come along', 1],
  ['aufmachen', '', 'to open', 1], ['zumachen', '', 'to close', 1],
  ['anziehen', '', 'to put on (clothes)', 1], ['ausziehen', '', 'to take off', 1],
  ['bestellen', '', 'to order', 1], ['reservieren', '', 'to reserve', 1],
  ['zeigen', '', 'to show', 1], ['erklären', '', 'to explain', 1],
  ['wiederholen', '', 'to repeat', 1], ['probieren', '', 'to try', 1],
  ['passen', '', 'to fit; suit', 1], ['funktionieren', '', 'to work (function)', 1],

  // ===== A2 (~350) — everyday expansion =====
  ['etwas', '', 'something', 2], ['nichts', '', 'nothing', 2], ['jemand', '', 'someone', 2],
  ['niemand', '', 'nobody', 2], ['immer', '', 'always', 2], ['nie', '', 'never', 2],
  ['oft', '', 'often', 2], ['manchmal', '', 'sometimes', 2], ['meist', '', 'mostly', 2],
  ['vielleicht', '', 'maybe', 2], ['natürlich', '', 'of course; natural', 2],
  ['eigentlich', '', 'actually', 2], ['wirklich', '', 'really', 2],
  ['ziemlich', '', 'quite', 2], ['besonders', '', 'especially', 2],
  ['deshalb', '', 'therefore', 2], ['trotzdem', '', 'nevertheless', 2],
  ['obwohl', '', 'although', 2], ['bevor', '', 'before', 2], ['nachdem', '', 'after', 2],
  ['während', '', 'during; while', 2], ['sobald', '', 'as soon as', 2],
  ['Kollege', 'der', 'colleague (m)', 2], ['Kollegin', 'die', 'colleague (f)', 2],
  ['Chef', 'der', 'boss', 2], ['Nachbar', 'der', 'neighbor', 2],
  ['Gast', 'der', 'guest', 2], ['Kunde', 'der', 'customer', 2],
  ['Polizist', 'der', 'police officer', 2], ['Kellner', 'der', 'waiter', 2],
  ['Wohnzimmer', 'das', 'living room', 2], ['Schlafzimmer', 'das', 'bedroom', 2],
  ['Garten', 'der', 'garden', 2], ['Balkon', 'der', 'balcony', 2],
  ['Kühlschrank', 'der', 'fridge', 2], ['Herd', 'der', 'stove', 2],
  ['Waschmaschine', 'die', 'washing machine', 2],
  ['Möbel', '', 'furniture', 2], ['Teppich', 'der', 'carpet', 2],
  ['Spiegel', 'der', 'mirror', 2], ['Regal', 'das', 'shelf', 2],
  ['Miete', 'die', 'rent', 2], ['Strom', 'der', 'electricity', 2],
  ['Heizung', 'die', 'heating', 2], ['Müll', 'der', 'rubbish', 2],
  ['Einkaufen', 'das', 'shopping', 2], ['Rechnung', 'die', 'bill; invoice', 2],
  ['Quittung', 'die', 'receipt', 2], ['Rabatt', 'der', 'discount', 2],
  ['Angebot', 'das', 'offer; special', 2], ['Geschäft', 'das', 'shop; business', 2],
  ['Apotheke', 'die', 'pharmacy', 2], ['Bäckerei', 'die', 'bakery', 2],
  ['Metzgerei', 'die', 'butcher\'s', 2], ['Markt', 'der', 'market', 2],
  ['Zentrum', 'das', 'center', 2], ['Vorort', 'der', 'suburb', 2],
  ['Brücke', 'die', 'bridge', 2], ['Ampel', 'die', 'traffic light', 2],
  ['Ecke', 'die', 'corner', 2], ['Richtung', 'die', 'direction', 2],
  ['links', '', 'left', 2], ['rechts', '', 'right', 2], ['geradeaus', '', 'straight ahead', 2],
  ['nah', '', 'near', 2], ['weit', '', 'far', 2],
  ['Termin', 'der', 'appointment', 2], ['Einladung', 'die', 'invitation', 2],
  ['Geburtstag', 'der', 'birthday', 2], ['Feier', 'die', 'celebration', 2],
  ['Urlaub', 'der', 'holiday; vacation', 2], ['Reise', 'die', 'trip', 2],
  ['Koffer', 'der', 'suitcase', 2], ['Pass', 'der', 'passport', 2],
  ['Ausweis', 'der', 'ID card', 2], ['Visum', 'das', 'visa', 2],
  ['Wetterbericht', 'der', 'weather forecast', 2], ['Temperatur', 'die', 'temperature', 2],
  ['Grad', 'der', 'degree', 2], ['wolken', '', 'cloudy (root)', 2], ['bewölkt', '', 'cloudy', 2],
  ['sonnig', '', 'sunny', 2], ['neblig', '', 'foggy', 2],
  ['Frühling', 'der', 'spring', 2], ['Sommer', 'der', 'summer', 2],
  ['Herbst', 'der', 'autumn', 2], ['Winter', 'der', 'winter', 2],
  ['Hobby', 'das', 'hobby', 2], ['Interesse', 'das', 'interest', 2],
  ['Freizeit', 'die', 'free time', 2], ['Kino', 'das', 'cinema', 2],
  ['Theater', 'das', 'theater', 2], ['Museum', 'das', 'museum', 2],
  ['Konzert', 'das', 'concert', 2], ['Party', 'die', 'party', 2],
  ['Sportplatz', 'der', 'sports field', 2], ['Schwimmbad', 'das', 'swimming pool', 2],
  ['Gesundheit', 'die', 'health', 2], ['Schmerz', 'der', 'pain', 2],
  ['Kopf', 'der', 'head', 2], ['Auge', 'das', 'eye', 2], ['Ohr', 'das', 'ear', 2],
  ['Mund', 'der', 'mouth', 2], ['Hand', 'die', 'hand', 2], ['Fuß', 'der', 'foot', 2],
  ['Körper', 'der', 'body', 2], ['Herz', 'das', 'heart', 2],
  ['Medizin', 'die', 'medicine', 2], ['Tablette', 'die', 'tablet', 2],
  ['Rezept', 'das', 'prescription; recipe', 2],
  ['Nachricht', 'die', 'message; news', 2], ['E-Mail', 'die', 'email', 2],
  ['Foto', 'das', 'photo', 2], ['Video', 'das', 'video', 2],
  ['Plan', 'der', 'plan', 2], ['Ziel', 'das', 'goal', 2],
  ['Grund', 'der', 'reason', 2], ['Beispiel', 'das', 'example', 2],
  ['Möglichkeit', 'die', 'possibility', 2], ['Erfahrung', 'die', 'experience', 2],
  ['Meinung', 'die', 'opinion', 2], ['Gefühl', 'das', 'feeling', 2],
  ['Angst', 'die', 'fear', 2], ['Freude', 'die', 'joy', 2],
  ['Stress', 'der', 'stress', 2], ['Ruhe', 'die', 'calm; rest', 2],
  ['laut', '', 'loud', 2], ['leise', '', 'quiet', 2],
  ['sauber', '', 'clean', 2], ['schmutzig', '', 'dirty', 2],
  ['gefährlich', '', 'dangerous', 2], ['sicher', '', 'safe; sure', 2],
  ['interessant', '', 'interesting', 2], ['langweilig', '', 'boring', 2],
  ['praktisch', '', 'practical', 2], ['bequem', '', 'comfortable', 2],
  ['freundlich', '', 'friendly', 2], ['höflich', '', 'polite', 2],
  ['nervös', '', 'nervous', 2], ['zufrieden', '', 'satisfied', 2],
  ['überrascht', '', 'surprised', 2], ['enttäuscht', '', 'disappointed', 2],
  ['bekommen', '', 'to get; receive', 2], ['bekommen', '', 'to get', 2],
  ['verdienen', '', 'to earn', 2], ['sparen', '', 'to save (money)', 2],
  ['ausgeben', '', 'to spend', 2], ['leihen', '', 'to lend; borrow', 2],
  ['vergleichen', '', 'to compare', 2], ['entscheiden', '', 'to decide', 2],
  ['wählen', '', 'to choose', 2], ['probieren', '', 'to try', 2],
  ['ändern', '', 'to change', 2], ['verbessern', '', 'to improve', 2],
  ['erzählen', '', 'to tell', 2], ['berichten', '', 'to report', 2],
  ['beschreiben', '', 'to describe', 2], ['vorschlagen', '', 'to suggest', 2],
  ['versprechen', '', 'to promise', 2], ['vergessen', '', 'to forget', 2],
  ['erinnern', '', 'to remember', 2], ['merken', '', 'to notice', 2],
  ['hoffentlich', '', 'hopefully', 2], ['hoffentlich', '', 'hopefully', 2],
  ['hoffen', '', 'to hope', 2], ['wünschen', '', 'to wish', 2],
  ['freuen', '', 'to be glad', 2], ['ärgern', '', 'to annoy', 2],
  ['lachen', '', 'to laugh', 2], ['weinen', '', 'to cry', 2],
  ['feiern', '', 'to celebrate', 2], ['einladen', '', 'to invite', 2],
  ['besuchen', '', 'to visit', 2], ['treffen', '', 'to meet', 2],
  ['kennenlernen', '', 'to get to know', 2], ['vorstellen', '', 'to introduce; imagine', 2],
  ['sich fühlen', '', 'to feel', 2], ['sich freuen', '', 'to be happy', 2],
  ['sich waschen', '', 'to wash oneself', 2], ['sich anziehen', '', 'to get dressed', 2],
  ['putzen', '', 'to clean', 2], ['aufräumen', '', 'to tidy up', 2],
  ['kochen', '', 'to cook', 2], ['backen', '', 'to bake', 2],
  ['schneiden', '', 'to cut', 2], ['mischen', '', 'to mix', 2],
  ['parken', '', 'to park', 2], ['überqueren', '', 'to cross', 2],
  ['erreichen', '', 'to reach', 2], ['verpassen', '', 'to miss', 2],
  ['buchen', '', 'to book', 2], ['stornieren', '', 'to cancel', 2],
  ['prüfen', '', 'to check', 2], ['testen', '', 'to test', 2],
  ['üben', '', 'to practice', 2], ['üben', '', 'to practice', 2],
  ['bestehen', '', 'to pass (exam); exist', 2], ['durchfallen', '', 'to fail (exam)', 2],
  ['bestehen', '', 'to pass', 2],
  ['mitteilen', '', 'to inform', 2], ['informieren', '', 'to inform', 2],
  ['melden', '', 'to report', 2], ['anmelden', '', 'to register', 2],
  ['abmelden', '', 'to deregister', 2], ['unterschreiben', '', 'to sign', 2],
  ['ausfüllen', '', 'to fill in', 2], ['abschicken', '', 'to send off', 2],

  // ===== B1 (~300) — independence =====
  ['allerdings', '', 'however', 3], ['jedoch', '', 'however', 3],
  ['zwar', '', 'admittedly', 3], ['dennoch', '', 'still; yet', 3],
  ['außerdem', '', 'besides', 3], ['außerdem', '', 'in addition', 3],
  ['stattdessen', '', 'instead', 3], ['inzwischen', '', 'meanwhile', 3],
  ['allmählich', '', 'gradually', 3], ['plötzlich', '', 'suddenly', 3],
  ['sofort', '', 'immediately', 3], ['bald', '', 'soon', 3],
  ['mindestens', '', 'at least', 3], ['höchstens', '', 'at most', 3],
  ['ungefähr', '', 'approximately', 3], ['genau', '', 'exactly', 3],
  ['offenbar', '', 'apparently', 3], ['wahrscheinlich', '', 'probably', 3],
  ['Gesellschaft', 'die', 'society; company', 3], ['Umwelt', 'die', 'environment', 3],
  ['Politik', 'die', 'politics', 3], ['Wirtschaft', 'die', 'economy', 3],
  ['Bildung', 'die', 'education', 3], ['Kultur', 'die', 'culture', 3],
  ['Technik', 'die', 'technology', 3], ['Wissenschaft', 'die', 'science', 3],
  ['Medien', '', 'media', 3], ['Nachrichtensendung', 'die', 'news program', 3],
  ['Artikel', 'der', 'article', 3], ['Bericht', 'der', 'report', 3],
  ['Interview', 'das', 'interview', 3], ['Diskussion', 'die', 'discussion', 3],
  ['Meinungsaustausch', 'der', 'exchange of views', 3],
  ['Vorteil', 'der', 'advantage', 3], ['Nachteil', 'der', 'disadvantage', 3],
  ['Lösung', 'die', 'solution', 3], ['Entscheidung', 'die', 'decision', 3],
  ['Verantwortung', 'die', 'responsibility', 3], ['Recht', 'das', 'right; law', 3],
  ['Pflicht', 'die', 'duty', 3], ['Regel', 'die', 'rule', 3],
  ['Gesetz', 'das', 'law', 3], ['Behörde', 'die', 'authority', 3],
  ['Antrag', 'der', 'application', 3], ['Formular', 'das', 'form', 3],
  ['Bewerbung', 'die', 'job application', 3], ['Lebenslauf', 'der', 'CV', 3],
  ['Vorstellungsgespräch', 'das', 'job interview', 3],
  ['Gehalt', 'das', 'salary', 3], ['Vertrag', 'der', 'contract', 3],
  ['Kündigung', 'die', 'notice of termination', 3],
  ['Ausbildung', 'die', 'training; apprenticeship', 3],
  ['Beruf', 'der', 'profession', 3], ['Branche', 'die', 'industry sector', 3],
  ['Projekt', 'das', 'project', 3], ['Aufgabe', 'die', 'task', 3],
  ['Team', 'das', 'team', 3], ['Sitzung', 'die', 'meeting', 3],
  ['Präsentation', 'die', 'presentation', 3],
  ['Beziehung', 'die', 'relationship', 3], ['Partnerschaft', 'die', 'partnership', 3],
  ['Hochzeit', 'die', 'wedding', 3], ['Trennung', 'die', 'separation', 3],
  ['Nachbarschaft', 'die', 'neighborhood', 3],
  ['Verkehr', 'der', 'traffic', 3], ['Stau', 'der', 'traffic jam', 3],
  ['Öffentlichkeit', 'die', 'public', 3], ['Privatsphäre', 'die', 'privacy', 3],
  ['Umweltschutz', 'der', 'environmental protection', 3],
  ['Klimawandel', 'der', 'climate change', 3], ['Energie', 'die', 'energy', 3],
  ['Abfall', 'der', 'waste', 3], ['Recycling', 'das', 'recycling', 3],
  ['Ernährung', 'die', 'nutrition', 3], ['Diät', 'die', 'diet', 3],
  ['Fitness', 'die', 'fitness', 3], ['Training', 'das', 'training', 3],
  ['Verletzung', 'die', 'injury', 3], ['Untersuchung', 'die', 'examination', 3],
  ['Behandlung', 'die', 'treatment', 3], ['Versicherung', 'die', 'insurance', 3],
  ['Steuer', 'die', 'tax', 3], ['Konto', 'das', 'account', 3],
  ['Überweisung', 'die', 'bank transfer', 3], ['Bargeld', 'das', 'cash', 3],
  ['Kreditkarte', 'die', 'credit card', 3], ['Schulden', '', 'debts', 3],
  ['Wohnungsanzeige', 'die', 'housing ad', 3], ['Kaution', 'die', 'deposit', 3],
  ['Mitbewohner', 'der', 'flatmate', 3],
  ['verantwortlich', '', 'responsible', 3], ['selbstständig', '', 'independent; self-employed', 3],
  ['erfolgreich', '', 'successful', 3], ['schwierig', '', 'difficult', 3],
  ['einfach', '', 'simple', 3], ['kompliziert', '', 'complicated', 3],
  ['nötig', '', 'necessary', 3], ['sinnvoll', '', 'sensible', 3],
  ['nützlich', '', 'useful', 3], ['schädlich', '', 'harmful', 3],
  ['üblich', '', 'usual', 3], ['selten', '', 'rare', 3],
  ['modern', '', 'modern', 3], ['traditionell', '', 'traditional', 3],
  ['global', '', 'global', 3], ['lokal', '', 'local', 3],
  ['öffentlich', '', 'public', 3], ['privat', '', 'private', 3],
  ['legal', '', 'legal', 3], ['illegal', '', 'illegal', 3],
  ['erreichen', '', 'to achieve; reach', 3], ['schaffen', '', 'to manage; create', 3],
  ['vermeiden', '', 'to avoid', 3], ['verhindern', '', 'to prevent', 3],
  ['verursachen', '', 'to cause', 3], ['beeinflussen', '', 'to influence', 3],
  ['unterstützen', '', 'to support', 3], ['fördern', '', 'to promote', 3],
  ['fordern', '', 'to demand', 3], ['verlangen', '', 'to demand; require', 3],
  ['anbieten', '', 'to offer', 3], ['liefern', '', 'to deliver', 3],
  ['herstellen', '', 'to produce', 3], ['entwickeln', '', 'to develop', 3],
  ['untersuchen', '', 'to examine', 3], ['analysieren', '', 'to analyze', 3],
  ['beurteilen', '', 'to judge; assess', 3], ['bewerten', '', 'to evaluate', 3],
  ['kritisieren', '', 'to criticize', 3], ['loben', '', 'to praise', 3],
  ['beschweren', '', 'to complain', 3], ['sich beschweren', '', 'to complain', 3],
  ['überzeugen', '', 'to convince', 3], ['zweifeln', '', 'to doubt', 3],
  ['vermuten', '', 'to assume', 3], ['erwarten', '', 'to expect', 3],
  ['planen', '', 'to plan', 3], ['organisieren', '', 'to organize', 3],
  ['vorbereiten', '', 'to prepare', 3], ['teilnehmen', '', 'to take part', 3],
  ['beitragen', '', 'to contribute', 3], ['abhängen', '', 'to depend', 3],
  ['sich kümmern', '', 'to take care', 3], ['sich bemühen', '', 'to make an effort', 3],
  ['sich gewöhnen', '', 'to get used to', 3], ['sich erinnern', '', 'to remember', 3],
  ['sich vorstellen', '', 'to imagine; introduce oneself', 3],
  ['sich bewerben', '', 'to apply (for a job)', 3],
  ['kündigen', '', 'to quit; terminate', 3], ['einstellen', '', 'to hire; set', 3],
  ['entlassen', '', 'to dismiss', 3], ['verdienen', '', 'to earn; deserve', 3],
  ['investieren', '', 'to invest', 3], ['sparen', '', 'to save', 3],
  ['verschmutzen', '', 'to pollute', 3], ['schützen', '', 'to protect', 3],
  ['retten', '', 'to save; rescue', 3], ['gefährden', '', 'to endanger', 3],
  ['erlauben', '', 'to allow', 3], ['verbieten', '', 'to forbid', 3],
  ['empfehlen', '', 'to recommend', 3], ['raten', '', 'to advise', 3],
  ['warnen', '', 'to warn', 3], ['drohen', '', 'to threaten', 3],
  ['versprechen', '', 'to promise', 3], ['halten', '', 'to hold; keep', 3],
  ['brechen', '', 'to break', 3], ['reparieren', '', 'to repair', 3],
  ['ersetzen', '', 'to replace', 3], ['tauschen', '', 'to exchange', 3],
  ['teilen', '', 'to share; divide', 3], ['sammeln', '', 'to collect', 3],
  ['messen', '', 'to measure', 3], ['wiegen', '', 'to weigh', 3],
  ['zählen', '', 'to count', 3], ['schätzen', '', 'to estimate; appreciate', 3],

  // ===== B2 (~200) — advanced everyday / abstract =====
  ['aufgrund', '', 'due to', 4], ['hinsichtlich', '', 'regarding', 4],
  ['bezüglich', '', 'regarding', 4], ['angesichts', '', 'in view of', 4],
  ['mithilfe', '', 'with the help of', 4], ['anhand', '', 'on the basis of', 4],
  ['insofern', '', 'insofar', 4], ['demnach', '', 'accordingly', 4],
  ['folglich', '', 'consequently', 4], ['somit', '', 'thus', 4],
  ['zunächst', '', 'first of all', 4], ['schließlich', '', 'finally', 4],
  ['einerseits', '', 'on the one hand', 4], ['andererseits', '', 'on the other hand', 4],
  ['Herausforderung', 'die', 'challenge', 4], ['Chance', 'die', 'opportunity', 4],
  ['Risiko', 'das', 'risk', 4], ['Krise', 'die', 'crisis', 4],
  ['Entwicklung', 'die', 'development', 4], ['Fortschritt', 'der', 'progress', 4],
  ['Veränderung', 'die', 'change', 4], ['Wachstum', 'das', 'growth', 4],
  ['Rückgang', 'der', 'decline', 4], ['Unterschied', 'der', 'difference', 4],
  ['Vergleich', 'der', 'comparison', 4], ['Zusammenhang', 'der', 'connection', 4],
  ['Ursache', 'die', 'cause', 4], ['Folge', 'die', 'consequence', 4],
  ['Wirkung', 'die', 'effect', 4], ['Einfluss', 'der', 'influence', 4],
  ['Argument', 'das', 'argument', 4], ['These', 'die', 'thesis', 4],
  ['Gegenteil', 'das', 'opposite', 4], ['Standpunkt', 'der', 'point of view', 4],
  ['Einstellung', 'die', 'attitude; setting', 4], ['Verhalten', 'das', 'behavior', 4],
  ['Gewohnheit', 'die', 'habit', 4], ['Erwartung', 'die', 'expectation', 4],
  ['Vorurteil', 'das', 'prejudice', 4], ['Toleranz', 'die', 'tolerance', 4],
  ['Vielfalt', 'die', 'diversity', 4], ['Gleichheit', 'die', 'equality', 4],
  ['Freiheit', 'die', 'freedom', 4], ['Gerechtigkeit', 'die', 'justice', 4],
  ['Demokratie', 'die', 'democracy', 4], ['Regierung', 'die', 'government', 4],
  ['Wahl', 'die', 'election; choice', 4], ['Bürger', 'der', 'citizen', 4],
  ['Staat', 'der', 'state', 4], ['Grenze', 'die', 'border', 4],
  ['Migration', 'die', 'migration', 4], ['Integration', 'die', 'integration', 4],
  ['Forschung', 'die', 'research', 4], ['Erfindung', 'die', 'invention', 4],
  ['Entdeckung', 'die', 'discovery', 4], ['Daten', '', 'data', 4],
  ['Digitalisierung', 'die', 'digitalization', 4],
  ['Datenschutz', 'der', 'data protection', 4],
  ['Nachhaltigkeit', 'die', 'sustainability', 4],
  ['Ressource', 'die', 'resource', 4], ['Rohstoff', 'der', 'raw material', 4],
  ['Verbrauch', 'der', 'consumption', 4], ['Produktion', 'die', 'production', 4],
  ['Qualität', 'die', 'quality', 4], ['Standard', 'der', 'standard', 4],
  ['Leistung', 'die', 'performance', 4], ['Wettbewerb', 'der', 'competition', 4],
  ['erheblich', '', 'considerable', 4], ['wesentlich', '', 'essential', 4],
  ['grundsätzlich', '', 'fundamentally', 4], ['relativ', '', 'relative', 4],
  ['absolut', '', 'absolute', 4], ['theoretisch', '', 'theoretical', 4],
  ['praktisch', '', 'practical', 4], ['konkret', '', 'concrete', 4],
  ['abstrakt', '', 'abstract', 4], ['komplex', '', 'complex', 4],
  ['flexibel', '', 'flexible', 4], ['stabil', '', 'stable', 4],
  ['effektiv', '', 'effective', 4], ['effizient', '', 'efficient', 4],
  ['berücksichtigen', '', 'to take into account', 4],
  ['voraussetzen', '', 'to presuppose', 4],
  ['darstellen', '', 'to represent; depict', 4],
  ['bedeuten', '', 'to mean', 4], ['bedeuten', '', 'to mean', 4],
  ['behaupten', '', 'to claim', 4], ['bestätigen', '', 'to confirm', 4],
  ['widerlegen', '', 'to refute', 4], ['begründen', '', 'to justify', 4],
  ['folgern', '', 'to conclude', 4], ['schließen', '', 'to conclude; close', 4],
  ['ableiten', '', 'to derive', 4], ['übertragen', '', 'to transfer', 4],
  ['umsetzen', '', 'to implement', 4], ['durchführen', '', 'to carry out', 4],
  ['bewältigen', '', 'to cope with', 4], ['überwinden', '', 'to overcome', 4],
  ['scheitern', '', 'to fail', 4], ['gelingen', '', 'to succeed', 4],
  ['beitragen', '', 'to contribute', 4], ['führen', '', 'to lead', 4],
  ['lenken', '', 'to steer', 4], ['steuern', '', 'to control; steer', 4],
  ['regulieren', '', 'to regulate', 4], ['kontrollieren', '', 'to control', 4],
  ['überwachen', '', 'to monitor', 4], ['unterscheiden', '', 'to distinguish', 4],
  ['gleichsetzen', '', 'to equate', 4], ['verallgemeinern', '', 'to generalize', 4],
  ['spezifizieren', '', 'to specify', 4], ['definieren', '', 'to define', 4],
  ['interpretieren', '', 'to interpret', 4], ['übersetzen', '', 'to translate', 4],
  ['zusammenfassen', '', 'to summarize', 4], ['hervorheben', '', 'to emphasize', 4],
  ['unterschätzen', '', 'to underestimate', 4], ['überschätzen', '', 'to overestimate', 4],

  // ===== C1 core (~120) =====
  ['inwiefern', '', 'to what extent', 5], ['nichtsdestotrotz', '', 'nonetheless', 5],
  ['gleichwohl', '', 'nevertheless', 5], ['mithin', '', 'hence', 5],
  ['implizit', '', 'implicit', 5], ['explizit', '', 'explicit', 5],
  ['kontrovers', '', 'controversial', 5], ['ambivalent', '', 'ambivalent', 5],
  ['differenziert', '', 'nuanced', 5], ['fundiert', '', 'well-founded', 5],
  ['Plausibilität', 'die', 'plausibility', 5],
  ['Glaubwürdigkeit', 'die', 'credibility', 5],
  ['Transparenz', 'die', 'transparency', 5],
  ['Komplexität', 'die', 'complexity', 5],
  ['Ambivalenz', 'die', 'ambivalence', 5],
  ['Diskurs', 'der', 'discourse', 5],
  ['Paradigma', 'das', 'paradigm', 5],
  ['Hypothese', 'die', 'hypothesis', 5],
  ['Empirie', 'die', 'empirical research', 5],
  ['Methodik', 'die', 'methodology', 5],
  ['Validität', 'die', 'validity', 5],
  ['Relevanz', 'die', 'relevance', 5],
  ['Kohärenz', 'die', 'coherence', 5],
  ['Implikation', 'die', 'implication', 5],
  ['Konsequenz', 'die', 'consequence', 5],
  ['Perspektive', 'die', 'perspective', 5],
  ['Dimension', 'die', 'dimension', 5],
  ['Aspekt', 'der', 'aspect', 5],
  ['Faktor', 'der', 'factor', 5],
  ['Kriterium', 'das', 'criterion', 5],
  ['Indikator', 'der', 'indicator', 5],
  ['Szenario', 'das', 'scenario', 5],
  ['Strategie', 'die', 'strategy', 5],
  ['Konzept', 'das', 'concept', 5],
  ['Ansatz', 'der', 'approach', 5],
  ['Rahmen', 'der', 'framework', 5],
  ['Struktur', 'die', 'structure', 5],
  ['Prozess', 'der', 'process', 5],
  ['Mechanismus', 'der', 'mechanism', 5],
  ['Phänomen', 'das', 'phenomenon', 5],
  ['Tendenz', 'die', 'tendency', 5],
  ['Dynamik', 'die', 'dynamics', 5],
  ['Spannung', 'die', 'tension', 5],
  ['Konflikt', 'der', 'conflict', 5],
  ['Kompromiss', 'der', 'compromise', 5],
  ['Konsens', 'der', 'consensus', 5],
  ['divergieren', '', 'to diverge', 5],
  ['konvergieren', '', 'to converge', 5],
  ['implizieren', '', 'to imply', 5],
  ['relativieren', '', 'to put into perspective', 5],
  ['problematisieren', '', 'to problematize', 5],
  ['thematisieren', '', 'to address (a topic)', 5],
  ['reflektieren', '', 'to reflect', 5],
  ['hinterfragen', '', 'to question critically', 5],
  ['erörtern', '', 'to discuss thoroughly', 5],
  ['darlegen', '', 'to set out', 5],
  ['herausstellen', '', 'to emphasize', 5],
  ['hervorgehen', '', 'to emerge', 5],
  ['resultieren', '', 'to result', 5],
  ['manifestieren', '', 'to manifest', 5],
  ['etablieren', '', 'to establish', 5],
  ['konstituieren', '', 'to constitute', 5],
  ['legitimieren', '', 'to legitimize', 5],
  ['sanktionieren', '', 'to sanction', 5],
  ['reglementieren', '', 'to regulate strictly', 5],
  ['priorisieren', '', 'to prioritize', 5],
  ['optimieren', '', 'to optimize', 5],
  ['evaluieren', '', 'to evaluate', 5],
  ['validieren', '', 'to validate', 5],

  // ===== C2 core (~60) — precise / academic =====
  ['nichtsdestoweniger', '', 'nonetheless', 6],
  ['unbeschadet', '', 'without prejudice to', 6],
  ['inwieweit', '', 'to what degree', 6],
  ['obgleich', '', 'although', 6],
  ['obschon', '', 'although', 6],
  ['obzwar', '', 'although (formal)', 6],
  ['gleichermaßen', '', 'equally', 6],
  ['diesbezüglich', '', 'in this regard', 6],
  ['nachstehend', '', 'below; following', 6],
  ['vorstehend', '', 'above; foregoing', 6],
  ['Prämisse', 'die', 'premise', 6],
  ['Konnotation', 'die', 'connotation', 6],
  ['Denotation', 'die', 'denotation', 6],
  ['Semantik', 'die', 'semantics', 6],
  ['Pragmatik', 'die', 'pragmatics', 6],
  ['Idiosynkrasie', 'die', 'idiosyncrasy', 6],
  ['Nuance', 'die', 'nuance', 6],
  ['Subtilität', 'die', 'subtlety', 6],
  ['Ambiguität', 'die', 'ambiguity', 6],
  ['Redundanz', 'die', 'redundancy', 6],
  ['Reziprozität', 'die', 'reciprocity', 6],
  ['Interdependenz', 'die', 'interdependence', 6],
  ['Kontingenz', 'die', 'contingency', 6],
  ['Inhärenz', 'die', 'inherence', 6],
  ['Affinität', 'die', 'affinity', 6],
  ['Disparität', 'die', 'disparity', 6],
  ['Divergenz', 'die', 'divergence', 6],
  ['Konvergenz', 'die', 'convergence', 6],
  ['Synthese', 'die', 'synthesis', 6],
  ['Antithese', 'die', 'antithesis', 6],
  ['Dialektik', 'die', 'dialectic', 6],
  ['Hermeneutik', 'die', 'hermeneutics', 6],
  ['Epistemologie', 'die', 'epistemology', 6],
  ['Ontologie', 'die', 'ontology', 6],
  ['postulieren', '', 'to postulate', 6],
  ['präsupponieren', '', 'to presuppose', 6],
  ['deduzieren', '', 'to deduce', 6],
  ['induzieren', '', 'to induce', 6],
  ['sublimieren', '', 'to sublimate', 6],
  ['transzendieren', '', 'to transcend', 6],
  ['kontextualisieren', '', 'to contextualize', 6],
  ['operationalisieren', '', 'to operationalize', 6],
  ['problematisch', '', 'problematic', 6],
  ['ephemer', '', 'ephemeral', 6],
  ['ubiquitär', '', 'ubiquitous', 6],
  ['idiosynkratisch', '', 'idiosyncratic', 6],
  ['paradigmatisch', '', 'paradigmatic', 6],
  ['heuristisch', '', 'heuristic', 6],
  ['empirisch', '', 'empirical', 6],
  ['normativ', '', 'normative', 6],
  ['deskriptiv', '', 'descriptive', 6],
  ['präskriptiv', '', 'prescriptive', 6],
  ['latent', '', 'latent', 6],
  ['manifest', '', 'manifest', 6],
  ['intrinsisch', '', 'intrinsic', 6],
  ['extrinsisch', '', 'extrinsic', 6],
];

// ---------------------------------------------------------------------------
function cleanMeaning(m) {
  let s = String(m || '').trim();
  if (!s) return '';
  // primary sense only
  s = s.split(/[;|]/)[0].trim();
  // drop parenthetical junk after first sense if very long
  if (s.length > 48) {
    const cut = s.search(/[,/]/);
    if (cut > 12) s = s.slice(0, cut).trim();
  }
  if (s.length > 56) s = s.slice(0, 53).trim() + '…';
  return s;
}

function normalizeArticle(a) {
  const x = String(a || '').trim().toLowerCase();
  return ['der', 'die', 'das'].includes(x) ? x : '';
}

function keyOf(word) {
  return String(word || '').trim().toLowerCase();
}

/** Heuristic re-level for bulk/extra words not in curated core */
function heuristicLevel(word, meaning, oldLevel) {
  const w = String(word || '');
  const m = String(meaning || '').toLowerCase();
  const len = w.length;
  // academic / rare morphology → C1–C2
  if (/(heit|keit|ung|tion|ismus|ität|schaft|ologie|graphie)$/i.test(w) && len > 10) {
    return oldLevel >= 5 ? oldLevel : 5;
  }
  if (/(isieren|ifizieren|enzieren)$/i.test(w)) return 5;
  if (/^(ab|an|auf|aus|be|ein|ent|er|ge|miss|über|um|unter|ver|vor|zer|zu)/i.test(w)
      && len > 12 && (w.match(/-/g) || []).length >= 0) {
    // long separable compounds often intermediate+
    if (len > 16) return Math.max(oldLevel || 3, 4);
  }
  // very short common particles already in core
  if (len <= 3 && !/[äöüß]/i.test(w)) return Math.min(oldLevel || 2, 2);
  // default: keep old if sensible, else B1
  const lv = Number(oldLevel) || 3;
  if (lv < 1 || lv > 6) return 3;
  return lv;
}

function main() {
  const rawPath = path.join(__dirname, '_vocab_raw.json');
  let raw = [];
  if (fs.existsSync(rawPath)) {
    raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  }

  const byKey = new Map();

  // 1) curated core first
  for (const [word, article, meaning, level] of CORE) {
    const k = keyOf(word);
    if (!k || !meaning) continue;
    byKey.set(k, {
      word: String(word).trim(),
      article: normalizeArticle(article),
      meaning: cleanMeaning(meaning),
      level: Number(level) || 1,
      tier: 'core',
    });
  }

  // 2) merge raw as extra (do not overwrite core)
  for (const w of raw) {
    const k = keyOf(w.word);
    if (!k) continue;
    if (byKey.has(k)) continue;
    const meaning = cleanMeaning(w.meaning);
    if (!meaning) continue;
    // skip very noisy entries
    if (/^[0-9]/.test(k)) continue;
    const level = heuristicLevel(w.word, meaning, w.level);
    byKey.set(k, {
      word: String(w.word).trim(),
      article: normalizeArticle(w.article),
      meaning,
      level,
      tier: 'extra',
    });
  }

  const all = [...byKey.values()].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    if (a.tier !== b.tier) return a.tier === 'core' ? -1 : 1;
    return a.word.localeCompare(b.word, 'de');
  });

  const stats = { core: {}, extra: {}, total: all.length };
  for (const w of all) {
    const t = w.tier;
    stats[t][w.level] = (stats[t][w.level] || 0) + 1;
  }

  const out = `// German CEFR vocabulary — rebuilt for study quality
// level: 1=A1 … 6=C2
// tier: "core" = primary study / practice sets; "extra" = broader extract coverage
// Generated by rebuild-vocabulary.js — re-run after editing CORE lists.
const ALL_VOCABULARY = ${JSON.stringify(all, null, 0)};
`;

  fs.writeFileSync(path.join(__dirname, 'vocabulary.js'), out, 'utf8');
  console.log('Wrote vocabulary.js');
  console.log(JSON.stringify(stats, null, 2));
  console.log('core total', all.filter((w) => w.tier === 'core').length);
  console.log('extra total', all.filter((w) => w.tier === 'extra').length);
}

main();
