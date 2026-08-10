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
  'Le morceau sera aussi retiré des setlists.': 'The song will also be removed from setlists.',
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
  'Morceaux importés non encore validés — réserve à travailler':
    'Imported songs not yet confirmed — work-in-progress stash',
  '💡 Idées ({n})': '💡 Ideas ({n})',
  'Répertoires :': 'Repertoires:',
  'Répertoire jouable en solo (tous les morceaux par défaut, sauf déqualifiés depuis leur fiche)':
    'Repertoire playable solo (every song by default, unless disqualified from its page)',
  'Réserve à travailler : jouables partout, mais pas encore validées dans la bibliothèque — ouvre un morceau pour le valider ✓ ou le supprimer.':
    'Work-in-progress stash: playable anywhere, but not yet confirmed in the library — open a song to confirm ✓ it or delete it.',
  'Partitions ajoutées cette semaine — {n} morceaux.': 'Charts added this week — {n} songs.',
  'Partitions ajoutées cette semaine — {n} morceau.': 'Charts added this week — {n} song.',
  'Filtre actif :': 'Active filter:',
  'Tout afficher': 'Show all',
  'Tag :': 'Tag:',
  Retirer: 'Remove',
  'Importe tes partitions': 'Import your charts',
  "Colle un texte, un lien d'une page de partition, un PDF ou un fichier Word — Sing2Me met tout au propre.":
    'Paste text, a link to a chart page, a PDF or a Word file — Sing2Me tidies it all up.',
  'Importer mon premier morceau': 'Import my first song',
  'Aucun morceau ne correspond à ta recherche.': 'No song matches your search.',
  'Ajouter des morceaux au répertoire du groupe': "Add songs to the band's repertoire",
  'Ajouter des morceaux': 'Add songs',
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
  'Sing2Me cherche la version la mieux notée de cette partition et te la propose':
    'Sing2Me looks for the best-rated version of this chart and suggests it to you',
  '★ Meilleure version ?': '★ Better version?',
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
  'Idée à travailler': 'Idea to work on',
  'Jouable partout, mais pas encore validée dans ta bibliothèque.':
    'Playable anywhere, but not yet confirmed in your library.',
  '✓ Valider dans la bibliothèque': '✓ Confirm in the library',
  'Déqualifié du répertoire solo — cliquer pour le requalifier':
    'Disqualified from the solo repertoire — click to requalify it',
  'Jouable en solo (par défaut) — cliquer pour le déqualifier si tu ne peux pas le jouer seul':
    "Playable solo (by default) — click to disqualify it if you can't play it alone",
  'Pas en solo': 'Not solo',
  'Solo ✓': 'Solo ✓',
  'Version du groupe {band}': 'The {band} version',
  'Version de référence': 'Reference version',
  'Version « {name} »': 'Version “{name}”',
  partagée: 'shared',
  '⭐ référence': '⭐ reference',
  perso: 'personal',
  'Tes modifications de cette version arrivent chez tous les membres du groupe.':
    'Your changes to this version reach every member of the band.',
  'Version maîtresse, personnelle : elle reste dans ta bibliothèque et sert de base aux autres (tonalité/capo se répercutent).':
    'Master, personal version: it stays in your library and is the base for the others (key/capo carry over).',
  'À toi seul — cette version n’est pas partagée.': "Just for you — this version isn't shared.",
  'Changer de version affichée': 'Switch displayed version',
  'Actions sur les versions': 'Version actions',
  'Versions : référence, renommer, meilleure version, supprimer':
    'Versions: reference, rename, better version, delete',
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
  '★ Chercher une meilleure version (IA)': '★ Look for a better version (AI)',
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
  'Version maîtresse, personnelle : elle reste dans ta bibliothèque et sert de base aux autres versions (tonalité/capo se répercutent).':
    'Master, personal version: it stays in your library and is the base for the other versions (key/capo carry over).',
  'Version maîtresse, personnelle : la base de ce morceau.':
    "Master, personal version: this song's base.",
  'À l’enregistrement, tes changements partent vers tous les membres du groupe.':
    'On save, your changes go out to every member of the band.',
  'Modifications privées à cette version — les autres versions gardent leurs réglages.':
    "Changes are private to this version — the other versions keep their own settings.",
  'Version modifiée': 'Edited version',
  principale: 'main',
  'Nom de cette version': 'This version’s name',
  '🔒 L’originale est toujours ': '🔒 The original is always ',
  personnelle: 'personal',
  ' : c’est ta façon de le jouer, et la modifier se répercute sur les versions de groupe qui la suivent. Pour une version dédiée à un groupe, utilise « Ajouter à… » depuis la partition.':
    ': it is how you play it, and editing it carries over to the band versions that follow it. For a version dedicated to a band, use “Add to…” from the chart.',
  'Cette version est pour': 'This version is for',
  'Moi seul (version personnelle)': 'Just me (personal version)',
  Tonalité: 'Key',
  'Tempo (BPM)': 'Tempo (BPM)',
  '⚑ Version principale : un changement de tonalité ou de capo est répercuté sur les versions qui la suivaient (celles sans réglage propre), et partagé avec le groupe à la synchronisation.':
    '⚑ Main version: a change of key or capo carries over to the versions that were following it (those without their own setting), and is shared with the band on sync.',
  "Cette version garde ses propres tonalité et capo — la version principale n'est pas affectée.":
    "This version keeps its own key and capo — the main version isn't affected.",
  "À l'enregistrement, Sing2Me te demandera si tes changements de partition valent pour":
    'On save, Sing2Me will ask whether your chart changes apply to',
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
  ' — idée validée ✓': ' — idea confirmed ✓',
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
  'supprimé de Sing2Me — non réimporté (passe par « Document ou lien » pour le récupérer)':
    'deleted from Sing2Me — not re-imported (use “Document or link” to get it back)',
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
  '✅ Analyse : rien à corriger.': '✅ Analysis: nothing to fix.',
  'ℹ Tu as déjà « {title} »': 'ℹ You already have “{title}”',
  ' (dans tes idées)': ' (in your ideas)',
  ' : cet import le rejoindra comme nouvelle version — aucun doublon.':
    ' : this import will join it as a new version — no duplicate.',
  'Aperçu de la partition': 'Chart preview',
  '✨ Nettoyage en cours…': '✨ Cleaning up…',
  "✨ L'analyse suggère un nettoyage IA — corriger le format":
    '✨ The analysis suggests an AI cleanup — fix the format',
  "L'IA réécrit la partition au format standard (accords [Am] dans les paroles, sections nommées) pour régler les points ⚠ ci-dessus. Version en ligne + clé IA requises.":
    'The AI rewrites the chart in the standard format (chords [Am] in the lyrics, named sections) to fix the ⚠ points above. Online version + AI key required.',
  'Jouable tout de suite, mais rangé dans les idées à travailler':
    'Playable right away, but filed under ideas to work on',
  'Garder comme idée — à travailler avant validation': 'Keep as an idea — to work on before confirming',
  "Une « idée » est jouable immédiatement (concert, demande du public…) mais reste dans ta réserve jusqu'à ce que tu la valides dans la bibliothèque.":
    'An “idea” is playable right away (a gig, an audience request…) but stays in your stash until you confirm it in the library.',
  'Ajouter à ma bibliothèque': 'Add to my library',
  'Ajouter un morceau': 'Add a song',
  'Rechercher un morceau': 'Search a song',
  'Titre et artiste — ex. Angie Rolling Stones': 'Title and artist — e.g. Angie Rolling Stones',
  '🔎 Recherche en cours…': '🔎 Searching…',
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
  ': ouvre chaque page de partition et enregistre-la (Ctrl+S) — dépose ces .html ici, la partition est extraite directement du fichier, sans passer par le serveur. Tu peux aussi déposer plusieurs fichiers de partitions exportés d’une autre application (txt, ChordPro, OnSong, Word, PDF) : un fichier = un morceau.':
    ': open each chart page and save it (Ctrl+S) — drop these .html files here, the chart is extracted directly from the file, without going through the server. You can also drop several chart files exported from another app (txt, ChordPro, OnSong, Word, PDF): one file = one song.',
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
  'Tout garder comme idées — à travailler': 'Keep it all as ideas — to work on',
  'Import en cours': 'Import in progress',
  'Arrêter après le morceau en cours': 'Stop after the current song',
  '{n} importés': '{n} imported',
  '{n} importé': '{n} imported',
  '{n} déjà présents': '{n} already there',
  '{n} déjà présent': '{n} already there',
  '{n} supprimés de Sing2Me (non réimportés)': '{n} deleted from Sing2Me (not re-imported)',
  '{n} supprimé de Sing2Me (non réimporté)': '{n} deleted from Sing2Me (not re-imported)',
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
    'The AI only touches songs marked ⚠ — the others stay as they are. Every song keeps its title, its artist and its status (library or idea).',

  // ---------- SongPicker.tsx ----------
  'Retirer « {title} » du répertoire de {band} ? Le morceau sortira du répertoire du groupe pour TOUS les membres — chacun garde la partition dans sa bibliothèque personnelle.':
    'Remove “{title}” from {band}’s repertoire? The song will leave the band’s repertoire for EVERY member — everyone keeps the chart in their personal library.',
  'Ajouter « {title} » à…': 'Add “{title}” to…',
  'Mes setlists': 'My setlists',
  'Pas encore de setlist.': 'No setlist yet.',
  'déjà dans la setlist': 'already in the setlist',
  'Mes groupes': 'My bands',
  'déjà au répertoire': 'already in the repertoire',
  'Rechercher un titre, un artiste…': 'Search a title, an artist…',
  'Ta bibliothèque est vide — importe des morceaux d’abord.':
    'Your library is empty — import some songs first.',
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
  'Chaque morceau garde son titre, son artiste et son statut (bibliothèque ou idée). Les partitions où la mise en forme laisse un doute sont marquées « à vérifier » : tu les retrouves d’un geste dans ta bibliothèque, avec la possibilité de revenir à la version d’origine.':
    'Every song keeps its title, artist and status (library or idea). Charts where the formatting leaves a doubt are flagged “needs a check”: you find them in one gesture in your library, and you can go back to the original version.',
  '↩ Revenir à ma partition d’origine': '↩ Back to my original chart',
  ' · ✨ mis en forme': ' · ✨ formatted',
  'Revenir à la version d’origine': 'Back to the original version',

  // b223 — ce que verra le public, sur la fiche d'un morceau
  'Ce que verra le public': 'What the audience will see',
  'à revoir': 'needs a look',
  'texte retouché': 'edited text',
  'Tu as modifié la partition depuis que tu as écrit ce texte : le public lit toujours ta version, elle n’a pas suivi.':
    'You have changed the chart since you wrote this text: the audience still reads your version, it has not followed along.',
  'Aucune parole à afficher — le public verra l’écran de concert sans texte.':
    'No lyrics to show — the audience will see the concert screen with no text.',
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
};
