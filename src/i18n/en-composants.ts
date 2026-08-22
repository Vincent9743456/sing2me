/** Traductions anglaises — domaine composants (clé = chaîne française exacte). */
export const EN_COMPOSANTS: Record<string, string> = {
  // b380 — refonte navigation, lot 3 (prise en main)
  'Joue-le en mode Scène': 'Play it in Stage mode',
  'Lance ton premier live': 'Start your first live',
  'Prise en main terminée': 'Getting started complete',
  'Avec mojosong, tes paroles s’affichent en direct sur le téléphone de ton public pendant que tu joues. Rien à installer pour eux, rien conservé après le concert.':
    'With mojosong, your lyrics show up live on your audience’s phones while you play. Nothing for them to install, nothing kept after the show.',

  // Onboarding.tsx — checklist de prise en main
  'Importe ton premier morceau': 'Import your first song',
  'Joue-le en mode scène': 'Play it in stage mode',
  'Crée ta première setlist': 'Create your first setlist',
  'Invite ton groupe': 'Invite your band',
  'Découvre le répertoire de {name}': 'Discover {name}’s repertoire',
  'ton groupe': 'your band',
  'Joue un morceau en mode scène': 'Play a song in stage mode',
  'Dis bonjour dans la discussion du groupe': 'Say hi in the band chat',
  'Ajoute tes propres morceaux': 'Add your own songs',
  // Onboarding.tsx — bannière & carte de bienvenue
  Fermer: 'Close',
  '🎉 Tu as rejoint {name} !': '🎉 You joined {name}!',
  'Son répertoire arrive dans ta bibliothèque. Tes propres morceaux restent à toi.':
    'Its repertoire is arriving in your library. Your own songs stay yours.',
  'Voir le groupe': 'View band',
  'C’est prêt !': 'All set!',
  'Bienvenue sur mojosong 🎶': 'Welcome to mojosong 🎶',
  'Commence par importer un morceau — colle un texte, un lien de partition, un PDF ou un fichier Word.':
    'Start by importing a song — paste text, a chart link, a PDF, or a Word file.',
  'Tu as déjà une collection de partitions ? Importe-la en une fois : dépose tes fichiers (txt, ChordPro, OnSong, Word, PDF) ou tes pages enregistrées, mojosong met tout au propre.':
    'Already have a collection of charts? Import it all at once: drop your files (txt, ChordPro, OnSong, Word, PDF) or your saved pages, and mojosong tidies everything up.',
  'Importer ma collection': 'Import my collection',
  'Ajouter un seul morceau': 'Add a single song',
  'Importer mon premier morceau': 'Import my first song',
  'Voir un exemple en mode scène': 'See an example in stage mode',
  'Prise en main': 'Getting started',
  Masquer: 'Hide',

  // CoachMark.tsx
  "Fermer l'aide": 'Close hint',

  // InstallHint.tsx
  'Installer mojosong': 'Install mojosong',
  'Installe mojosong': 'Install mojosong',
  'Touche Partager, puis « Sur l’écran d’accueil » — accès direct, plein écran.':
    'Tap Share, then “Add to Home Screen” — direct access, full screen.',
  'Un accès direct depuis ton écran d’accueil, en plein écran.':
    'Direct access from your home screen, full screen.',
  Installer: 'Install',

  // UpdateHint.tsx
  'Mise à jour disponible': 'Update available',
  'Nouvelle version disponible': 'New version available',
  '✨ Application mise à jour (b{v}).': '✨ App updated (b{v}).',
  "Un tap et c'est à jour — tes données ne bougent pas.":
    "One tap and you're up to date — your data doesn't move.",
  'Mettre à jour': 'Update',

  // ErrorBoundary.tsx
  'Oups — un petit couac': 'Oops — a little hiccup',
  "L'application a rencontré une erreur inattendue. Tes données sont en sécurité (elles restent sur ton appareil). Recharge pour reprendre.":
    'The app ran into an unexpected error. Your data is safe (it stays on your device). Reload to continue.',
  "Recharger l'application": 'Reload the app',
  'Détail technique': 'Technical details',

  // GearEditor.tsx
  Instrument: 'Instrument',
  Micro: 'Mic',
  Ampli: 'Amp',
  Sono: 'PA',
  Effet: 'Effect',
  Câble: 'Cable',
  Autre: 'Other',
  'Quantité de {name}': 'Quantity of {name}',
  Quantité: 'Quantity',
  Retirer: 'Remove',
  'Retirer {name}': 'Remove {name}',
  'Câble XLR, guitare Takamine, HF Sennheiser…':
    'XLR cable, Takamine guitar, Sennheiser wireless…',
  Ajouter: 'Add',

  // SongBody.tsx
  '🗺 Structure': '🗺 Structure',

  // StagePlan.tsx
  'FOND DE SCÈNE': 'BACK OF STAGE',
  PUBLIC: 'AUDIENCE',
  'Retirer {name} du plan': 'Remove {name} from the plan',
  'Plan de scène vide.': 'Stage plan is empty.',
  'Ajoute les musiciens ci-dessous, puis déplace-les au doigt ou à la souris.':
    'Add musicians below, then drag them into place with your finger or mouse.',
  Nom: 'Name',
  Placer: 'Place',

  // AutoScroll.tsx
  'Plus vite': 'Faster',
  'Défilement automatique': 'Auto-scroll',
  'Moins vite': 'Slower',
  'Défil.': 'Scroll',

  // TipBox.tsx
  '💛 Soutenir {name}': '💛 Support {name}',
  "l'artiste": 'the artist',
  'Montant libre': 'Custom amount',
  "Paiement sécurisé, directement à l'artiste.":
    'Secure payment, directly to the artist.',

  // LinkPreviews.tsx
  'Vidéo YouTube': 'YouTube video',
  'Écoute Spotify': 'Spotify listen',
  '▶ Regarder sur YouTube': '▶ Watch on YouTube',
  '♪ Écouter sur Spotify': '♪ Listen on Spotify',

  // UpgradeSheet.tsx — limites du plan (b381, habillage b384, offre v2 b385)
  'Passer en illimité': 'Go unlimited',
  'Ton répertoire mérite plus grand': 'Your repertoire deserves bigger',
  'Ton compte gratuit va jusqu’à {n} morceaux. Passe en illimité pour continuer à l’enrichir.':
    'Your free account goes up to {n} songs. Go unlimited to keep it growing.',
  '{n} / {max} morceaux': '{n} / {max} songs',
  'Morceaux sans plafond, pour un répertoire qui grandit avec toi.':
    'Songs without a cap, for a repertoire that grows with you.',
  'Morceaux illimités': 'Unlimited songs',
  'Salle de live illimitée': 'Unlimited live audience',
  'Groupes, setlists et import : déjà sans limite pour tous':
    'Bands, setlists and import: already unlimited for everyone',
  'Tout le reste, sans limite': 'Everything else, without limits',
  'L’offre illimitée arrive bientôt. Rien ne presse : tu seras prévenu ici même.':
    'The unlimited offer is coming soon. No rush: you will be told right here.',

  // SongPicker.tsx — morceau en réserve (b385)
  '📦 Ce morceau est en réserve. Active-le pour le programmer dans une setlist ou le partager à un groupe.':
    '📦 This song is in your reserve. Activate it to add it to a setlist or share it with a band.',
};
