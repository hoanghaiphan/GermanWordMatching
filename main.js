// Focused on reading-based games (Picture Match). Flashcards removed per request.

function init() {
  const vocabulary = typeof ALL_VOCABULARY !== 'undefined' ? ALL_VOCABULARY : [];
  if (!vocabulary.length) {
    alert('Vocabulary data not loaded.');
    return;
  }

  initPictureGame(vocabulary);
}

init();
