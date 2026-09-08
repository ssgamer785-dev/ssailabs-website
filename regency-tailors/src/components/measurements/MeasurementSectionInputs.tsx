import React from 'react';
import { sectionFields, MeasurementSection } from '../../utils/garmentMeasurements';
import { measurementInputProps } from '../../utils/measurementFocus';

/**
 * One garment's measurement boxes, for entry.
 *
 * The order wizard used to write this grid out by hand once per garment. Four
 * garments meant four near-identical copies; the waistcoat, jacket, sherwani
 * and the two suits would have made twelve, and the twelfth would have been
 * the one that quietly lost a field or forgot the Enter marker. The fields
 * themselves were already canonical — this makes the markup canonical too, so
 * a garment is added by naming its section, not by copying a block.
 *
 * It renders inputs only. The heading, the icon and the surrounding card stay
 * with the caller, because the wizard and the measurement sheet frame a
 * section differently and neither should have to fight this component for it.
 */

interface MeasurementSectionInputsProps {
  section: MeasurementSection;
  values: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
  /** ±¼ inch steppers, as the wizard offers. Omitted where they do not belong. */
  onStep?: (key: string, delta: number) => void;
  columns?: 4 | 5;
  disabled?: boolean;
}

export const MeasurementSectionInputs: React.FC<MeasurementSectionInputsProps> = ({
  section,
  values,
  onChange,
  onStep,
  columns = 5,
  disabled = false
}) => (
  <div
    className={`grid grid-cols-2 sm:grid-cols-3 ${
      columns === 5 ? 'md:grid-cols-5' : 'md:grid-cols-4'
    } gap-3`}
    data-measurement-section={section}
  >
    {sectionFields(section).map(f => (
      <div key={f.key} className="space-y-1">
        <label
          htmlFor={`m-${section}-${f.key}`}
          className="text-[10px] font-bold text-[#8C7E6A] uppercase"
        >
          {f.label}
        </label>
        <div className="relative">
          <input
            id={`m-${section}-${f.key}`}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            // Marks this as part of the Enter run. Without it the handler
            // leaves the field alone, which is what keeps notes and customer
            // boxes behaving normally inside the same form.
            {...measurementInputProps}
            value={(values[f.key] as string | number | undefined) ?? ''}
            onChange={e => onChange(f.key, e.target.value)}
            className="w-full bg-[#FAF8F5] border border-[#E0D8CB] focus:border-[#C9A24A] focus:ring-2 focus:ring-[#C9A24A]/30 rounded-xl px-2.5 py-2 text-center text-sm font-extrabold text-[#071426] outline-none disabled:opacity-50"
          />
          {onStep && (
            <div className="flex justify-between mt-1 gap-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onStep(f.key, -0.25)}
                className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
              >
                -¼
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onStep(f.key, 0.25)}
                className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
              >
                +¼
              </button>
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
);
