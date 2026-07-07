/** Save-schema version. Bump when GameState shape changes, and add a case
 *  to the migrate() switch in db.ts. Lives outside db.ts so engine code
 *  (newGame.ts) can reference it without a circular import. */
export const SAVE_VERSION = 1;
