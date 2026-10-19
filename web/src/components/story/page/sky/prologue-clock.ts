import { motionValue } from 'framer-motion';

/**
 * The Prologue's progress (0 → 1 over its track), for layers that live
 * outside its tree: the sky's labels, where Mika's card opens out of her
 * star. PrologueStage sets it; nothing else does.
 */
export const prologueClock = motionValue(0);
