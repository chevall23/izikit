'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { type FlagCode } from './CountryFlag';
import { PhoneCountrySelect } from './PhoneCountrySelect';
import { composePhone, dialFor, parsePhoneValue } from './dial-countries';

interface PhoneInputProps {
  /** Full number including the dial code, e.g. "+229 01 46 07 01 07" ("" when empty). */
  value: string;
  onChange: (value: string) => void;
  /** Country preselected while the field is empty. */
  defaultCountry?: FlagCode;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  /** Height / radius shared by the country button and the number box, to match the form's other fields. */
  boxClassName?: string;
  inputClassName?: string;
}

/**
 * Phone number field with a country dial-code dropdown (same look as the
 * profile settings). Emits the full number, prefix included.
 */
export function PhoneInput({
  value,
  onChange,
  defaultCountry = 'BJ',
  id,
  name,
  placeholder = '01 00 00 00 00',
  required,
  autoComplete = 'tel-national',
  boxClassName = 'min-h-12 rounded-[10px]',
  inputClassName = 'text-[15px]',
}: PhoneInputProps) {
  // Remembers the picked country while the number is still empty (an empty
  // value carries no prefix to read it back from).
  const [fallback, setFallback] = useState<FlagCode>(
    () => parsePhoneValue(value, defaultCountry).code,
  );
  const { code, local } = parsePhoneValue(value, fallback);

  return (
    <div className="flex items-stretch gap-2">
      <PhoneCountrySelect
        value={code}
        onChange={(next) => {
          setFallback(next);
          onChange(composePhone(dialFor(next), local));
        }}
        className={boxClassName}
      />
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center border-[1.5px] border-black/[0.08] bg-gray-50 focus-within:border-brand',
          boxClassName,
        )}
      >
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          required={required}
          autoComplete={autoComplete}
          value={local}
          onChange={(e) => onChange(composePhone(dialFor(code), e.target.value))}
          placeholder={placeholder}
          className={cn(
            'w-full min-w-0 bg-transparent px-3.5 text-neutral-900 outline-none placeholder:text-gray-400',
            inputClassName,
          )}
        />
      </div>
    </div>
  );
}
