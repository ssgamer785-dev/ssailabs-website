import React, { useCallback } from 'react';

/**
 * Enter moves to the next measurement box.
 *
 * A tailor reads measurements off a tape one after another and types them the
 * same way. Reaching for the mouse between every field, or trusting Tab to
 * land somewhere sensible when the next thing in the tab order is a remarks
 * box or a quantity stepper, is what makes entering fourteen garments slow.
 *
 * Two things matter more than the convenience:
 *
 *   Enter must not submit. Inside a form a bare Enter presses the first submit
 *   button, which here means placing the order from the middle of the coat.
 *   Every path through this module calls preventDefault first.
 *
 *   It must only apply to measurements. The handler is attached to the
 *   measurement region and only acts on inputs that carry the marker
 *   attribute, so a search box, a customer field or a notes area inside the
 *   same form keeps its ordinary behaviour.
 *
 * Order comes from the DOM, not from a list kept somewhere else: whatever the
 * screen shows top to bottom is the order Enter follows, which is what makes
 * it correct for a 3 Piece Suit's coat, then pant, then waistcoat without any
 * of those sections having to know about each other.
 */

/** Marks an input as part of the measurement run. */
export const MEASUREMENT_INPUT_ATTR = 'data-measurement-input';

/** Put this on every measurement input: `{...measurementInputProps}`. */
export const measurementInputProps = { [MEASUREMENT_INPUT_ATTR]: 'true' } as const;

const SELECTOR = `input[${MEASUREMENT_INPUT_ATTR}]`;

/**
 * Can this field actually receive what the user types?
 *
 * Disabled and read-only fields are skipped because typing into them does
 * nothing. A field with no layout boxes is hidden — a collapsed section, or a
 * garment that is not selected — and skipping it is what keeps Enter from
 * disappearing into a part of the form nobody can see.
 */
function isReachable(el: HTMLInputElement): boolean {
  if (el.disabled || el.readOnly) return false;
  if (el.hidden) return false;
  return el.getClientRects().length > 0;
}

/** Every measurement input in the region, in the order the screen shows them. */
export function measurementInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>(SELECTOR)).filter(isReachable);
}

/**
 * The field Enter should move to, or null at the end of the run.
 *
 * Null rather than wrapping to the top: a tailor who has finished the last
 * measurement is done, and throwing them back to Length reads as the form
 * having lost their work.
 */
export function nextMeasurementInput(
  container: HTMLElement,
  current: HTMLInputElement
): HTMLInputElement | null {
  const fields = measurementInputs(container);
  const at = fields.indexOf(current);
  if (at === -1) return null;
  return fields[at + 1] ?? null;
}

/**
 * Handles Enter for a whole measurement region, by delegation.
 *
 * One handler on the region rather than one per input: sections appear and
 * disappear as garments are selected, and a delegated handler cannot fall out
 * of step with them the way a list of refs does.
 */
export function handleMeasurementEnter(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

  const target = event.target as HTMLElement | null;
  if (!target || target.tagName !== 'INPUT') return;
  if (!target.hasAttribute(MEASUREMENT_INPUT_ATTR)) return;

  // Before anything else, and whether or not there is somewhere to go: this is
  // what stops Enter on the last measurement from placing the order.
  event.preventDefault();

  const container = event.currentTarget as HTMLElement;
  const next = nextMeasurementInput(container, target as HTMLInputElement);
  if (!next) return;

  next.focus();
  // Selecting lets the next measurement be typed straight over an old value,
  // which is the whole point when a returning customer is re-measured.
  try {
    next.select();
  } catch {
    /* number inputs in some browsers refuse select(); focus alone is enough. */
  }
}

/** `<div {...useMeasurementEnter()}>` around any set of measurement inputs. */
export function useMeasurementEnter(): { onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void } {
  const onKeyDown = useCallback(handleMeasurementEnter, []);
  return { onKeyDown };
}
