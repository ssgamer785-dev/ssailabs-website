// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  MEASUREMENT_INPUT_ATTR,
  measurementInputs,
  nextMeasurementInput,
  handleMeasurementEnter
} from '../measurementFocus';

/** A measurement region, built the way the modals build one. */
function region(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

const field = (name: string, extra = '') =>
  `<input ${MEASUREMENT_INPUT_ATTR}="true" name="${name}" ${extra} />`;

/** jsdom gives everything a zero-size box, so reachability is stubbed to the
 *  one thing it cannot answer: whether the element is laid out at all. */
function layOut(host: HTMLElement, hidden: string[] = []) {
  host.querySelectorAll('input').forEach(el => {
    const isHidden = hidden.includes((el as HTMLInputElement).name);
    (el as HTMLElement).getClientRects = (() =>
      (isHidden ? [] : [{ width: 10, height: 10 }])) as unknown as () => DOMRectList;
  });
}

const enterOn = (host: HTMLElement, input: HTMLInputElement) => {
  const prevented = { value: false };
  handleMeasurementEnter({
    key: 'Enter',
    shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    target: input,
    currentTarget: host,
    preventDefault: () => { prevented.value = true; }
  } as unknown as React.KeyboardEvent<HTMLElement>);
  return prevented.value;
};

describe('Enter walks the measurement fields in the order they are shown', () => {
  it('moves to the next field', () => {
    const host = region(field('length') + field('chest') + field('stomach'));
    layOut(host);
    const [length, chest] = measurementInputs(host);
    expect(nextMeasurementInput(host, length)).toBe(chest);
  });

  it('follows the visual order across garment sections', () => {
    // A 3 Piece Suit: coat, then pant, then waistcoat, as the screen shows it.
    const host = region(
      `<div>${field('coat.shoulder')}</div>` +
      `<div>${field('pant.length')}</div>` +
      `<div>${field('waistcoat.length')}</div>`
    );
    layOut(host);
    const [coatShoulder, pantLength, waistcoatLength] = measurementInputs(host);
    expect(nextMeasurementInput(host, coatShoulder)).toBe(pantLength);
    expect(nextMeasurementInput(host, pantLength)).toBe(waistcoatLength);
  });

  it('stops at the last field rather than wrapping round', () => {
    const host = region(field('length') + field('chest'));
    layOut(host);
    const last = measurementInputs(host)[1];
    expect(nextMeasurementInput(host, last)).toBeNull();
  });
});

describe('fields Enter must step over', () => {
  it('skips a disabled field', () => {
    const host = region(field('length') + field('chest', 'disabled') + field('stomach'));
    layOut(host);
    const all = host.querySelectorAll('input');
    expect(measurementInputs(host).map(i => i.name)).toEqual(['length', 'stomach']);
    expect(nextMeasurementInput(host, all[0] as HTMLInputElement)?.name).toBe('stomach');
  });

  it('skips a read-only field', () => {
    const host = region(field('length') + field('chest', 'readonly') + field('stomach'));
    layOut(host);
    expect(measurementInputs(host).map(i => i.name)).toEqual(['length', 'stomach']);
  });

  it('skips a field that is not laid out, such as a collapsed section', () => {
    const host = region(field('length') + field('chest') + field('stomach'));
    layOut(host, ['chest']);
    const first = host.querySelector('input') as HTMLInputElement;
    expect(nextMeasurementInput(host, first)?.name).toBe('stomach');
  });

  it('ignores inputs that are not measurements', () => {
    const host = region(field('length') + '<input name="notes" />' + field('chest'));
    layOut(host);
    expect(measurementInputs(host).map(i => i.name)).toEqual(['length', 'chest']);
  });
});

describe('Enter never submits the form', () => {
  it('prevents the default on every measurement field', () => {
    const host = region(field('length') + field('chest'));
    layOut(host);
    const [length, chest] = measurementInputs(host);
    expect(enterOn(host, length), 'first field').toBe(true);
    expect(enterOn(host, chest), 'last field').toBe(true);
  });

  it('prevents the default on the LAST field, where a submit would fire', () => {
    const host = region(field('length'));
    layOut(host);
    const only = measurementInputs(host)[0];
    expect(enterOn(host, only)).toBe(true);
    // Nowhere to go, and nothing submitted.
    expect(nextMeasurementInput(host, only)).toBeNull();
  });

  it('leaves a non-measurement input alone, so Enter still works there', () => {
    const host = region('<input name="search" />');
    const search = host.querySelector('input') as HTMLInputElement;
    expect(enterOn(host, search)).toBe(false);
  });

  it('does not act on other keys, so Tab is untouched', () => {
    const host = region(field('length') + field('chest'));
    layOut(host);
    const prevented = vi.fn();
    handleMeasurementEnter({
      key: 'Tab', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
      target: measurementInputs(host)[0], currentTarget: host, preventDefault: prevented
    } as unknown as React.KeyboardEvent<HTMLElement>);
    expect(prevented).not.toHaveBeenCalled();
  });

  it('does not hijack Shift+Enter or Ctrl+Enter', () => {
    const host = region(field('length') + field('chest'));
    layOut(host);
    for (const mod of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
      const prevented = vi.fn();
      handleMeasurementEnter({
        key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
        [mod]: true,
        target: measurementInputs(host)[0], currentTarget: host, preventDefault: prevented
      } as unknown as React.KeyboardEvent<HTMLElement>);
      expect(prevented, mod).not.toHaveBeenCalled();
    }
  });
});

describe('focus actually moves', () => {
  it('the next field ends up focused', () => {
    const host = region(field('length') + field('chest'));
    layOut(host);
    const [length, chest] = measurementInputs(host);
    length.focus();
    enterOn(host, length);
    expect(document.activeElement).toBe(chest);
  });
});
