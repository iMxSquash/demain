import type { Translate } from "../../src/domain/message";

/** Stands in for the translator: the message of a failure is then its key. */
export const translateKey: Translate = (ref) => ref.key;
