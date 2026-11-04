/* saisie-python.js — indentation automatique des zones de code simples.
   Écrit le 4 novembre 2026. Les pages Débuter, Atelier et Préparation à l'examen
   saisissent le code dans un simple champ de texte, sans CodeMirror. Ce script
   leur donne le comportement attendu d'un éditeur Python, comme sur la page
   d'exercices :
     · Entrée garde l'indentation de la ligne, et l'augmente de quatre espaces
       après une ligne qui finit par « : » ;
     · Tab insère quatre espaces, Maj+Tab en retire quatre en début de ligne ;
     · Retour arrière, dans l'indentation, retire quatre espaces d'un coup.
   Il s'applique aux champs de classe « code-py ». */
(() => {
  const IND = '    ';
  // insertText garde l'historique d'annulation (Ctrl+Z) ; setRangeText en secours
  const inserer = (ta, texte, debut, fin) => {
    ta.setSelectionRange(debut, fin);
    if (!document.execCommand || !document.execCommand('insertText', false, texte)) {
      ta.setRangeText(texte, debut, fin, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  document.addEventListener('keydown', ev => {
    const ta = ev.target;
    if (!(ta instanceof HTMLTextAreaElement) || !ta.classList.contains('code-py')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
    const v = ta.value, d = ta.selectionStart, f = ta.selectionEnd;
    const debutLigne = v.lastIndexOf('\n', d - 1) + 1;
    const avant = v.slice(debutLigne, d);
    if (ev.key === 'Enter') {
      let indent = (avant.match(/^[ \t]*/) || [''])[0];
      if (/:\s*(#.*)?$/.test(avant)) indent += IND;
      ev.preventDefault();
      inserer(ta, '\n' + indent, d, f);
    } else if (ev.key === 'Tab' && !ev.shiftKey) {
      ev.preventDefault();
      inserer(ta, IND, d, f);
    } else if (ev.key === 'Tab' && ev.shiftKey) {
      ev.preventDefault();
      const n = (v.slice(debutLigne).match(/^ {1,4}/) || [''])[0].length;
      if (n) { inserer(ta, '', debutLigne, debutLigne + n); ta.setSelectionRange(Math.max(debutLigne, d - n), Math.max(debutLigne, d - n)); }
    } else if (ev.key === 'Backspace' && d === f && d > debutLigne && /^ +$/.test(avant)) {
      ev.preventDefault();
      const n = avant.length % 4 || 4;
      inserer(ta, '', d - n, d);
    }
  });
})();
