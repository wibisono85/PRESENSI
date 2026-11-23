import React, { useState, useEffect } from 'react';
import { parseAndFormat24hTime } from '../utils/timeUtils';
import { Clock, AlertCircle } from 'lucide-react';

interface Time24hInputProps {
  value: string;
  onChange: (formattedValue: string, isValid: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  size?: 'sm' | 'md';
}

export const Time24hInput: React.FC<Time24hInputProps> = ({
  value,
  onChange,
  placeholder = '07:00 (atau 700, 630)',
  disabled = false,
  className = '',
  id,
  size = 'md'
}) => {
  const [inputValue, setInputValue] = useState<string>(value);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Synchronize internal text state with external prop value
  useEffect(() => {
    setInputValue(value);
    setErrorMsg(null);
  }, [value]);

  const handleBlur = () => {
    if (!inputValue.trim()) {
      setErrorMsg(null);
      onChange('', true);
      return;
    }

    const res = parseAndFormat24hTime(inputValue);
    if (res.isValid) {
      setInputValue(res.formatted);
      setErrorMsg(null);
      onChange(res.formatted, true);
    } else {
      setErrorMsg(res.error || 'Format jam salah');
      onChange(inputValue, false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    
    // Quick auto-format if user finishes typing 4 digits (e.g. 0730 -> 07:30 or 1345 -> 13:45)
    if (/^\d{4}$/.test(val)) {
      const res = parseAndFormat24hTime(val);
      if (res.isValid) {
        setInputValue(res.formatted);
        setErrorMsg(null);
        onChange(res.formatted, true);
        return;
      }
    } else if (!val.trim()) {
      setErrorMsg(null);
      onChange('', true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          id={id}
          inputMode="numeric"
          pattern="[0-9:.,]*"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`${className} ${
            size === 'sm' ? 'px-2 py-1 text-xs font-mono' : 'px-3 py-2 text-sm font-mono'
          } ${
            errorMsg
              ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/50 text-rose-900'
              : 'border-slate-300 focus:ring-[#2F5597] bg-white text-slate-800'
          } rounded-lg border font-semibold focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:opacity-60 transition-colors w-full`}
        />
        <Clock className={`absolute right-2.5 ${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-slate-400 pointer-events-none`} />
      </div>

      {errorMsg && (
        <div className="flex items-center gap-1 text-[11px] text-rose-600 font-medium mt-1 animate-in fade-in duration-100">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
