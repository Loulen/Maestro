# ADR-0067 — La relecture de diff est une conversation dans l'event log, entre deux refs du Run

> Statut : accepted (grilling #746). Vocabulaire : CONTEXT.md § « Relecture de diff (Review) ».

## Contexte

Le diff de Run n'a jamais été visible en usage réel : le handler lançait `git diff` dans le cwd
du daemon au lieu du dépôt effectif du Run, et personne ne l'a vu parce que la surface — une
section repliable dans Info, patch brut colorisé — n'invitait pas à s'en servir. La demande #746
veut une relecture au niveau d'une PR GitHub, et surtout un canal pour renvoyer les remarques à
l'agent et savoir comment il les a traitées. Aujourd'hui le seul canal de retour est de taper dans
le tmux du manager.

## Décisions

**1. Deux refs du Run, pas un diff par nœud.** La Review compare deux refs persistantes connues du
Run (point de fork, tip, `before`/`after` de chaque livraison de nœud). Écartée : une surface
« diff de nœud ». Mesuré : les branches `pdo/sub-*` sont supprimées au merge-back (zéro branche
`pdo/sub-*` dans le dépôt hôte après des centaines de Runs), donc une identité « branche du nœud »
meurt avec le nœud ; seuls les SHA de livraison gelés dans l'event log survivent. Et un diff par
nœud sur le sous-worktree montrait le bruit des nœuds sœurs mergés entre-temps — un commentaire
y aurait pointé du code que le nœud n'a pas écrit.

**2. Les commentaires envoyés vivent dans l'event log du Run.** `draft` reste côté client ; dès
`sent`, le commentaire, ses réponses, résolutions et réouvertures sont des événements du Run.
Écartées : une table SQLite dédiée (un second store à archiver, purger et projeter, alors que
« tout l'état du Run est sur disque » est l'invariant que le manager exploite) ; un état
frontend seul (perdu à l'archivage, invisible pour l'agent). Conséquence : un commentaire `sent`
est immuable ; seul un `draft` s'édite ou se supprime.

**3. Le retour de l'agent passe par le CLI, pas par la lecture du tmux.** `pdo review list` /
`pdo review reply` sont disponibles à toute session du Run (manager comme nœud, auteur enregistré),
et le message d'envoi au manager porte les ids pour que la réponse soit adressable. Écartée : PDO
choisit lui-même la commande de fix (inject sur le nœud auteur) — c'est précisément le rôle du
manager, on ne duplique pas sa décision (ADR-0012).

**4. L'humain résout par défaut.** Une réponse `--resolved` est une *proposition* tant que le
réglage d'instance `review_agent_can_resolve` est faux ; l'humain garde toujours `reopen`.
L'inverse (l'agent ferme) aurait fait du commentaire un ticket que l'agent s'auto-valide.

**5. Ancrage à la GitHub.** Un commentaire est ancré sur (path, côté, ligne, refs). Si la
destination bouge et que la ligne est inchangée, il est reporté ; sinon `outdated`, hunk d'origine
conservé. Écarté : `outdated` dès que la destination change — chaque merge-back de nœud sœur
aurait rendu tous les commentaires inutilisables.
