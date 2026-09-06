# La provenance parent/enfant est mécanique et la liaison orchestrateur est forte

L'orchestration récursive (#709) exige qu'un Run sache qui l'a créé et qu'un NodeRun orchestrator ne se déclare jamais terminé pendant que ses runs enfants tournent. Décision double : le lien `parent_run_id` + `parent_node_id` est **posé par le daemon** pour tout run créé depuis une session de nœud (agent, script) — jamais déclaré par l'appelant, qui ne peut pas le fournir hors session — et le NodeRun orchestrator reste en attente jusqu'à ce que tous ses enfants soient en état terminal, `pdo complete` refusé entre-temps. Un enfant est partout ailleurs un run ordinaire : aucune propagation de mort vers le bas (stop, archive ou forget du parent ne le touchent), projet du parent par défaut mais overridable, isolation de worktree inchangée (ADR-0060).

## Considered Options

- **Type de Node `orchestrator` dédié** (forme initiale de #709) : rejeté — la capacité de spawn est universelle (tout nœud peut orchestrer, avec ou sans le skill) ; un type dédié en ferait un clergé spécialisé. Le toggle « Orchestrator » n'apporte que du prompt fiché et de l'UI.
- **Liaison faible** (l'agent complète quand il veut, PDO ne fait qu'afficher) : rejetée — sans liaison, la complétion du nœud ment dès qu'un enfant échoue après `pdo complete`, et « first party » ne serait que de la peinture. Le refus de `pdo complete` tant que des enfants tournent est le contrat qui rend l'orchestration fiable.
- **Provenance déclarée** (champ `parent` sur `POST /runs`, comme `triggered_by`) : rejetée — un agent pourrait mentir ou se rattacher au run voisin ; la session est le seul témoin digne de foi, et le daemon la connaît déjà.

## Consequences

- La projection d'événements porte deux champs de plus (`parent_run_id`, `parent_node_id`) dès `RunStarted` ; la liste de runs les expose pour le badge et le filtre « racines seules ».
- Le seed du skill `pdo-orchestrate` dans la Banque de skills est le premier mécanisme de seed du produit : contenu versionné avec PDO, dossier « PDO », verrouillé en édition/suppression, ressemé au changement de version. Volontairement minimal — un seul skill seedé.
- Le scheduler gagne une dépendance NodeRun → runs enfants : un orchestrator peut attendre indéfiniment des enfants `awaiting_user` — c'est le comportement voulu (l'utilisateur tranche).
