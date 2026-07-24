/**
 * Built-in graded German reading collection (CEFR A1–C2).
 * Used for: pick-from-collection + daily seeded pick (when live fetch fails).
 * level: 1=A1, 2=A2, 3=B1, 4=B2, 5=C1, 6=C2
 */
var READING_COLLECTION = [
  // ---- A1 ----
  {
    id: 'a1-hello',
    level: 1,
    title: 'Hallo!',
    description: 'Meeting someone new',
    text: 'Hallo! Ich heiße Anna. Ich bin Studentin. Ich mag Hunde und Katzen. Heute ist das Wetter gut. Ich gehe zur Schule und lerne Deutsch. Die Lehrerin ist nett. Die Mitschüler sind auch nett. Ich trinke gerne Tee und lese Bücher. Tschüss!',
  },
  {
    id: 'a1-family',
    level: 1,
    title: 'Meine Familie',
    description: 'Family members',
    text: 'Meine Familie hat einen Vater, eine Mutter und mich. Papa ist Lehrer, Mama kauft gerne ein. Wir wohnen in Berlin. Ich esse gerne Brot und Äpfel. Papa trinkt Tee, Mama trinkt Wasser. Wir sind glücklich.',
  },
  {
    id: 'a1-day',
    level: 1,
    title: 'Mein Tag',
    description: 'A simple daily routine',
    text: 'Jeden Morgen trinke ich Wasser und esse Brot. Dann gehe ich zur Schule. Mittags esse ich. Am Nachmittag lese ich ein Buch. Abends sehe ich fern. Um neun Uhr schlafe ich. Ich lerne gerne Deutsch.',
  },
  {
    id: 'a1-shop',
    level: 1,
    title: 'Im Geschäft',
    description: 'Shopping basics',
    text: 'Ich möchte Obst kaufen. Wie viel kostet der Apfel? Drei Euro. Gut, ich nehme fünf. Danke! Bitte. Ich möchte auch Tee. Das ist Wasser, das ist Tee. Sehr gut!',
  },
  {
    id: 'a1-friends',
    level: 1,
    title: 'Freunde',
    description: 'Friends and hobbies',
    text: 'Ich habe einen Freund. Er heißt Tom. Er mag Katzen, ich mag Hunde. Wir gehen zusammen zur Schule. Wir lesen, sprechen und trinken Tee. Heute sind wir froh. Tschüss, Freund!',
  },

  // ---- A2 ----
  {
    id: 'a2-weekend',
    level: 2,
    title: 'Wochenendpläne',
    description: 'Weekend plans',
    text: 'Dieses Wochenende möchte ich ausgehen. Morgens stehe ich auf und laufe ein bisschen, dann frühstücke ich. Vormittags gehe ich in den Laden und kaufe Obst und Milch. Nachmittags lese ich ein Buch, abends esse ich mit Freunden. Obwohl ich ein bisschen müde bin, bin ich sehr glücklich.',
  },
  {
    id: 'a2-hospital',
    level: 2,
    title: 'Beim Arzt',
    description: 'At the doctor',
    text: 'Gestern ging es mir nicht gut, deshalb bin ich zum Arzt gegangen. Der Arzt hat gefragt: „Was fehlt Ihnen?“ Ich habe gesagt, dass der Kopf weh tut. Der Arzt hat gesagt, ich soll viel ruhen und viel Wasser trinken. Mama sagt, ich soll mir keine Sorgen machen — in zwei Tagen wird alles besser.',
  },
  {
    id: 'a2-weather',
    level: 2,
    title: 'Das Wetter',
    description: 'Talking about weather',
    text: 'Heute Morgen war es sehr kalt, ich habe viele Sachen angezogen. Mittags kam die Sonne und es wurde ein bisschen warm. Am Nachmittag hat es angefangen zu regnen, auf der Straße waren nicht viele Leute. Abends hat der Regen aufgehört und die Luft war gut. Wird es morgen noch kälter? Das weiß ich noch nicht.',
  },
  {
    id: 'a2-school',
    level: 2,
    title: 'In der Schule',
    description: 'School life',
    text: 'Jeden Tag komme ich um halb acht in die Schule. Die erste Stunde ist Deutsch. Die Lehrerin spricht langsam und ich verstehe viel. Mittags esse ich mit meinen Freunden und wir lachen viel. Am Nachmittag spielen wir Fußball. Nach der Schule fahre ich mit dem Bus nach Hause.',
  },
  {
    id: 'a2-guest',
    level: 2,
    title: 'Besuch',
    description: 'Hosting a guest',
    text: 'Heute kommt ein Freund zu mir nach Hause. Ich bitte ihn, sich zu setzen, und bringe Tee. Wir sehen zusammen fern und essen etwas Obst. Er sagt, meine Wohnung ist sauber. Abends muss er nach Hause. Ich bringe ihn zur Tür und sage: „Komm bald wieder!“',
  },

  // ---- B1 ----
  {
    id: 'b1-travel',
    level: 3,
    title: 'Erste Reise',
    description: 'A short trip',
    text: 'Letzten Sommer bin ich mit meinen Eltern nach Hamburg gefahren. Wir sind mit dem Zug gefahren und die Fahrt hat ungefähr fünf Stunden gedauert. Danach haben wir zuerst im Hotel ausgeruht. Am nächsten Tag sind wir in den Park und in Geschäfte gegangen. Obwohl es viele Leute gab, war die Stadt wirklich schön. Reisen ist nicht nur interessant, man lernt auch viel dabei.',
  },
  {
    id: 'b1-hobby',
    level: 3,
    title: 'Meine Hobbys',
    description: 'Hobbies and free time',
    text: 'Ich habe viele Hobbys. Früher habe ich nur ferngesehen, jetzt bewege ich mich lieber. Jede Woche gehe ich mindestens dreimal ins Fitnessstudio. Manchmal koche ich auch, weil selbst gemachtes Essen gesünder ist. Wenn es am Wochenende regnet, höre ich zu Hause Musik oder übe Deutsch.',
  },
  {
    id: 'b1-mistake',
    level: 3,
    title: 'Fehler machen',
    description: 'Learning from mistakes',
    text: 'Beim Deutschlernen mache ich oft Fehler. Einmal habe ich „kaufen“ und „verkaufen“ verwechselt, und meine Freunde haben gelacht. Die Lehrerin hat gesagt: „Hab keine Angst vor Fehlern — Fehler sind die besten Lehrer.“ Seitdem spreche und übe ich lieber. Jetzt habe ich schon viel Fortschritt gemacht.',
  },
  {
    id: 'b1-neighbor',
    level: 3,
    title: 'Neue Nachbarin',
    description: 'Meeting a new neighbor',
    text: 'Letzten Monat ist eine neue Nachbarin in unser Haus gezogen. Sie ist jung und arbeitet in einer Firma in der Nähe. Beim ersten Treffen hat sie uns Obst mitgebracht. Später sprechen wir oft im Aufzug. Sie sagt, sie mag die Stadt und hofft, dass wir uns öfter sehen.',
  },
  {
    id: 'b1-exam',
    level: 3,
    title: 'Prüfung vorbereiten',
    description: 'Preparing for a test',
    text: 'Nächste Woche habe ich eine wichtige Prüfung, deshalb lerne ich jeden Tag. Morgens lerne ich Vokabeln, nachmittags mache ich Übungen und abends schaue ich noch einmal die Notizen an. Obwohl ich manchmal müde bin, möchte ich eine gute Note schreiben. Ein Freund hilft mir auch bei den Hausaufgaben — dafür bin ich sehr dankbar.',
  },

  // ---- B2 ----
  {
    id: 'b2-environment',
    level: 4,
    title: 'Umwelt schützen',
    description: 'Protecting the environment',
    text: 'In letzter Zeit machen sich viele Menschen Sorgen um die Umwelt. Luftverschmutzung und zu viel Müll wirken sich auf unsere Gesundheit aus. Eigentlich kann jeder etwas Einfaches tun: weniger Plastiktüten benutzen, öfter mit dem Bus fahren und Wasser sparen. Wenn wir dranbleiben, wird die Stadt sauberer und das Leben angenehmer.',
  },
  {
    id: 'b2-online',
    level: 4,
    title: 'Leben online',
    description: 'Life online',
    text: 'Das Internet hat unseren Alltag verändert. Mit dem Handy können wir einkaufen, lernen und sogar mit Freunden in der Ferne chatten. Wenn man aber zu lange auf den Bildschirm starrt, leidet oft der Schlaf und die Augen. Am wichtigsten ist, die Zeit sinnvoll einzuteilen, damit das Netz ein Werkzeug für Fortschritt bleibt und nicht nur Zeit frisst.',
  },
  {
    id: 'b2-culture',
    level: 4,
    title: 'Deutsche Kultur',
    description: 'German culture',
    text: 'Eine Sprache zu lernen bedeutet nicht nur Vokabeln und Grammatik. Man sollte auch die Kultur verstehen. Zum Beispiel treffen sich viele Familien an Weihnachten, essen zusammen und wünschen sich alles Gute. Wer solche Gewohnheiten kennt, versteht Menschen leichter. Umgekehrt kann man die eigene Kultur teilen — so wird der Austausch interessanter.',
  },
  {
    id: 'b2-job',
    level: 4,
    title: 'Arbeit suchen',
    description: 'Looking for a job',
    text: 'Nach dem Studium habe ich angefangen, Arbeit zu suchen. Ich habe viele Bewerbungen geschickt und an einigen Vorstellungsgesprächen teilgenommen. Manche Firmen wollen Berufserfahrung, andere achten mehr auf Lernbereitschaft. Schließlich habe ich eine Stelle gefunden, die mir gefällt. Das Gehalt war am Anfang nicht hoch, aber ich lerne viel — und das lohnt sich.',
  },
  {
    id: 'b2-city',
    level: 4,
    title: 'Leben in der Großstadt',
    description: 'Life in a big city',
    text: 'In einer Großstadt gibt es viele Vorteile: gute Verkehrsanbindung, viele Geschäfte und Chancen. Die Miete ist allerdings teurer und der Weg zur Arbeit oft lang. Manche mögen das schnelle Tempo, andere finden es anstrengend und wollen in eine kleinere Stadt ziehen. Für mich ist das Leben voll, solange Freunde in der Nähe sind.',
  },

  // ---- C1 ----
  {
    id: 'c1-education',
    level: 5,
    title: 'Sinn der Bildung',
    description: 'The meaning of education',
    text: 'Viele glauben, Bildung diene vor allem Prüfungen und dem Berufseinstieg. Ich finde jedoch, dass Bildung vor allem Denken fördern sollte. Wer selbstständig denkt, gibt bei Schwierigkeiten nicht so leicht auf und versteht auch andere Standpunkte. Schulen sollten nicht nur Wissen vermitteln, sondern Schüler ermutigen, Fragen zu stellen und neue Wege auszuprobieren. So kommt die Gesellschaft voran.',
  },
  {
    id: 'c1-technology',
    level: 5,
    title: 'Technik und Alltag',
    description: 'Technology and daily life',
    text: 'Die Technik entwickelt sich rasant; künstliche Intelligenz und Smartphones gehören zum Alltag. Sie steigern die Effizienz, bringen aber auch Herausforderungen wie Datenschutz und Falschinformationen. Wir sollten neue Technik nutzen und gleichzeitig kritisch bleiben: stimmen die Quellen, ist die Information zuverlässig? Nur so dient Technik wirklich den Menschen.',
  },
  {
    id: 'c1-friendship',
    level: 5,
    title: 'Echte Freunde',
    description: 'True friendship',
    text: 'Echte Freunde melden sich nicht jeden Tag, erscheinen aber, wenn man Hilfe braucht. Sie sagen ehrlich, wenn etwas nicht stimmt, und freuen sich ehrlich über Erfolge. Mit den Jahren werden Freunde vielleicht weniger, die Beziehung aber tiefer. Solche Menschen zu schätzen ist wichtiger als viele oberflächliche Kontakte.',
  },
  {
    id: 'c1-pressure',
    level: 5,
    title: 'Mit Druck umgehen',
    description: 'Dealing with pressure',
    text: 'Viele Menschen fühlen sich heute unter Druck: viel Arbeit, schnelles Leben, unsichere Zukunft. Etwas Druck kann antreiben, Dauerstress schadet jedoch der Gesundheit. Pause machen, sich bewegen und mit anderen sprechen helfen. Manchmal kommt man weiter, wenn man das Tempo drosselt.',
  },
  {
    id: 'c1-tradition',
    level: 5,
    title: 'Tradition und Moderne',
    description: 'Tradition and modernity',
    text: 'In einer Zeit des schnellen Wandels prallen Tradition und Moderne oft aufeinander. Manche wollen alles Neue, andere möglichst viel Altes behalten. Eigentlich widersprechen sich beide nicht. Man kann Tradition modern vermitteln und in alten Ideen Antworten auf heutige Fragen finden. Verstehen und Respekt zählen mehr als harte Gegensätze.',
  },

  // ---- C2 ----
  {
    id: 'c2-globalization',
    level: 6,
    title: 'Zeitalter der Globalisierung',
    description: 'The age of globalization',
    text: 'Die Globalisierung verbindet Wirtschaft und Kultur enger. Reisen, Studium und Zusammenarbeit über Grenzen hinweg werden leichter, zugleich können kulturelle Spannungen und ungleiche Ressourcenverteilung entstehen. Wie man offen bleibt und gleichzeitig lokale Besonderheiten schützt, ist für viele Gesellschaften eine ernste Frage. Nur mit gegenseitigem Respekt und gleichberechtigtem Dialog gelingt gemeinsame Entwicklung.',
  },
  {
    id: 'c2-media',
    level: 6,
    title: 'Medienkompetenz',
    description: 'Media literacy',
    text: 'In einer Zeit der Informationsflut ist Medienkompetenz besonders wichtig. Gegenüber Nachrichten und Kommentaren muss man Wahr und Falsch unterscheiden und sich nicht von reißerischen Überschriften leiten lassen. Mehrere Perspektiven lesen, Quellen prüfen und unabhängig urteilen gehören zu den Grundfähigkeiten moderner Bürger. Sonst verbreiten sich Gerüchte schneller als die Wahrheit.',
  },
  {
    id: 'c2-career',
    level: 6,
    title: 'Berufswahl',
    description: 'Choosing a career',
    text: 'Bei der Berufswahl schwanken viele zwischen Interesse, Einkommen und Sicherheit. Manche streben nach hohem Gehalt, andere nach persönlichem Sinn und gesellschaftlichem Nutzen. Es gibt keine einzige richtige Antwort. Wichtig ist, die eigenen Stärken zu kennen und langfristige Ziele zu verfolgen. Karrierewege sind selten gerade; die Richtung rechtzeitig anzupassen ist ebenfalls klug.',
  },
  {
    id: 'c2-ethics',
    level: 6,
    title: 'Technikethik',
    description: 'Ethics of technology',
    text: 'Mit dem raschen Fortschritt von künstlicher Intelligenz und Biotechnologie rücken ethische Fragen in den Vordergrund. Technik ist an sich neutral, ihre Nutzung prägt jedoch Fairness und individuelle Rechte. Klare Regeln, öffentliche Debatte und Verantwortung von Unternehmen sind unverzichtbar. Nur wenn Ethik vor Innovation bedacht wird, ist Entwicklung nachhaltig möglich.',
  },
  {
    id: 'c2-language',
    level: 6,
    title: 'Sprache und Denken',
    description: 'Language and thought',
    text: 'Sprache ist nicht nur ein Werkzeug der Verständigung; sie prägt in gewissem Maße auch unser Denken. Eine neue Sprache zu lernen heißt oft, die Welt aus einem anderen Blickwinkel zu sehen. Mehrsprachigkeit verbessert nicht nur die Kommunikation, sondern auch das interkulturelle Verständnis. In einer globalisierten Welt ist diese Fähigkeit besonders wertvoll und lohnt langfristige Investition.',
  },
];

/** @returns {typeof READING_COLLECTION} */
function getReadingsForLevel(level) {
  const n = Number(level);
  return READING_COLLECTION.filter((r) => Number(r.level) === n);
}

function getReadingById(id) {
  return READING_COLLECTION.find((r) => r.id === id) || null;
}

/**
 * Deterministic daily pick from the built-in collection for a level.
 * Same calendar day + level → same reading (local time).
 */
function getSeededDailyReading(level, date = new Date()) {
  const list = getReadingsForLevel(level);
  if (!list.length) return null;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const seed = y * 10000 + m * 100 + d + Number(level) * 17;
  const idx = seed % list.length;
  const item = list[idx];
  const LEVEL = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' };
  const label = LEVEL[Number(level)] || String(level);
  return {
    ...item,
    id: `daily-${item.id}-${y}-${m}-${d}`,
    title: `Heutige Lektüre · ${item.title}`,
    description: `${label} · ${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} · ${item.description || ''}`,
    source: 'collection-daily',
  };
}
