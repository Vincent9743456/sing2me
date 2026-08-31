/** Traductions anglaises — domaine morceaux (clé = chaîne française exacte). */
export const EN_MORCEAUX: Record<string, string> = {
  // ---------- Communes au domaine (fiche morceau, sélecteur, imports) ----------
  Titre: 'Title',
  Artiste: 'Artist',
  Modifier: 'Edit',
  Supprimer: 'Delete',
  Créer: 'Create',
  Fermer: 'Close',
  Ouvrir: 'Open',
  Capo: 'Capo',
  Solo: 'Solo',
  Groupe: 'Band',
  'Groupe sans nom': 'Unnamed band',
  'sans nom': 'unnamed',
  '(sans nom)': '(unnamed)',
  '(sans titre)': '(untitled)',
  'Sans titre': 'Untitled',
  'Sans artiste': 'No artist',
  Moi: 'Me',
  'ce groupe': 'this band',
  groupe: 'band',
  'ce morceau': 'this song',
  'Ajouter à…': 'Add to…',
  '＋ Ajouter à…': '＋ Add to…',
  'Ajouter ce morceau à un groupe ou une setlist': 'Add this song to a band or a setlist',
  'Ajouter à une setlist': 'Add to a setlist',
  Setlist: 'Setlist',
  'Le morceau sera aussi retiré des setlists. Cette action est irréversible.':
    'The song will also be removed from setlists. This action is irreversible.',
  'Tu crées :': 'You are creating:',
  Scène: 'Stage',
  'Mode scène': 'Stage mode',
  'aucun groupe ni setlist': 'no band or setlist',
  'Dans :': 'In:',

  // ---------- Library.tsx ----------
  '« {title} » dans…': '“{title}” in…',
  'Pas encore de setlist — crée la première juste en dessous.':
    'No setlist yet — create the first one just below.',
  '{n} morceaux': '{n} songs',
  '{n} morceau': '{n} song',
  'Cliquer pour retirer': 'Click to remove',
  '✓ Dedans': '✓ In there',
  'Nouvelle setlist (nom)…': 'New setlist (name)…',
  '📥 Proposé par': '📥 Proposed by',
  // b420 — la provenance d'une proposition : la personne, sinon le répertoire
  '📥 Du répertoire de {groupe}': '📥 From the {groupe} repertoire',
  // b426 — au plafond, une proposition se voit mais ne s'ouvre pas
  'Cette proposition attend dans ta boîte, mais ta bibliothèque gratuite est pleine : son contenu s’ouvrira quand tu pourras l’accepter.':
    'This suggestion is waiting in your inbox, but your free library is full: its content will open once you can accept it.',
  // b422 — dépassement du plan gratuit : bandeau + bilan du tri
  'Bibliothèque ramenée au plan gratuit': 'Library brought back to the free plan',
  'Gardés : {g} · rendus aux propositions de leur groupe : {p} · supprimés : {s}.':
    'Kept: {g} · returned to their band’s suggestions: {p} · deleted: {s}.',
  'Ta bibliothèque dépasse le plan gratuit ({n}/{max})':
    'Your library exceeds the free plan ({n}/{max})',
  'Jusqu’au {date} : repasse en illimité, ou choisis toi-même ce que tu gardes. Ensuite l’app gardera les {max} morceaux les plus utilisés (setlists et concerts d’abord) — les morceaux venus d’un groupe retourneront en proposition, les autres seront supprimés. Tu peux exporter toute ta bibliothèque depuis les Réglages.':
    'Until {date}: go unlimited again, or choose what you keep yourself. After that the app will keep your {max} most-used songs (setlists and concerts first) — songs that came from a band will return to its suggestions, the others will be deleted. You can export your whole library from Settings at any time.',
  'Masquer jusqu’au prochain lancement': 'Hide until the next launch',
  'ton groupe': 'your band',
  Exemple: 'Example',
  'Groupe : {name} — cliquer pour filtrer': 'Band: {name} — click to filter',
  'Cœurs reçus en concert': 'Hearts received live',
  'Messages du public': 'Messages from the audience',
  'Accepter « {title} » dans ta bibliothèque': 'Accept “{title}” into your library',
  '✓ Accepter': '✓ Accept',
  Actions: 'Actions',
  'Actions pour « {title} »': 'Actions for “{title}”',
  '☁ Sauvegarde ta bibliothèque et retrouve-la sur tous tes appareils — compte gratuit.':
    '☁ Back up your library and find it on all your devices — free account.',
  'Créer / me connecter': 'Create / sign in',
  'Ne plus afficher': "Don't show again",
  'Rechercher un morceau, un artiste, un tag…': 'Search a song, an artist, a tag…',
  'Effacer la recherche': 'Clear search',
  'Trier et filtrer la bibliothèque': 'Sort and filter the library',
  Filtrer: 'Filter',
  Tri: 'Sort',
  Récents: 'Recent',
  'Tous les morceaux': 'All songs',
  "Morceaux proposés par un groupe — à accepter avant qu'ils rejoignent ta bibliothèque":
    'Songs proposed by a band — accept them before they join your library',
  '📥 À valider': '📥 To approve',
  'Partitions ajoutées dans la semaine': 'Charts added this week',
  '✨ Nouveautés ({n})': '✨ New ({n})',
  'Ce qu’un groupe te propose, et ce que tu as gardé à un bœuf':
    'Imported songs not yet confirmed — work-in-progress stash',
  // b428 — fiche morceau : retours du public fusionnés, gestion en modales
  'Vue affichée': 'Displayed view',
  'Retours du public — voir les messages': 'Audience feedback — see the messages',
  'Retours du public': 'Audience feedback',
  '{n} cœurs reçus en concert': '{n} hearts received live',
  '{n} cœur reçu en concert': '{n} heart received live',
  'Aucun message du public pour ce morceau.': 'No audience message for this song.',
  'contexte {band}': '{band} context',
  'Réglages perso': 'My setup',
  'renseignés': 'filled in',
  'à compléter': 'to fill in',
  // b427 — polish de la liste : label de tags, badge « À vérifier »
  'Tags :': 'Tags:',
  'Voir pourquoi ce morceau est à relire': 'See why this song needs a check',
  'Groupes :': 'Bands:',
  'Répertoire jouable en solo (tous les morceaux par défaut, sauf déqualifiés depuis leur fiche)':
    'Repertoire playable solo (every song by default, unless disqualified from its page)',
  'Ce qu’on te propose : le répertoire d’un groupe, ou un morceau gardé à un bœuf. Jouables partout — accepte ✓ ceux que tu veux garder.':
    'What others suggest: a band’s repertoire, or a song you kept at a jam. Playable anywhere — accept ✓ the ones you want to keep.',
  'Partitions ajoutées cette semaine — {n} morceaux.': 'Charts added this week — {n} songs.',
  'Partitions ajoutées cette semaine — {n} morceau.': 'Charts added this week — {n} song.',
  'Filtre actif :': 'Active filter:',
  'Tout afficher': 'Show all',
  'Ce répertoire est vide pour l’instant.': 'This repertoire is empty for now.',
  'Aucun morceau sous ce filtre — « Tout afficher » ramène ta bibliothèque.':
    'No songs under this filter — “Show all” brings your library back.',
  '📥 Propositions': '📥 Proposals',
  '🔎 À vérifier': '🔎 To check',
  Retirer: 'Remove',
  'Importe tes partitions': 'Import your charts',
  "Colle un texte, un lien d'une page de partition, un PDF ou un fichier Word — mojosong met tout au propre.":
    'Paste text, a link to a chart page, a PDF or a Word file — mojosong tidies it all up.',
  'Tu as déjà une collection ? Dépose tous tes fichiers ou tes pages enregistrées en une fois — mojosong met tout au propre.':
    'Already have a collection? Drop all your files or saved pages at once — mojosong tidies it all up.',
  'Importer ma collection': 'Import my collection',
  'On installe ton répertoire…': 'Setting up your repertoire…',
  'On met tes partitions au propre…': 'Tidying up your charts…',
  'Ajouter un seul morceau': 'Add a single song',
  'Importer mon premier morceau': 'Import my first song',
  'Aucun morceau ne correspond à ta recherche.': 'No song matches your search.',
  'Ajouter des morceaux au répertoire du groupe': "Add songs to the band's repertoire",
  'Ajouter des morceaux': 'Add songs',
  // b472 (point 1) — menu du ＋ en contexte groupe + bannière de création
  'Ajouter des morceaux existants': 'Add existing songs',
  'Créer un nouveau morceau (ajouté au répertoire)':
    'Create a new song (added to the repertoire)',
  'Ce morceau sera ajouté au répertoire de {band} dès son enregistrement.':
    'This song will be added to the {band} repertoire as soon as it is saved.',
  'Ne pas l’ajouter au groupe': 'Don’t add it to the band',
  "Ajouter un morceau (importer un texte, un lien, un PDF… ou écrire à la main)":
    'Add a song (import text, a link, a PDF… or write it by hand)',
  'Nouveau morceau': 'New song',
  'Ajouter au répertoire — {band}': 'Add to repertoire — {band}',
  'Ajouter {n} morceaux au répertoire': 'Add {n} songs to the repertoire',
  'Ajouter {n} morceau au répertoire': 'Add {n} song to the repertoire',
  'Ajouter {n} morceaux': 'Add {n} songs',
  'Ajouter {n} morceau': 'Add {n} song',
  'Ce morceau': 'This song',
  'Jouer (mode scène)': 'Play (stage mode)',
  'Supprimer « {title} » ?': 'Delete “{title}”?',
  "Fermer l'aperçu": 'Close preview',
  'Modifier la partition': 'Edit the chart',
  'Supprimer ce morceau': 'Delete this song',
  'Supprimer « {title} » ? Le morceau sera aussi retiré des setlists.':
    'Delete “{title}”? The song will also be removed from setlists.',
  'Changer de version (solo, groupe…)': 'Switch version (solo, band…)',
  Transposer: 'Transpose',
  'Accords plus bas (capo +1) — la tonalité réelle ne change pas':
    'Chords lower (capo +1) — the real key stays the same',
  '{n} ½t': '{n} st',
  'Accords plus haut (capo −1)': 'Chords higher (capo −1)',
  'Le capo change ce qui sonne, pas les accords affichés':
    'The capo changes what you hear, not the chords shown',

  // ---------- SongView.tsx ----------
  "aujourd'hui": 'today',
  hier: 'yesterday',
  'il y a {n} j': '{n}d ago',
  Morceau: 'Song',
  "Ce morceau n'existe plus.": "This song doesn't exist anymore.",
  '{title} · {setlist}': '{title} · {setlist}',
  'Modifier la partition (paroles, accords, structure…)':
    'Edit the chart (lyrics, chords, structure…)',
  'Mode scène — la setlist entière (le public peut la suivre)':
    'Stage mode — the whole setlist (the audience can follow along)',
  'Mode scène (plein écran)': 'Stage mode (full screen)',
  'Proposition à valider': 'Idea to work on',
  'Jouable partout, mais pas encore entrée dans ta bibliothèque.':
    'Playable anywhere, but not yet confirmed in your library.',
  // b420 — la provenance d'une proposition, quand on la connaît
  'Proposée par {qui} — jouable partout, mais pas encore entrée dans ta bibliothèque.':
    'Suggested by {qui} — playable anywhere, but not yet confirmed in your library.',
  '✓ Valider dans la bibliothèque': '✓ Confirm in the library',
  'Déqualifié du répertoire solo — cliquer pour le requalifier':
    'Disqualified from the solo repertoire — click to requalify it',
  'Jouable en solo (par défaut) — cliquer pour le déqualifier si tu ne peux pas le jouer seul':
    "Playable solo (by default) — click to disqualify it if you can't play it alone",
  'Pas en solo': 'Not solo',
  'Solo ✓': 'Solo ✓',
  'Version « {name} »': 'Version “{name}”',
  partagée: 'shared',
  '⭐ référence': '⭐ reference',
  perso: 'personal',
  'Changer de version affichée': 'Switch displayed version',
  'Actions sur les versions': 'Version actions',
  'Versions : référence, renommer, supprimer':
    'Versions: reference, rename, delete',
  'Tonalité et capo sont ici — tout se transpose.': 'Key and capo are here — everything transposes.',
  '🎵 Tonalité': '🎵 Key',
  '🎵 Tonalité de ce concert': '🎵 Key for this gig',
  'Tonalité d’origine': 'Back to the version’s key',
  'Rejouer ce morceau dans la tonalité de la version':
    'Play this song in the version’s own key again',
  transposer: 'transpose',
  "Afficher les accords tels qu'ils doivent être joués sans capo — pratique pour la basse":
    "Show the chords as they should be played without a capo — handy for bass",
  '✓ Accords sans capo': '✓ Chords without capo',
  'Accords sans capo': 'Chords without capo',
  'Notes de répétition': 'Rehearsal notes',
  ' · contexte {band}': ' · {band} context',
  ' · solo / tous': ' · solo / everyone',
  '＋ Note': '＋ Note',
  'Le journal du travail sur ce morceau : datées, signées, partagées au groupe ou personnelles. Dictée vocale 🎤.':
    'The dated, signed log of work on this song — shared with the band or personal. Voice dictation 🎤.',
  'Modifier la note': 'Edit the note',
  'Supprimer la note (pour tout le monde)': 'Delete the note (for everyone)',
  '💬 Messages du public ({n})': '💬 Messages from the audience ({n})',
  anonyme: 'anonymous',
  'Retirer ce message': 'Remove this message',
  'Mes réglages perso': 'My personal setup',
  'Instrument joué sur ce morceau': 'Instrument played on this song',
  'Congas, cajon, guitare électro…': 'Congas, cajón, electro guitar…',
  'Réglages (ampli, effets, retours…)': 'Settings (amp, effects, monitors…)',
  'Drive canal 2, delay 320 ms\nRetour : voix + claviers':
    'Drive channel 2, 320 ms delay\nMonitor: vocals + keys',
  'Personnel : visible uniquement dans ton application (et affiché en mode scène) — jamais inclus dans les partages.':
    'Personal: visible only in your app (and shown in stage mode) — never included in shares.',
  Précédent: 'Previous',
  'Revenir à la setlist': 'Back to the setlist',
  Suivant: 'Next',
  'Renommer la version': 'Rename the version',
  'Retirer cette version (et le morceau du groupe)': 'Remove this version (and the song from the band)',
  'Supprimer la version « {name} »': 'Delete the “{name}” version',
  '⭐ En faire la version de référence': '⭐ Make it the reference version',
  '« {name} » devient la référence ?': '“{name}” becomes the reference?',
  "Son contenu remplace l'originale (l'ancien contenu est effacé), et cette version disparaît — elle EST devenue l'originale. Les autres versions ne bougent pas.":
    "Its content replaces the original (the old content is erased), and this version disappears — it HAS become the original. The other versions don't move.",
  "Son contenu remplace celui de l'originale (l'ancien contenu est effacé). Cette version reste attachée à son contexte.":
    "Its content replaces the original's (the old content is erased). This version stays attached to its context.",
  'En faire la référence': 'Make it the reference',
  'C’est maintenant la version de référence ⭐': 'It’s now the reference version ⭐',
  'Nom de la version': 'Version name',
  Renommer: 'Rename',
  'Supprimer la version « {name} » ?': 'Delete the “{name}” version?',
  'Le morceau sortira aussi du répertoire du groupe pour tous les membres (chacun garde sa partition personnelle).':
    'The song will also leave the repertoire for every member of the band (everyone keeps their personal copy).',
  'La version suivante devient la référence du morceau.': 'The next version becomes the reference for the song.',
  'Les autres versions du morceau sont conservées.': "The song's other versions are kept.",
  'Supprimer la version': 'Delete the version',

  // ---------- SongEdit.tsx ----------
  'Donne un titre à ton morceau.': 'Give your song a title.',
  'Supprimer « {title} » ? Le morceau sera retiré des setlists.':
    'Delete “{title}”? The song will be removed from setlists.',
  '🎵 Le morceau — commun à toutes les versions': '🎵 The song — common to every version',
  'Ces champs modifient le morceau ': 'These fields change the song ',
  partout: 'everywhere',
  ' : toutes les versions et toutes les setlists.': ': every version and every setlist.',
  'Durée (m:ss)': 'Duration (m:ss)',
  'Tags (séparés par des virgules)': 'Tags (comma-separated)',
  'rock, slow, ouverture…': 'rock, ballad, opener…',
  '🎼 La partition —': '🎼 The chart —',
  'propre à la version choisie': 'specific to the chosen version',
  'version unique': 'single version',
  'Tu modifies :': "You're editing:",
  'la version de référence': 'the reference version',
  'version du groupe {band}': 'the {band} version',
  'version « {name} »': 'version “{name}”',
  'Version modifiée': 'Edited version',
  principale: 'main',
  'Nom de cette version': 'This version’s name',
  personnelle: 'personal',
  'Cette version est pour': 'This version is for',
  'Moi seul (version personnelle)': 'Just me (personal version)',
  Tonalité: 'Key',
  'Tempo (BPM)': 'Tempo (BPM)',
  '⚑ Version principale : un changement de tonalité ou de capo est répercuté sur les versions qui la suivaient (celles sans réglage propre), et partagé avec le groupe à la synchronisation.':
    '⚑ Main version: a change of key or capo carries over to the versions that were following it (those without their own setting), and is shared with the band on sync.',
  "Cette version garde ses propres tonalité et capo — la version principale n'est pas affectée.":
    "This version keeps its own key and capo — the main version isn't affected.",
  "À l'enregistrement, mojosong te demandera si tes changements de partition valent pour":
    'On save, mojosong will ask whether your chart changes apply to',
  'cette version': 'this version',
  'seulement ou pour': 'only, or to',
  'toutes les versions': 'every version',
  Structure: 'Structure',
  "L'arrangement stable du morceau, en écriture libre : enchaînements, départs, arrêts, consignes… (« intro batterie seule », « refrain x2 à la fin »). Pour le journal daté des répétitions (qui a dit quoi, partagé ou privé), utilise les Notes de répétition sur la fiche du morceau.":
    'The song’s stable arrangement, in free-form notes: transitions, cues, stops, instructions… (“drums-only intro”, “chorus x2 at the end”). For the dated rehearsal log (who said what, shared or private), use the Rehearsal notes on the song page.',
  'Intro batterie seule\nDernier refrain x2, a cappella sur 2 mesures\n…':
    'Drums-only intro\nLast chorus x2, a cappella for 2 bars\n…',
  'Paroles + accords': 'Lyrics + chords',
  'Un seul bloc continu. Accords entre crochets : [Am]Sous le ciel de [F]Port-Louis':
    'One continuous block. Chords in brackets: [Am]Under the sky of [F]Port-Louis',
  '[Am]Première ligne…\n\nSuite des paroles…': '[Am]First line…\n\nRest of the lyrics…',
  "💬 Les notes de répétition (partagées ou personnelles, dictée vocale…) s'ajoutent depuis la page du morceau.":
    '💬 Rehearsal notes (shared or personal, voice dictation…) are added from the song page.',
  Enregistrer: 'Save',
  'Voir la partition': 'View the chart',
  'Supprimer le morceau': 'Delete the song',
  'Appliquer tes modifications à…': 'Apply your changes to…',
  'Cette version seulement': 'This version only',
  'Toutes les versions ({n})': 'Every version ({n})',

  // ---------- Import.tsx ----------
  'Cette page enregistrée ne contient pas de partition lisible — pour une LISTE de partitions, passe par « 3 · Import en masse ».':
    'This saved page doesn’t contain a readable chart — for a LIST of charts, use “3 · Bulk import”.',
  "Ce fichier n'a pas pu être lu. Essaie un fichier texte (.txt, .cho, .pro, .onsong) ou Word (.docx), ou colle le texte.":
    "This file couldn't be read. Try a text file (.txt, .cho, .pro, .onsong) or Word (.docx), or paste the text.",
  "L'import a échoué.": 'The import failed.',
  'Aucune version trouvée pour cette recherche.': 'No version found for this search.',
  'La recherche a échoué.': 'The search failed.',
  'Le nettoyage IA a échoué.': 'The AI cleanup failed.',
  'Ajouté comme nouvelle version de « {title} »': 'Added as a new version of “{title}”',
  ' — proposition validée ✓': ' — proposal accepted ✓',
  '{name} (ni partition ni lien de page de partition)': '{name} (neither a chart nor a chart-page link)',
  'Non retenus : {list}': 'Not kept: {list}',
  // Chantier « Reprise de répertoire » : découpage d'un recueil et filet.
  '{n} morceaux ajoutés à ta bibliothèque.': '{n} songs added to your library.',
  '{n} morceau ajouté à ta bibliothèque.': '{n} song added to your library.',
  '{n} à vérifier.': '{n} to check.',
  '{n} à vérifier': '{n} to check',
  'Ce fichier contient sans doute {n} partitions.':
    'This file probably holds {n} charts.',
  'Créer {n} morceaux': 'Create {n} songs',
  'Le fichier restera un seul morceau, marqué à vérifier':
    'The file stays one song, flagged to check',
  'N’en faire qu’un seul': 'Keep it as one',
  'Tes morceaux restent à toi : tu peux tout réexporter à tout moment (carnet PDF ou fichiers texte), et rien n’est jamais supprimé sans toi.':
    'Your songs stay yours: you can export everything at any time (PDF songbook or text files), and nothing is ever deleted without you.',
  '✓ Partition vérifiée': '✓ Chart checked',
  'À vérifier': 'To check',
  'Morceaux dont l’import a douté — un coup d’œil suffit souvent':
    'Songs the import wasn’t sure about — a quick look is usually enough',
  '🔎 À vérifier ({n})': '🔎 To check ({n})',
  Annulé: 'Cancelled',
  'Le service limite le débit — relance l’import dans quelques minutes, les morceaux déjà importés seront ignorés':
    'The service is rate-limiting — retry the import in a few minutes, songs already imported will be skipped',
  '⏳ Le service demande une pause — nouvel essai dans {wait} s':
    '⏳ The service is asking for a pause — retrying in {wait}s',
  'fichier vide ou illisible': 'empty or unreadable file',
  'supprimé de mojosong — non réimporté (passe par « Document ou lien » pour le récupérer)':
    'deleted from mojosong — not re-imported (use “Document or link” to get it back)',
  '⚠ police PDF brouillée — décodage IA proposé': '⚠ garbled PDF font — AI decoding suggested',
  '🔧 mis à jour (accords récupérés)': '🔧 updated (chords recovered)',
  'déjà présent (« {title} »)': 'already there (“{title}”)',
  '➕ ajouté comme nouvelle version': '➕ added as a new version',
  '⚠ format à revoir — IA conseillée': '⚠ format needs a look — AI recommended',
  '✨ nettoyé à l’IA': '✨ cleaned up by AI',
  'le nettoyage IA a échoué': 'the AI cleanup failed',
  '✨ nettoyage IA…': '✨ AI cleanup…',
  'Récupération de la partition…': 'Fetching the chart…',
  'Titre : ': 'Title: ',
  'Artiste : ': 'Artist: ',
  '✓ Accords et paroles récupérés': '✓ Chords and lyrics recovered',
  '✓ Paroles récupérées': '✓ Lyrics recovered',
  'tonalité {key}': 'key {key}',
  '✓ Analyse : rien à corriger.': '✓ Analysis: nothing to fix.',
  // b371 — l'écran d'import simplifié
  'Choisis un résultat : la partition se met en forme toute seule.':
    'Pick a result: the chart formats itself.',
  'Choisir des fichiers (txt, pdf, docx, html…)':
    'Choose files (txt, pdf, docx, html…)',
  '• Tes fichiers (txt, ChordPro, OnSong, Word, PDF) : un recueil est découpé en autant de morceaux.':
    '• Your files (txt, ChordPro, OnSong, Word, PDF): a songbook is split into as many songs.',
  '• Depuis un site de partitions (sur ordinateur) : affiche toutes tes partitions sur la page, enregistre-la (Ctrl+S) et dépose le fichier .html.':
    '• From a chords website (on a computer): show all your charts on the page, save it (Ctrl+S) and drop the .html file.',
  '• Plusieurs fichiers ? Dépose-les tous d’un coup — les morceaux s’additionnent, sans doublon.':
    '• Several files? Drop them all at once — songs add up, no duplicates.',
  '{n} fichier prêt :': '{n} file ready:',
  '{n} fichiers prêts :': '{n} files ready:',
  'ℹ Tu as déjà « {title} »': 'ℹ You already have “{title}”',
  ' (en proposition)': ' (a proposal)',
  ' : cet import le rejoindra comme nouvelle version — aucun doublon.':
    ' : this import will join it as a new version — no duplicate.',
  'Aperçu de la partition': 'Chart preview',
  '✨ Nettoyage en cours…': '✨ Cleaning up…',
  "✨ L'analyse suggère un nettoyage IA — corriger le format":
    '✨ The analysis suggests an AI cleanup — fix the format',
  "L'IA réécrit la partition au format standard (accords [Am] dans les paroles, sections nommées) pour régler les points ⚠ ci-dessus. Version en ligne + clé IA requises.":
    'The AI rewrites the chart in the standard format (chords [Am] in the lyrics, named sections) to fix the ⚠ points above. Online version + AI key required.',
  'Ajouter à ma bibliothèque': 'Add to my library',
  'Ajouter un morceau': 'Add a song',
  'Rechercher un morceau': 'Search a song',
  'Titre et artiste — ex. Angie Rolling Stones': 'Title and artist — e.g. Angie Rolling Stones',
  'Recherche en cours…': 'Searching…',
  'Tape le titre (et l’artiste) : les résultats arrivent tout seuls.':
    'Type the title (and the artist): results show up on their own.',
  '{n} votes': '{n} votes',
  "Autres façons d'importer": 'Other ways to import',
  'Document ou lien': 'Document or link',
  'Import en masse': 'Bulk import',
  'Écrire à la main': 'Write it by hand',
  'Coller un lien vers la partition': 'Paste a link to the chart',
  Récupérer: 'Fetch',
  "Un lien reconnu est importé automatiquement. Sinon, ouvre la page, copie son texte et colle-le ci-dessous : l'analyse (et l'IA si besoin) reconstruit la partition.":
    "A recognized link is imported automatically. Otherwise, open the page, copy its text and paste it below: the analysis (and AI if needed) rebuilds the chart.",
  'Choisir un fichier (txt, cho, pro, onsong, docx, pdf…)': 'Choose a file (txt, cho, pro, onsong, docx, pdf…)',
  'Fichier : ': 'File: ',
  'Ou coller le texte de la partition': 'Or paste the chart text',
  'Formats reconnus automatiquement :\n\n• Accords au-dessus des paroles :\n    Am        F\n    Sous le ciel qui s\'endort\n\n• ChordPro / OnSong :\n    {title: Mon morceau}  ou  Title: Mon morceau\n    [Am]Sous le ciel [F]qui s\'endort\n\n• Sections : [Couplet 1], Refrain:, [Verse], [Chorus]…':
    'Automatically recognized formats:\n\n• Chords above the lyrics:\n    Am        F\n    Under the sky that falls asleep\n\n• ChordPro / OnSong:\n    {title: My song}  or  Title: My song\n    [Am]Under the sky [F]that falls asleep\n\n• Sections: [Verse 1], Chorus:, [Verse], [Chorus]…',
  'Déposer des fichiers — page de partition enregistrée (.html) ou fichiers':
    'Drop files — a saved chart page (.html) or files',
  'Le plus simple pour reprendre ta collection :': 'The easiest way to bring over your collection:',
  'ouvre la page qui liste tes partitions (ta page « mes partitions » ou tes favoris) et':
    'open the page that lists your charts (your “my charts” page or your favorites) and',
  "fais d'abord afficher toutes tes partitions sur la page": 'first make all your charts show on the page',
  "(réglage du nombre par page, ou fais défiler / passe les pages en bas de liste jusqu'à tout voir). Ensuite enregistre la page (Ctrl+S) et dépose le fichier .html ici. S'il reste plusieurs pages, enregistre chacune : tu peux déposer tous les fichiers .html en une fois, les liens s'additionnent sans doublons.":
    '(page-size setting, or scroll / page through to the bottom until you see everything). Then save the page (Ctrl+S) and drop the .html file here. If several pages remain, save each one: you can drop all the .html files at once, links are combined without duplicates.',
  'Pages de partition personnelles': 'Personal chart pages',
  ': ouvre chaque page de partition et enregistre-la (Ctrl+S) — dépose ces .html ici, la partition est extraite directement du fichier, sans passer par le serveur. Tu peux aussi déposer des fichiers exportés d’une autre application (txt, ChordPro, OnSong, Word, PDF) — un recueil qui contient toutes tes chansons est découpé automatiquement en autant de morceaux.':
    ': open each chart page and save it (Ctrl+S) — drop these .html files here, the chart is extracted directly from the file, without going through the server. You can also drop files exported from another app (txt, ChordPro, OnSong, Word, PDF) — a songbook holding all your songs is automatically split into that many songs.',
  '📄 {n} fichiers de partition prêts :': '📄 {n} chart files ready:',
  '📄 {n} fichier de partition prêt :': '📄 {n} chart file ready:',
  retirer: 'remove',
  'Ou colle des liens de pages de partition (un par ligne)':
    'Or paste chart-page links (one per line)',
  'Tu peux coller en vrac (texte, page copiée…) : seules les pages de partition sont retenues, sans doublons. Cet import sert à récupérer':
    'You can paste in bulk (text, a copied page…): only chart pages are kept, without duplicates. This import is meant to bring over',
  ta: 'your',
  'collection (tes partitions, tes favoris) —': 'collection (your charts, your favorites) —',
  'liens max par fournée.': 'links max per batch.',
  '{n} liens détectés{cap}.': '{n} links detected{cap}.',
  '{n} lien détecté{cap}.': '{n} link detected{cap}.',
  ' (plafond atteint)': ' (cap reached)',
  'Tout ajouter à ma bibliothèque': 'Add it all to my library',
  'Import en cours': 'Import in progress',
  'Arrêter après le morceau en cours': 'Stop after the current song',
  '{n} importés': '{n} imported',
  '{n} importé': '{n} imported',
  '{n} déjà présents': '{n} already there',
  '{n} déjà présent': '{n} already there',
  '{n} morceau ajouté': '{n} song added',
  'Réimporter quand même les {n} morceaux supprimés autrefois':
    'Re-import the {n} previously deleted songs anyway',
  'Réimporter quand même le morceau supprimé autrefois':
    'Re-import the previously deleted song anyway',
  '{n} morceaux ajoutés': '{n} songs added',
  '{n} en échec': '{n} failed',
  '{n} supprimés de mojosong (non réimportés)': '{n} deleted from mojosong (not re-imported)',
  // b368 — la feuille « réimporter les supprimés ? »
  '{n} morceau déjà supprimé': '{n} song previously deleted',
  '{n} morceaux déjà supprimés': '{n} songs previously deleted',
  'Tu avais supprimé ce morceau de ta bibliothèque : il n’a pas été réimporté. Veux-tu le faire revenir ?':
    'You had deleted this song from your library: it was not re-imported. Bring it back?',
  'Tu avais supprimé ces morceaux de ta bibliothèque : ils n’ont pas été réimportés. Veux-tu les faire revenir ?':
    'You had deleted these songs from your library: they were not re-imported. Bring them back?',
  '↩ Réimporter ce morceau': '↩ Re-import this song',
  '↩ Réimporter ces morceaux': '↩ Re-import these songs',
  '{n} supprimé de mojosong (non réimporté)': '{n} deleted from mojosong (not re-imported)',
  '{n} échecs': '{n} failed',
  '{n} échec': '{n} failed',
  'Nettoyage IA en cours': 'AI cleanup in progress',
  'Nettoyage IA terminé': 'AI cleanup done',
  '✨ Nettoyage IA en cours…': '✨ AI cleanup in progress…',
  "✨ Nettoyer à l'IA les {n} partitions au format problématique":
    '✨ AI-clean the {n} charts with a problematic format',
  "✨ Nettoyer à l'IA les {n} partition au format problématique":
    '✨ AI-clean the {n} chart with a problematic format',
  "L'IA ne touche que les morceaux marqués ⚠ — les autres restent tels quels. Chaque morceau garde son titre, son artiste et son statut (bibliothèque ou idée).":
    'The AI only touches songs marked ⚠ — the others stay as they are. Every song keeps its title and its artist.',

  // ---------- SongPicker.tsx ----------
  'Retirer « {title} » du répertoire de {band} ? Le morceau sortira du répertoire du groupe pour TOUS les membres — chacun garde la partition dans sa bibliothèque personnelle.':
    'Remove “{title}” from {band}’s repertoire? The song will leave the band’s repertoire for EVERY member — everyone keeps the chart in their personal library.',
  'Ajouter « {title} » à…': 'Add “{title}” to…',
  'Mes setlists': 'My setlists',
  'Pas encore de setlist.': 'No setlist yet.',
  'déjà dans la setlist': 'already in the setlist',
  'Mes groupes': 'My bands',
  'déjà au répertoire': 'already in the repertoire',
  '📥 proposition de {band} — l’ajouter la valide':
    '📥 proposed by {band} — adding it accepts it',
  '📥 proposition à valider — l’ajouter la valide':
    '📥 proposal to approve — adding it accepts it',
  'Rechercher un titre, un artiste…': 'Search a title, an artist…',
  'Ces morceaux sont ceux de ta bibliothèque. Pour en importer de nouveaux, ferme cet écran et passe par le ＋ de l’onglet Morceaux — si cet onglet est filtré sur un groupe, touche d’abord « Tout afficher ».':
    'These songs are the ones in your library. To import new ones, close this screen and use the ＋ in the Songs tab — if that tab is filtered on a band, tap “Show all” first.',
  'Ta bibliothèque est vide — importe un morceau depuis l’onglet Morceaux, il sera ensuite proposé ici.':
    'Your library is empty — import a song from the Songs tab and it will show up here.',
  // ---------- Retirer du répertoire d'un groupe (b278) ----------
  'Retirer du répertoire de {band}': 'Remove from {band}’s repertoire',
  'Retirer « {title} » du répertoire de {band} ?':
    'Remove “{title}” from {band}’s repertoire?',
  'Le morceau sort du répertoire du groupe pour TOUS les membres. Il RESTE dans ta bibliothèque personnelle, et dans celle de chacun.':
    'The song leaves the band’s repertoire for ALL members. It STAYS in your own library, and in everyone else’s.',
  'Retirer du répertoire': 'Remove from repertoire',
  '« {title} » retiré du répertoire — il reste chez toi.':
    '“{title}” removed from the repertoire — it stays in your library.',
  // ---------- Sortie d'une proposition : retrait du répertoire (b421) ----------
  'Le morceau quittera le répertoire pour TOUT le groupe. Ceux qui l’ont accepté gardent leur copie personnelle ; chez les autres — toi compris — la proposition disparaît.':
    'The song will leave the repertoire for the WHOLE band. Those who accepted it keep their personal copy; for everyone else — you included — the suggestion disappears.',
  'Tu l’avais apporté toi-même, ou il n’a plus sa place ? Retire-le du répertoire du groupe :':
    'You brought it yourself, or it no longer belongs? Remove it from the band’s repertoire:',
  // ---------- Corbeille : quelle intention ? (b279) ----------
  '« {title} » — que veux-tu faire ?': '“{title}” — what do you want to do?',
  'Tu regardes le répertoire de {groupe}. Retirer du répertoire et supprimer le morceau ne sont pas la même chose — dis-moi laquelle.':
    'You are looking at {groupe}’s repertoire. Removing from the repertoire and deleting the song are not the same thing — tell me which one.',
  'Le retirer du répertoire de {band}': 'Remove it from {band}’s repertoire',
  'Il reste dans ta bibliothèque — tu continues de le jouer en solo.':
    'It stays in your library — you keep playing it solo.',
  'Supprimer le morceau…': 'Delete the song…',
  'Là, il quitte ta bibliothèque. L’écran suivant dit exactement ce qui se passe.':
    'That one takes it out of your library. The next screen says exactly what happens.',
  'Ses {n} versions seront supprimées, et le morceau quittera aussi les setlists. Cette action est irréversible.':
    'All {n} of its versions will be deleted, and the song will also leave the setlists. This action is irreversible.',
  'Aucun morceau ne correspond.': 'No song matches.',

  // ---------- NoteModal.tsx ----------
  'Erreur {code}': 'Error {code}',
  'Synthèse indisponible — nécessite la version en ligne (Vercel).':
    'Summary unavailable — requires the online version (Vercel).',
  "Rien n'a été entendu. Parle plus près du micro — et si l'app installée ne capte rien, essaie dans Safari.":
    "Nothing was heard. Speak closer to the mic — and if the installed app picks up nothing, try Safari.",
  "La dictée vocale n'est pas disponible dans ce navigateur — essaie Chrome ou Edge.":
    'Voice dictation is not available in this browser — try Chrome or Edge.',
  "Le micro n'a pas démarré. Vérifie l'autorisation micro ; depuis l'app installée, essaie aussi dans Safari.":
    "The mic didn't start. Check the mic permission; from the installed app, also try Safari.",
  "🔒 L'IA a classé ce commentaire comme personnel — il ira dans ta note personnelle. Change la visibilité si besoin.":
    '🔒 The AI classified this comment as personal — it will go into your personal note. Change the visibility if needed.',
  "👥 L'IA a classé ce commentaire pour le groupe. Change la visibilité si besoin.":
    '👥 The AI classified this comment for the band. Change the visibility if needed.',
  'La synthèse a échoué.': 'The summary failed.',
  'Note de répétition': 'Rehearsal note',
  'Note actuelle': 'Current note',
  'Nouveau commentaire': 'New comment',
  Note: 'Note',
  'Départ batterie seule, break avant le pont, fin abrégée…':
    'Drums-only start, break before the bridge, shortened ending…',
  'Ton commentaire met la note à jour : ce qui est contredit est remplacé, le reste est conservé et complété.':
    "Your comment updates the note: what's contradicted is replaced, the rest is kept and completed.",
  '🎤 Dicter': '🎤 Dictate',
  '⏹ Annuler (micro…)': '⏹ Cancel (mic…)',
  '⏹ Arrêter la dictée': '⏹ Stop dictation',
  "🎤 Démarrage du micro… (autorise l'accès si demandé)":
    '🎤 Starting the mic… (allow access if asked)',
  "Enregistrement — parle, puis ⏹. La note sera résumée par l'IA.":
    'Recording — speak, then ⏹. The note will be summarized by AI.',
  "✨ Synthèse de la note par l'IA…": '✨ AI is summarizing the note…',
  '👥 Visible du groupe': '👥 Visible to the band',
  '🔒 Personnelle': '🔒 Personal',
  'Contexte : ': 'Context: ',
  'avec {band}': 'with {band}',
  'solo / tous': 'solo / everyone',
  'repris de la version affichée. Signée': 'taken from the version shown. Signed',
  ', datée automatiquement.': ', dated automatically.',
  'Enregistrer les modifications': 'Save changes',
  'Enregistrer la note': 'Save the note',
  '⏳ Fusion…': '⏳ Merging…',
  // Dictée par le serveur (b157)
  'Transcription indisponible — il faut être connecté au réseau.':
    'Transcription unavailable — you need to be online.',
  'Transcription indisponible — nécessite la version en ligne (Vercel).':
    'Transcription unavailable — requires the online version (Vercel).',
  'La transcription a échoué.': 'Transcription failed.',
  'Le micro du navigateur ne répond pas — on passe par la dictée enregistrée. Parle, puis appuie sur ⏹.':
    "The browser's microphone isn't responding — switching to recorded dictation. Speak, then press ⏹.",
  '✍️ Transcription…': '✍️ Transcribing…',
  '✍️ Transcription de ce que tu viens de dire…':
    '✍️ Transcribing what you just said…',
  'Ce navigateur ne sait pas enregistrer le micro — essaie Chrome ou Safari.':
    "This browser can't record the microphone — try Chrome or Safari.",
  "Micro indisponible — autorise l'accès au microphone pour ce site, puis réessaie.":
    'Microphone unavailable — allow microphone access for this site, then try again.',
  "Rien n'a été compris dans cet enregistrement.":
    'Nothing could be understood in that recording.',
  'Limite de {n} secondes atteinte : on transcrit ce que tu as dit. Dicte une seconde note si besoin.':
    'Reached the {n}-second limit: transcribing what you said. Dictate a second note if you need to.',

  // Import.tsx — mise en forme automatique (b220)
  'la mise en forme a échoué': 'formatting failed',
  '⚠ police PDF brouillée — décodage IA': '⚠ scrambled PDF font — AI decoding',
  '✨ mise en forme…': '✨ formatting…',
  'mis en forme — à vérifier': 'formatted — needs a check',
  'mis en forme': 'formatted',
  'mise en forme non aboutie': 'formatting did not complete',
  '✨ Mise en forme de la partition…': '✨ Formatting the chart…',
  'La mise en forme automatique n’a pas abouti — ta partition est reprise telle quelle.':
    'Automatic formatting did not complete — your chart is taken as it is.',
  'Mise en forme appliquée.': 'Formatting applied.',
  'Revenir à la version mise en forme': 'Back to the formatted version',
  'Garder ma version d’origine': 'Keep my original version',
  'La mise en forme laisse un doute : {raison}.':
    'The formatting leaves a doubt: {raison}.',
  'Compare l’aperçu ci-dessus et choisis. Sans réponse, la version mise en forme est gardée et le morceau reste marqué « à vérifier ».':
    'Compare the preview above and choose. With no answer, the formatted version is kept and the song stays flagged “needs a check”.',
  'Version mise en forme': 'Formatted version',
  'Ma version d’origine': 'My original version',
  'Mise en forme des partitions': 'Formatting the charts',
  'Mise en forme terminée': 'Formatting done',
  '✨ Reprendre la mise en forme': '✨ Resume formatting',
  'Chaque morceau garde son titre et son artiste. Les partitions où la mise en forme laisse un doute sont marquées « à vérifier » : tu les retrouves d’un geste dans ta bibliothèque, avec la possibilité de revenir à la version d’origine.':
    'Every song keeps its title and artist. Charts where the formatting leaves a doubt are flagged “needs a check”: you find them in one gesture in your library, and you can go back to the original version.',
  '↩ Revenir à ma partition d’origine': '↩ Back to my original chart',

  // b225 — positions d'accords à la guitare
  'Position ouverte': 'Open position',
  'Basse en {note}': 'Bass on {note}',
  'Case {n}': 'Fret {n}',
  'Barré case {n} — fondamentale sur la 5ᵉ corde':
    'Barre at fret {n} — root on the 5th string',
  'Barré case {n} — fondamentale sur la 6ᵉ corde':
    'Barre at fret {n} — root on the 6th string',
  'Position de {accord}': '{accord} shape',

  // b224 — retours de Marco
  'Jouer en mode scène': 'Play in stage mode',
  'Jouer « {title} » en mode scène': 'Play “{title}” in stage mode',
  'Une autre version ? Elles sont toujours là.':
    'Another version? They are still here.',

  // b223 — ce que verra le public, sur la fiche d'un morceau
  'Vue du public': 'Audience view',
  // b418 — une proposition ne se refuse pas
  '« {title} » est une proposition': '“{title}” is a suggestion',
  // b420 — la proposition vient d'une personne, jamais « d'un groupe »
  'Ce morceau t’est proposé par {qui} pour le répertoire de {groupe}. Une proposition ne se supprime pas : elle attend simplement ton acceptation — et elle disparaîtra d’elle-même si le groupe la retire de son répertoire.':
    'This song is suggested by {qui} for the {groupe} repertoire. A suggestion can’t be deleted: it simply waits for your acceptance — and it will disappear on its own if the band removes it from its repertoire.',
  'Ce morceau vient du répertoire de {groupe}. Une proposition ne se supprime pas : elle attend simplement ton acceptation — et elle disparaîtra d’elle-même si le groupe la retire de son répertoire.':
    'This song comes from the {groupe} repertoire. A suggestion can’t be deleted: it simply waits for your acceptance — and it will disappear on its own if the band removes it from its repertoire.',
  '« {title} » est au programme': '“{title}” is on the setlist',
  'Ce morceau est dans la setlist « {setlist} » de {groupe}. Tant qu’il y est, tu ne peux pas le supprimer : le programme engage les autres musiciens, pas seulement toi.':
    'This song is on {groupe}’s “{setlist}” setlist. While it’s there you can’t delete it: the setlist commits the other musicians, not just you.',
  'Retire-le d’abord de la setlist, puis reviens ici.':
    'Take it off the setlist first, then come back here.',
  'J’ai compris': 'Got it',
  'Retirer « {title} » de tes morceaux ?': 'Remove “{title}” from your songs?',
  'Il vient du répertoire de {groupe} : il ne sera pas effacé, il retournera dans tes propositions. Tu pourras le reprendre quand tu veux.':
    'It comes from {groupe}’s repertoire: it won’t be erased, it goes back to your proposals. You can take it back whenever you want.',
  'Remettre en proposition': 'Move back to suggestions',
  'Passer toute l’app en clair': 'Switch the whole app to light',
  'Repasser toute l’app en sombre': 'Switch the whole app back to dark',
  'Lire le morceau comme le liront tes spectateurs':
    'Read the song the way your audience will read it',
  'Ma partition': 'My chart',
  'Ce que verra le public': 'What the audience will see',
  'à revoir': 'needs a look',
  'texte retouché': 'edited text',
  'Tu as modifié la partition depuis que tu as écrit ce texte : le public lit toujours ta version, elle n’a pas suivi.':
    'You have changed the chart since you wrote this text: the audience still reads your version, it has not followed along.',
  'Aucune parole à afficher — le public verra l’écran de concert sans texte.':
    'No lyrics to show — the audience will see the concert screen with no text.',
  'Préparé automatiquement depuis ta partition : les accords sont retirés, les sections rappelées. Pour changer ce que lit le public, modifie la partition.':
    'Prepared automatically from your chart: chords removed, sections kept. To change what the audience reads, edit the chart.',
  'Texte écrit par toi. Le public lit ceci, et pas ta partition.':
    'Text written by you. The audience reads this, not your chart.',
  'Préparé depuis ta partition : les accords sont retirés, les sections rappelées. Il suit tes corrections tout seul.':
    'Prepared from your chart: chords removed, sections kept. It follows your edits on its own.',
  'Modifier ce texte': 'Edit this text',
  'Reprendre ma partition': 'Take my chart again',
  'Garder mon texte': 'Keep my text',
  'Revenir au texte automatique': 'Back to the automatic text',
  'Texte lu par le public': 'Text read by the audience',
  'Ta partition et tes accords ne bougent pas : tu ne modifies ici que ce que lisent tes spectateurs. Écris « Refrain : » en début de ligne pour marquer une section.':
    'Your chart and your chords do not move: here you only change what your audience reads. Write “Chorus:” at the start of a line to mark a section.',
  'Remet le texte préparé automatiquement depuis ta partition':
    'Puts back the text prepared automatically from your chart',
  'Repartir de ma partition': 'Start again from my chart',

  // b319→b334 — recherche & création d'une partition (tout dans mojosong)
  'Créer une partition': 'Create a chart',
  'Titre, artiste… (ex. hallelujah cohen)':
    'Title, artist… (e.g. hallelujah cohen)',
  'Chercher sur le web': 'Search the web',
  // b472 (point 4) — retour à la liste des résultats de recherche
  'Retour aux résultats': 'Back to results',
  // b478 (audit D-3) — les trois chemins d'import présentés
  'Un document ou un lien (PDF, Word, ChordPro, OnSong…), toute une collection d’un coup, ou une partition écrite à la main.':
    'A document or a link (PDF, Word, ChordPro, OnSong…), a whole collection at once, or a chart written by hand.',
  // b477 (audit lot 2) — session de recherche, aperçus, provenance
  'Choisir un autre résultat': 'Pick another result',
  'Reprendre : {titre}': 'Resume: {titre}',
  'brouillon en cours': 'draft in progress',
  'Type :': 'Type:',
  Aperçu: 'Preview',
  'Voir la partition avant de choisir': 'See the chart before choosing',
  '(contenu vide)': '(empty content)',
  'Aperçu indisponible pour l’instant — réessaie dans un moment.':
    'Preview unavailable right now — try again in a moment.',
  // b477 (C-9) — types de la source en clair
  Accords: 'Chords',
  Tablature: 'Tabs',
  'Basse (tablature)': 'Bass (tabs)',
  'Ukulélé (accords)': 'Ukulele (chords)',
  'Batterie (tablature)': 'Drums (tabs)',
  // b472 (point 5) — filtre par artiste sur les résultats de recherche
  'Artiste :': 'Artist:',
  Tous: 'All',
  'Recherche en cours : ': 'Current search: ',
  '« {titre} » existe déjà dans ton répertoire.':
    '“{titre}” is already in your repertoire.',
  'L’ouvrir': 'Open it',
  '— ou continue : deux arrangements du même titre sont légitimes.':
    '— or keep going: two arrangements of the same song are perfectly fine.',
  'Coller la partition copiée': 'Paste the copied chart',
  '…ou colle-la ici à la main.': '…or paste it here by hand.',
  'Mettre en forme': 'Format it',
  'Tape le titre (et l’artiste) : choisis une partition, elle se met en forme toute seule.':
    'Type the title (and the artist): pick a chart, it formats itself.',
  'Aucun résultat — précise le titre (et l’artiste).':
    'No results — refine the title (and the artist).',
  'Colle une partition (accords + paroles) ou le lien d’une partition.':
    'Paste a chart (chords + lyrics) or a chart link.',
  'Les résultats s’affichent dans mojosong : choisis, la partition se met en forme toute seule.':
    'Results show up inside mojosong: pick one, the chart formats itself.',
  'Le presse-papiers est vide — copie d’abord la partition.':
    'The clipboard is empty — copy the chart first.',
  'Ce navigateur ne permet pas de coller ici — utilise la zone de texte.':
    'This browser does not allow pasting here — use the text area.',
  'Enregistrer dans ma bibliothèque': 'Save to my library',
  'Recoller un autre texte': 'Paste another text',
  'Partition enregistrée dans ta bibliothèque.':
    'Chart saved to your library.',
  '« {titre} » existe déjà dans ton répertoire. Que veux-tu faire ?':
    '“{titre}” is already in your repertoire. What do you want to do?',
  'Ouvrir la partition existante': 'Open the existing chart',
  'La remplacer par cette mise en forme': 'Replace it with this formatting',
  'Garder les deux': 'Keep both',
  '↩ Revenir à l’aperçu': '↩ Back to the preview',
  'Nouvelle mise en forme': 'New formatting',
  'La partition existante a été mise à jour.':
    'The existing chart has been updated.',
  'Reprendre la création de « {titre} » ?':
    'Resume creating “{titre}”?',
  'Reprendre': 'Resume',
  '⏳ Récupération…': '⏳ Fetching…',
  "L'import du lien a échoué.": 'Importing the link failed.',

  // Limites du plan (b381, simplifié b386) — Library.tsx & Import.tsx
  '{n} / {max} morceaux': '{n} / {max} songs',
  'ta bibliothèque gratuite est pleine.': 'your free library is full.',
  '{n} non importés — bibliothèque gratuite pleine.':
    '{n} not imported — free library full.',
  'non importé — bibliothèque gratuite pleine':
    'not imported — free library full',
  '{n} non importés (plan gratuit)': '{n} not imported (free plan)',
};
